const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const TARGET = (process.env.SUB2API_TARGET || 'http://156.226.173.152:8080').replace(/\/+$/, '');
const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, 'config.js');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const CONFIG_SCHEMA = {
  apiBase: 'string',
  authToken: 'string',
  testModel: 'string',
  timeoutSec: 'number',
  pageSize: 'number',
  prompt: 'string',
  onlySchedulable: 'boolean',
  stopOnFirstFailure: 'boolean',
  autoDisable: 'boolean',
  autoEnable: 'boolean',
  preferredModels: 'array',
  scheduledCheckEnabled: 'boolean',
  scheduledIntervalMin: 'number',
  autoRefreshEnabled: 'boolean',
  autoRefreshIntervalMin: 'number',
  saveConfigToFile: 'boolean',
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify(payload));
}

function readBody(req, limit = 1024 * 256) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sanitizeConfig(input) {
  const out = {};
  for (const [key, type] of Object.entries(CONFIG_SCHEMA)) {
    const value = input?.[key];
    if (type === 'array') {
      if (Array.isArray(value)) out[key] = value.map((item) => String(item)).filter(Boolean);
    } else if (typeof value === type) {
      out[key] = value;
    }
  }
  if (out.apiBase) out.apiBase = out.apiBase.replace(/\/+$/, '');
  if (typeof out.timeoutSec === 'number') out.timeoutSec = Math.max(1, Math.floor(out.timeoutSec));
  if (typeof out.pageSize === 'number') out.pageSize = Math.min(500, Math.max(1, Math.floor(out.pageSize)));
  if (typeof out.scheduledIntervalMin === 'number') out.scheduledIntervalMin = Math.min(1440, Math.max(1, Math.floor(out.scheduledIntervalMin)));
  if (typeof out.autoRefreshIntervalMin === 'number') out.autoRefreshIntervalMin = Math.min(1440, Math.max(1, Math.floor(out.autoRefreshIntervalMin)));
  return out;
}

function serializeConfig(config) {
  return `// Sub2API 账号巡检工具默认配置\n` +
    `// 注意：authToken 写入这里后，能访问本页面的人都可以在浏览器源码中看到。\n` +
    `// 页面“系统设置”保存后会自动更新本文件。\n` +
    `window.SUB2API_CHECKER_DEFAULTS = ${JSON.stringify(config, null, 2)};\n`;
}

async function saveConfig(req, res) {
  try {
    const body = await readBody(req);
    const parsed = JSON.parse(body || '{}');
    const config = sanitizeConfig(parsed);
    fs.writeFile(CONFIG_FILE, serializeConfig(config), 'utf8', (err) => {
      if (err) return sendJson(res, 500, { code: 500, message: err.message });
      sendJson(res, 200, { code: 0, message: 'config.js saved', data: config });
    });
  } catch (err) {
    sendJson(res, 400, { code: 400, message: err.message || String(err) });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(ROOT, `.${pathname}`);
  if (!file.startsWith(ROOT) || file.includes(`${path.sep}_sub2api_repo${path.sep}`)) {
    return send(res, 403, { 'content-type': 'text/plain; charset=utf-8' }, 'Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'Not found');
    send(res, 200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }, data);
  });
}

function proxy(req, res) {
  const targetUrl = new URL(req.url, TARGET);
  const headers = { ...req.headers, host: targetUrl.host, origin: TARGET, referer: `${TARGET}/` };
  delete headers['accept-encoding'];

  const proxyReq = http.request(targetUrl, { method: req.method, headers }, (proxyRes) => {
    const responseHeaders = { ...proxyRes.headers };
    responseHeaders['access-control-allow-origin'] = '*';
    responseHeaders['access-control-allow-headers'] = 'authorization,content-type,accept,accept-language,x-requested-with,x-api-key';
    responseHeaders['access-control-allow-methods'] = 'GET,POST,PUT,DELETE,OPTIONS';
    res.writeHead(proxyRes.statusCode || 502, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    sendJson(res, 502, { code: 502, message: `Proxy error: ${err.message}` });
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    return send(res, 204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type,accept,accept-language,x-requested-with,x-api-key',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    }, '');
  }
  if (req.method === 'POST' && new URL(req.url, `http://${req.headers.host}`).pathname === '/__config') return saveConfig(req, res);
  if (req.url.startsWith('/api/v1/')) return proxy(req, res);
  return serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Sub2API checker: http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`);
  if (HOST === '0.0.0.0') console.log(`LAN/Public access: http://<server-ip>:${PORT}`);
  console.log(`Proxy target: ${TARGET}`);
  console.log('打开上面的地址，API Base 填 http://<server-ip>:' + PORT + ' 或保持默认。');
});
