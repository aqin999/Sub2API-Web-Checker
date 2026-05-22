# Sub2API Web Checker

一个用于 **Sub2API 面板账号巡检、用量查看、账号测试和调度管理** 的独立 Web 工具。

本项目不是 Sub2API 主程序本身，而是一个轻量的管理辅助面板：

- 前端页面：`index.html`、`styles.css`、`app.js`
- 默认配置：`config.js`
- 本地代理服务：`server.js`

---

## 主要功能

- 读取 Sub2API 面板账号列表
- 显示账号状态、平台、类型、套餐、调度状态
- 显示账号 5 小时用量、7 天用量
- 显示请求数、Token、账号成本、用户费用
- 支持单账号测试
- 支持单账号刷新用量
- 支持批量巡检账号
- 支持识别正常、限流、异常、封禁、禁用、锁定等状态
- 支持按状态、套餐、平台、关键词筛选
- 支持账号列表行显示 / 卡片显示切换
- 支持分页和每页条数设置
- 支持失败账号自动关闭调度
- 支持正常账号自动恢复调度
- 支持浏览器页面内定时巡检
- 支持本地代理，避免浏览器 CORS 问题

---

## 部署方式

本工具支持两种部署方式：

- **静态部署**：只托管 `index.html`、`styles.css`、`app.js`、`config.js`，页面直接请求 Sub2API 后端。适合后端已正确配置 CORS 的场景。
- **Node.js 部署**：使用 `server.js` 同时提供静态页面和 `/api/v1/*` 代理。推荐方式，可避免浏览器 CORS 问题，也支持在页面里保存配置到 `config.js`。

---

## 方式一：静态部署

### 适用场景

- 你已经有 Nginx、宝塔、Cloudflare Pages、GitHub Pages、静态文件服务器等。
- Sub2API 后端允许当前页面域名跨域访问。
- 不需要使用本项目的 Node.js 代理。

### 需要上传的文件

```text
index.html
styles.css
app.js
config.js
```

可选上传：

```text
README.md
```

不需要上传：

```text
server.js
package.json
Dockerfile
_sub2api_repo/
```

### 静态配置

编辑 `config.js`：

```js
window.SUB2API_CHECKER_DEFAULTS = {
  apiBase: 'https://your-sub2api-domain.com',
  authToken: '',
  testModel: 'gpt-5.4',
  timeoutSec: 45,
  pageSize: 100,
  prompt: 'hi',
  saveConfigToFile: false
};
```

建议静态部署时设置：

```js
saveConfigToFile: false
```

因为纯静态服务无法处理 `/__config` 写入请求，配置会保存到浏览器 `localStorage`。

### Sub2API 后端 CORS 示例

如果页面地址是：

```text
https://checker.example.com
```

Sub2API 后端需要允许该 Origin，例如：

```yaml
cors:
  allowed_origins:
    - "https://checker.example.com"
  allow_credentials: true
```

### Nginx 静态部署示例

```nginx
server {
    listen 80;
    server_name checker.example.com;

    root /var/www/sub2api-checker;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

访问：

```text
http://checker.example.com
```

页面里的 `API Base` 填 Sub2API 后端真实地址，例如：

```text
https://your-sub2api-domain.com
```

---

## 方式二：Node.js 部署（推荐）

### 适用场景

- 希望页面和接口同源，避免 CORS 问题。
- 希望通过本工具代理访问 Sub2API 后端。
- 希望页面“系统设置”保存后能自动更新 `config.js`。

### 环境要求

```text
Node.js >= 18
```

### 1. 进入项目目录

Windows PowerShell：

```powershell
cd C:\Users\Administrator\Desktop\Sub2API
```

Linux / macOS：

```bash
cd /opt/Sub2API
```

### 2. 设置 Sub2API 后端地址并启动

Windows PowerShell：

```powershell
$env:SUB2API_TARGET='http://your-sub2api-host:8080'
$env:PORT='8787'
node .\server.js
```

Linux / macOS：

```bash
SUB2API_TARGET='http://your-sub2api-host:8080' PORT=8787 node server.js
```

也可以使用 npm：

```bash
SUB2API_TARGET='http://your-sub2api-host:8080' PORT=8787 npm start
```

默认访问地址：

```text
http://127.0.0.1:8787
```

局域网或服务器访问：

```text
http://<server-ip>:8787
```

### 3. 页面配置

Node.js 代理部署时，页面里的 `API Base` 建议填写当前工具地址：

```text
http://127.0.0.1:8787
```

如果从其他机器访问，则填写：

```text
http://<server-ip>:8787
```

所有 `/api/v1/*` 请求会由 `server.js` 转发到 `SUB2API_TARGET`。

### 后台运行示例

#### pm2

```bash
npm install -g pm2
cd /opt/Sub2API
SUB2API_TARGET='http://your-sub2api-host:8080' PORT=8787 pm2 start server.js --name sub2api-checker
pm2 save
```

常用命令：

```bash
pm2 logs sub2api-checker
pm2 restart sub2api-checker
pm2 stop sub2api-checker
```

#### systemd

创建服务：

```bash
sudo nano /etc/systemd/system/sub2api-checker.service
```

内容示例：

```ini
[Unit]
Description=Sub2API Web Checker
After=network.target

[Service]
WorkingDirectory=/opt/Sub2API
ExecStart=/usr/bin/node /opt/Sub2API/server.js
Environment=HOST=0.0.0.0
Environment=PORT=8787
Environment=SUB2API_TARGET=http://your-sub2api-host:8080
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sub2api-checker
sudo systemctl status sub2api-checker
```

### 反向代理示例

```nginx
server {
    listen 80;
    server_name checker.example.com;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

此时页面 `API Base` 填：

```text
http://checker.example.com
```

---

## 重启命令

Windows PowerShell：

```powershell
cd C:\Users\Administrator\Desktop\Sub2API
$env:SUB2API_TARGET='http://your-sub2api-host:8080'
node .\server.js
```

Linux / macOS：

```bash
cd /opt/Sub2API
SUB2API_TARGET='http://your-sub2api-host:8080' node server.js
```

如果前台窗口还在运行，先按：

```text
Ctrl + C
```

再重新执行启动命令。

---

## 页面配置

打开页面后进入：

```text
系统设置 -> 连接与策略
```

填写：

```text
API Base: http://127.0.0.1:8787
Authorization: admin-xxxx
```

然后点击保存。

### Authorization 填写规则

如果是管理员 API Key：

```text
admin-xxxx
```

请求时会自动使用：

```text
x-api-key: admin-xxxx
```

如果是 Token：

```text
Bearer xxxxx
```

请求时会使用：

```text
Authorization: Bearer xxxxx
```

---

## 页面说明

### 仪表盘

仪表盘用于查看整体巡检状态。

包含：

- 账号总数
- 已处理数量
- 正常数量
- 限流数量
- 异常数量
- 已启用数量
- 已关闭数量
- 跳过数量
- 巡检进度
- 当前运行状态
- 运行日志
- 导出结果 JSON

运行日志只在仪表盘显示，账号管理页面不显示运行日志。

---

### 账号管理

账号管理用于查看和操作账号列表。

#### 筛选能力

支持以下筛选：

- 状态筛选
  - 全部
  - 正常
  - 限流
  - 封禁
  - 错误
  - 已禁用
  - 已锁定

- 套餐筛选
  - 全部
  - Pro
  - ProLite
  - Plus
  - Team
  - Free

- 平台筛选
  - 根据实际账号平台自动生成

- 搜索
  - 支持账号 ID、名称、平台、类型、状态、套餐、模型等关键词

#### 显示方式

账号列表支持两种显示方式：

- 行显示：表格列表
- 列显示：账号卡片，每行 4 个

切换按钮位于账号管理页面右上区域。

切换后会保存到浏览器本地，刷新页面后仍保持上次显示方式。

#### 账号信息

账号列表会尽量显示以下内容：

- 账号名称
- 账号 ID
- 平台
- 类型
- 套餐，例如 Free、Plus、Pro、ProLite、Team
- 调度状态
- 5 小时用量
- 7 天用量
- 请求数
- Token 数
- 账号成本
- 用户费用
- 创建 / 导入时间
- 更新时间
- 最近测试结果

其中统计信息会显示为中文，例如：

```text
请求 105
Token 14.2M
账号成本 $12.19
用户费用 $12.19
```

#### 账号操作

每个账号支持：

- 单测：测试当前账号是否可用
- 用量：刷新当前账号用量和统计

---

### 系统设置

系统设置用于配置连接、巡检策略和定时巡检。

#### 连接配置

- API Base
- Authorization

#### 巡检策略

- 测试模型
- 请求超时时间
- 分页大小
- 测试 Prompt
- 是否只检查已启用调度的账号
- 任一模型失败后是否停止后续测试
- 失败时是否自动关闭调度
- 正常时是否自动恢复调度

#### 定时巡检

支持浏览器页面保持打开时自动巡检。

可配置：

- 是否启用定时巡检
- 巡检间隔，单位分钟
- 查看下次执行时间
- 立即巡检一次

注意：定时巡检依赖当前浏览器页面。如果页面关闭、浏览器退出、电脑休眠，定时巡检不会继续执行。

---

## 数据接口

### 账号列表

```text
GET /api/v1/admin/accounts
```

工具会自动分页读取账号。

---

### 账号用量

刷新全部账号时：

```text
GET /api/v1/admin/accounts/{id}/usage?source=passive
```

点击单个账号“用量”时：

```text
GET /api/v1/admin/accounts/{id}/usage?source=active
```

用于读取：

- 5 小时用量
- 7 天用量
- 重置时间

兼容字段包括：

```text
usage.five_hour
usage.seven_day
extra.codex_5h_used_percent
extra.codex_7d_used_percent
usage_percent_5h
usage_percent_7d
openai_5h_used_percent
openai_7d_used_percent
```

---

### 账号统计

```text
GET /api/v1/admin/accounts/{id}/stats?days=30
```

用于读取：

- 请求数
- Token 数
- 账号成本
- 用户费用

优先读取：

```text
summary.total_requests
summary.total_tokens
summary.total_cost
summary.total_account_cost
summary.total_user_cost
```

也兼容：

```text
usage.summary.*
stats.summary.*
extra.usage_summary.*
total_requests
total_tokens
account_cost
user_cost
actual_cost
success_requests + error_requests
```

---

### 单账号测试

```text
POST /api/v1/admin/accounts/{id}/test
```

用于检测单个账号模型调用是否正常。

---

### 调度开关

```text
POST /api/v1/admin/accounts/{id}/schedulable
```

用于开启或关闭账号调度状态。

---

## 限流和异常判断

工具会尽量把限流和普通异常分开统计。

限流常见判断包括：

- HTTP 429
- `rate limit`
- `rate_limit`
- `too many requests`
- `限流`
- `频率`
- `请求过多`

异常常见判断包括：

- 测试失败
- 接口返回错误
- 账号被封禁
- 账号被锁定
- 账号不可调度
- 返回内容中包含明显错误信息

---

## CORS 说明

推荐使用本地代理方式：

```text
浏览器 -> http://127.0.0.1:8787 -> Sub2API 后端
```

这样页面和接口同源，通常不需要额外配置 CORS。

如果你直接跨域访问 Sub2API 后端，需要后端允许当前页面 Origin，例如：

```yaml
cors:
  allowed_origins:
    - "http://127.0.0.1:8787"
    - "http://localhost:8787"
  allow_credentials: true
```

注意：

```yaml
- "https://0.0.0.0"
```

不能表示允许全部地址。

如果要允许所有来源，一般是：

```yaml
allowed_origins:
  - "*"
```

但 `*` 通常不能和 `allow_credentials: true` 同时使用。

---

## 默认配置

默认配置文件：

```text
config.js
```

示例：

```js
window.SUB2API_CHECKER_DEFAULTS = {
  apiBase: window.location.origin,
  authToken: '',
  testModel: 'gpt-5.4',
  timeoutSec: 45,
  pageSize: 100,
  prompt: 'hi'
};
```

不要把管理员 Key 写入公开环境中的 `config.js`。

---

## 浏览器本地存储

系统设置里的连接、巡检、定时巡检、自动刷新等配置会优先写入：

```text
config.js
```

同时会保留一份到浏览器 `localStorage` 作为兜底。

浏览器本地还会保存：

- 当前页面
- 账号显示方式
- 最近巡检结果

注意：如果把 Authorization 保存到 `config.js`，能访问本页面源码的人都可以看到该 Token。

---

## 文件结构

```text
Sub2API/
├─ index.html        页面结构
├─ styles.css        页面样式
├─ app.js            页面逻辑、账号读取、用量读取、巡检逻辑
├─ config.js         默认配置
├─ server.js         本地静态服务和 API 代理
├─ README.md         项目说明
└─ _sub2api_repo/    保留的 Sub2API 源码参考
```

---

## 常用命令

### 启动

```powershell
cd C:\Users\Administrator\Desktop\Sub2API
$env:SUB2API_TARGET='http://your-sub2api-host:8080'
node .\server.js
```

### 只做语法检查

```powershell
cd C:\Users\Administrator\Desktop\Sub2API
node --check app.js
node --check server.js
```

### 查看端口是否被占用

```powershell
netstat -ano | findstr :8787
```

---

## 常见问题

### 1. 页面打不开

检查本地服务是否启动：

```powershell
node .\server.js
```

然后访问：

```text
http://127.0.0.1:8787
```

---

### 2. 点击刷新没有账号

检查：

- `SUB2API_TARGET` 是否指向正确的 Sub2API 后端
- 系统设置里的 `API Base` 是否为 `http://127.0.0.1:8787`
- Authorization 是否正确
- Sub2API 后端是否在线
- 浏览器控制台是否有 401、403、404、500 或 CORS 错误

---

### 3. 用量显示为 0

可能原因：

- Sub2API 后端没有返回对应统计字段
- 当前账号没有用量
- passive 用量没有刷新

可以点击单个账号的“用量”按钮，强制使用 active 方式读取。

---

### 4. 单测失败

检查：

- 测试模型是否存在
- 账号是否支持该模型
- 账号是否被限流
- 账号是否被封禁或锁定
- Sub2API 后端是否能正常访问上游

---

### 5. 定时巡检不执行

确认：

- 页面保持打开
- 系统设置里已启用定时巡检
- 巡检间隔设置正确
- 浏览器和电脑没有休眠

---

## 开发说明

修改前端后一般只需要刷新浏览器页面。

修改 `server.js` 后需要重启：

```powershell
Ctrl + C
node .\server.js
```

提交或使用前建议执行：

```powershell
node --check app.js
node --check server.js
```
