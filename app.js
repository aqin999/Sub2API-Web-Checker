(() => {
  'use strict';

  const STORAGE_KEY = '__sub2api_web_checker_config__';
  const RESULT_KEY = '__sub2api_web_checker_last_results__';
  const VIEW_KEY = '__sub2api_web_checker_current_view__';
  const ACCOUNT_VIEW_KEY = '__sub2api_web_checker_account_view__';
  const BUILTIN_DEFAULTS = {
    apiBase: location.origin,
    authToken: '',
    testModel: 'gpt-5.4',
    timeoutSec: 45,
    pageSize: 100,
    prompt: 'hi',
    onlySchedulable: false,
    stopOnFirstFailure: true,
    autoDisable: true,
    autoEnable: true,
    preferredModels: ['gpt-5.4', 'gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'],
    scheduledCheckEnabled: false,
    scheduledIntervalMin: 30,
    autoRefreshEnabled: false,
    autoRefreshIntervalMin: 10,
    saveConfigToFile: true,
  };
  const EXTERNAL_DEFAULTS = window.SUB2API_CHECKER_DEFAULTS && typeof window.SUB2API_CHECKER_DEFAULTS === 'object'
    ? window.SUB2API_CHECKER_DEFAULTS
    : {};
  const DEFAULTS = {
    ...BUILTIN_DEFAULTS,
    ...EXTERNAL_DEFAULTS,
    apiBase: (EXTERNAL_DEFAULTS.apiBase || BUILTIN_DEFAULTS.apiBase).replace(/\/+$/, ''),
    authToken: normalizeAuth(EXTERNAL_DEFAULTS.authToken || BUILTIN_DEFAULTS.authToken),
  };

  const $ = (id) => document.getElementById(id);
  const state = {
    config: loadConfig(),
    running: false,
    stopRequested: false,
    accounts: [],
    scheduleTimer: null,
    nextScheduledRunAt: null,
    autoRefreshTimer: null,
    nextAutoRefreshAt: null,
    results: loadResults(),
    stats: freshStats(),
    filters: { status: 'all', platform: 'all', group: 'all', plan: 'all' },
    sort: { field: '', direction: 'desc' },
    pagination: { page: 1, pageSize: 20, totalRows: 0, totalPages: 1 },
    accountView: localStorage.getItem(ACCOUNT_VIEW_KEY) || 'table',
  };

  const els = {
    sideNav: $('sideNav'), dashboardView: $('dashboardView'), accountsView: $('accountsView'),
    apiBase: $('apiBase'), authToken: $('authToken'), testModel: $('testModel'), timeoutSec: $('timeoutSec'), pageSize: $('pageSize'), prompt: $('prompt'), preferredModels: $('preferredModels'),
    onlySchedulable: $('onlySchedulable'), stopOnFirstFailure: $('stopOnFirstFailure'), autoDisable: $('autoDisable'), autoEnable: $('autoEnable'),
    configForm: $('configForm'), startBtn: $('startBtn'), stopBtn: $('stopBtn'), saveBtn: $('saveBtn'), loadAccountsBtn: $('loadAccountsBtn'), exportBtn: $('exportBtn'), searchInput: $('searchInput'), statusFilters: $('statusFilters'), platformFilter: $('platformFilter'), planTabs: $('planTabs'), filterAllCount: $('filterAllCount'), filterNormalCount: $('filterNormalCount'), filterLimitedCount: $('filterLimitedCount'), filterBannedCount: $('filterBannedCount'), filterFailedCount: $('filterFailedCount'), filterDisabledCount: $('filterDisabledCount'), filterLockedCount: $('filterLockedCount'), accountPageSize: $('accountPageSize'), prevPageBtn: $('prevPageBtn'), nextPageBtn: $('nextPageBtn'), pageSummary: $('pageSummary'), pageIndicator: $('pageIndicator'), accountViewToggle: $('accountViewToggle'), tableWrap: $('tableWrap'), cardGrid: $('cardGrid'), scheduledCheckEnabled: $('scheduledCheckEnabled'), scheduledIntervalMin: $('scheduledIntervalMin'), scheduleState: $('scheduleState'), nextRunAt: $('nextRunAt'), runScheduledNowBtn: $('runScheduledNowBtn'), autoRefreshEnabled: $('autoRefreshEnabled'), autoRefreshIntervalMin: $('autoRefreshIntervalMin'), autoRefreshState: $('autoRefreshState'), nextAutoRefreshAt: $('nextAutoRefreshAt'), runAutoRefreshNowBtn: $('runAutoRefreshNowBtn'), detailModal: $('detailModal'), detailModalClose: $('detailModalClose'), detailModalTitle: $('detailModalTitle'), detailModalSub: $('detailModalSub'), detailModalBody: $('detailModalBody'), importTimeSortIcon: $('importTimeSortIcon'),
    authState: $('authState'), runState: $('runState'), lastMessage: $('lastMessage'), progressBar: $('progressBar'), resultBody: $('resultBody'), logBox: $('logBox'),
    statTotal: $('statTotal'), statChecked: $('statChecked'), statOk: $('statOk'), statLimited: $('statLimited'), statFailed: $('statFailed'), statEnabled: $('statEnabled'), statDisabled: $('statDisabled'), statSkipped: $('statSkipped'), progressText: $('progressText'),
  };


  function switchView(view) {
    const target = view || localStorage.getItem(VIEW_KEY) || 'dashboard';
    const map = { dashboard: els.dashboardView, accounts: els.accountsView, settings: els.configForm };
    Object.entries(map).forEach(([key, el]) => {
      if (el) el.hidden = key !== target;
    });
    els.sideNav?.querySelectorAll('[data-view]').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('data-view') === target);
    });
    const titles = {
      dashboard: ['仪表盘', '查看账号巡检进度、成功/失败统计和最近运行状态'],
      accounts: ['账号管理', '账号列表显示，支持筛选、查看配额/并发并进行单账号测试'],
      settings: ['系统设置', '连接与策略配置，包括 API Base、授权、测试模型和自动调度策略'],
    };
    const [title, desc] = titles[target] || titles.dashboard;
    document.querySelector('.page-header h1').textContent = title;
    document.querySelector('.page-header .subtle').textContent = desc;
    localStorage.setItem(VIEW_KEY, target);
    if (target === 'accounts') renderTable();
  }
  function freshStats() {
    return { total: 0, checked: 0, ok: 0, limited: 0, enabled: 0, disabled: 0, skipped: 0, failed: 0 };
  }

  function storageAvailable() {
    try {
      const key = '__sub2api_checker_storage_test__';
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const legacyAuth = localStorage.getItem('__sub2api_checker_auth__') || localStorage.getItem('auth_token') || '';
      return { ...DEFAULTS, ...saved, authToken: saved.authToken || normalizeAuth(legacyAuth) };
    }
    catch { return { ...DEFAULTS }; }
  }

  function loadResults() {
    try { return JSON.parse(localStorage.getItem(RESULT_KEY) || '[]'); }
    catch { return []; }
  }

  function saveConfig(options = {}) {
    state.config = readForm();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
      localStorage.setItem('__sub2api_checker_api_base__', state.config.apiBase);
      localStorage.setItem('__sub2api_checker_auth__', state.config.authToken);
      persistConfigFile(state.config, options);
      updateScheduleTimer();
      updateAutoRefreshTimer();
      if (!options.silent) log('配置已保存', 'ok');
    } catch (err) {
      log(`配置保存失败：${err.message || err}`, 'error');
    }
    updateAuthState();
  }

  async function postConfigToEndpoint(endpoint, config) {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json().catch(() => ({}));
    if (json.code !== 0) throw new Error(json.message || '保存 config.js 失败');
    return json;
  }

  async function persistConfigFile(config, options = {}) {
    if (location.protocol === 'file:' || !config.saveConfigToFile) return;
    const endpoints = ['/__config', '/save-config.php'];
    let lastErr = null;
    for (const endpoint of endpoints) {
      try {
        await postConfigToEndpoint(endpoint, config);
        if (!options.silent) log('config.js 已更新', 'ok');
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    log(`config.js 写入失败，仅保存到浏览器：${lastErr?.message || lastErr}`, 'warn');
  }

  function saveResults() {
    localStorage.setItem(RESULT_KEY, JSON.stringify(state.results.slice(-1000)));
  }

  function normalizeAuth(value) {
    const token = String(value || '').trim();
    if (!token) return '';
    // Sub2API 管理员 API Key 形如 admin-xxxx，必须走 x-api-key，不能加 Bearer。
    if (token.toLowerCase().startsWith('admin-')) return token;
    return token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
  }

  function isAdminApiKey(value) {
    return String(value || '').trim().toLowerCase().startsWith('admin-');
  }


  function parseModelList(value) {
    return String(value || '')
      .split(/[\s,，;；]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function readForm() {
    return {
      ...state.config,
      apiBase: (els.apiBase.value || location.origin).replace(/\/+$/, ''),
      authToken: normalizeAuth(els.authToken.value),
      testModel: els.testModel.value.trim(),
      timeoutSec: Math.max(1, Number(els.timeoutSec.value || DEFAULTS.timeoutSec)),
      pageSize: Math.min(500, Math.max(1, Number(els.pageSize.value || DEFAULTS.pageSize))),
      prompt: els.prompt.value || DEFAULTS.prompt,
      preferredModels: parseModelList(els.preferredModels?.value),
      onlySchedulable: els.onlySchedulable.checked,
      stopOnFirstFailure: els.stopOnFirstFailure.checked,
      autoDisable: els.autoDisable.checked,
      autoEnable: els.autoEnable.checked,
      scheduledCheckEnabled: els.scheduledCheckEnabled.checked,
      scheduledIntervalMin: Math.min(1440, Math.max(1, Number(els.scheduledIntervalMin.value || DEFAULTS.scheduledIntervalMin))),
      autoRefreshEnabled: !!els.autoRefreshEnabled?.checked,
      autoRefreshIntervalMin: Math.min(1440, Math.max(1, Number(els.autoRefreshIntervalMin?.value || DEFAULTS.autoRefreshIntervalMin))),
    };
  }

  function fillForm() {
    const c = state.config;
    els.apiBase.value = c.apiBase;
    els.authToken.value = c.authToken;
    els.testModel.value = c.testModel;
    els.timeoutSec.value = c.timeoutSec;
    els.pageSize.value = c.pageSize;
    els.prompt.value = c.prompt;
    if (els.preferredModels) els.preferredModels.value = (c.preferredModels || DEFAULTS.preferredModels || []).join('\n');
    els.onlySchedulable.checked = c.onlySchedulable;
    els.stopOnFirstFailure.checked = c.stopOnFirstFailure;
    els.autoDisable.checked = c.autoDisable;
    els.autoEnable.checked = c.autoEnable;
    els.scheduledCheckEnabled.checked = !!c.scheduledCheckEnabled;
    els.scheduledIntervalMin.value = c.scheduledIntervalMin || DEFAULTS.scheduledIntervalMin;
    if (els.autoRefreshEnabled) els.autoRefreshEnabled.checked = !!c.autoRefreshEnabled;
    if (els.autoRefreshIntervalMin) els.autoRefreshIntervalMin.value = c.autoRefreshIntervalMin || DEFAULTS.autoRefreshIntervalMin;
    updateAuthState();
    updateScheduleState();
    updateAutoRefreshState();
  }

  function updateAuthState() {
    const ok = !!normalizeAuth(els.authToken.value || state.config.authToken);
    els.authState.textContent = ok ? '已配置 Token' : '未配置 Token';
    els.authState.className = ok ? 'pill ok' : 'pill muted';
  }



  function updateScheduleState() {
    if (!els.scheduleState) return;
    const enabled = !!(els.scheduledCheckEnabled?.checked ?? state.config.scheduledCheckEnabled);
    els.scheduleState.textContent = enabled ? '已开启' : '未开启';
    els.scheduleState.className = enabled ? 'pill ok' : 'pill muted';
    if (els.nextRunAt) els.nextRunAt.value = enabled && state.nextScheduledRunAt ? formatTime(state.nextScheduledRunAt) : '未计划';
  }

  function updateScheduleTimer() {
    if (state.scheduleTimer) {
      clearTimeout(state.scheduleTimer);
      state.scheduleTimer = null;
    }
    if (!state.config.scheduledCheckEnabled) {
      state.nextScheduledRunAt = null;
      updateScheduleState();
      return;
    }
    const intervalMs = Math.max(1, Number(state.config.scheduledIntervalMin || DEFAULTS.scheduledIntervalMin)) * 60 * 1000;
    state.nextScheduledRunAt = new Date(Date.now() + intervalMs).toISOString();
    updateScheduleState();
    state.scheduleTimer = setTimeout(async () => {
      state.scheduleTimer = null;
      if (state.running) {
        log('定时巡检触发，但当前已有任务运行，跳过本次', 'warn');
        updateScheduleTimer();
        return;
      }
      log('定时巡检开始', 'info');
      await runCheck();
      updateScheduleTimer();
    }, intervalMs);
  }


  function updateAutoRefreshState() {
    if (!els.autoRefreshState) return;
    const enabled = !!(els.autoRefreshEnabled?.checked ?? state.config.autoRefreshEnabled);
    els.autoRefreshState.textContent = enabled ? '已开启' : '未开启';
    els.autoRefreshState.className = enabled ? 'pill ok' : 'pill muted';
    if (els.nextAutoRefreshAt) els.nextAutoRefreshAt.value = enabled && state.nextAutoRefreshAt ? formatTime(state.nextAutoRefreshAt) : '未计划';
  }

  async function runAccountRefresh(options = {}) {
    if (state.running) {
      if (!options.silentSkip) log('已有任务正在运行，无法刷新账号', 'warn');
      return false;
    }
    state.stopRequested = false;
    setRunning(true);
    resetStats();
    try {
      await fetchAccounts();
      return true;
    } catch (err) {
      log(`拉取失败：${err.message || err}`, 'error');
      return false;
    } finally {
      setRunning(false);
    }
  }

  function updateAutoRefreshTimer() {
    if (state.autoRefreshTimer) {
      clearTimeout(state.autoRefreshTimer);
      state.autoRefreshTimer = null;
    }
    if (!state.config.autoRefreshEnabled) {
      state.nextAutoRefreshAt = null;
      updateAutoRefreshState();
      return;
    }
    const intervalMs = Math.max(1, Number(state.config.autoRefreshIntervalMin || DEFAULTS.autoRefreshIntervalMin)) * 60 * 1000;
    state.nextAutoRefreshAt = new Date(Date.now() + intervalMs).toISOString();
    updateAutoRefreshState();
    state.autoRefreshTimer = setTimeout(async () => {
      state.autoRefreshTimer = null;
      if (state.running) {
        log('自动刷新触发，但当前已有任务运行，跳过本次', 'warn');
        updateAutoRefreshTimer();
        return;
      }
      log('自动刷新开始', 'info');
      await runAccountRefresh({ silentSkip: true });
      updateAutoRefreshTimer();
    }, intervalMs);
  }

  function setRunning(running) {
    state.running = running;
    els.startBtn.disabled = running;
    els.loadAccountsBtn.disabled = running;
    els.runState.textContent = running ? '运行中' : '空闲';
    els.runState.className = running ? 'pill warn' : 'pill';
  }

  function setMessage(message) { els.lastMessage.textContent = message; }

  function log(message, type = 'info') {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    const span = document.createElement('span');
    span.className = `log-${type}`;
    span.textContent = line + '\n';
    if (els.logBox) {
      els.logBox.appendChild(span);
      els.logBox.scrollTop = els.logBox.scrollHeight;
    }
    setMessage(message);
    console[type === 'error' ? 'error' : 'log']('[sub2api-web-checker]', message);
  }

  function resetStats() {
    state.stats = freshStats();
    renderStats();
  }

  function computeStatsFromRows() {
    const rows = state.results || [];
    return {
      total: rows.length,
      checked: rows.filter((r) => r.status && r.status !== 'pending').length,
      ok: rows.filter((r) => r.status === 'ok' || r.healthTier === 'healthy' || r.healthTier === 'normal').length,
      limited: rows.filter((r) => r.healthTier === 'rate_limited' || r.status === 'limited').length,
      failed: rows.filter((r) => r.healthTier === 'error' || r.status === 'failed').length,
      enabled: state.stats.enabled || 0,
      disabled: rows.filter((r) => r.healthTier === 'disabled' || !r.schedulable).length,
      skipped: state.stats.skipped || 0,
    };
  }

  function renderStats() {
    const derived = computeStatsFromRows();
    const s = { ...state.stats, ...derived };
    state.stats = s;
    els.statTotal.textContent = s.total;
    els.statChecked.textContent = s.checked;
    els.statOk.textContent = s.ok;
    els.statLimited.textContent = s.limited;
    els.statFailed.textContent = s.failed;
    els.statEnabled.textContent = s.enabled;
    els.statDisabled.textContent = s.disabled;
    els.statSkipped.textContent = s.skipped;
    const pct = s.total ? Math.round((s.checked / s.total) * 100) : 0;
    els.progressBar.style.width = `${pct}%`;
    if (els.progressText) els.progressText.textContent = `${pct}%`;
  }

  async function apiFetch(pathOrUrl, options = {}) {
    const c = state.config;
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${c.apiBase}${pathOrUrl}`;
    const headers = new Headers(options.headers || {});
    if (c.authToken) {
      if (isAdminApiKey(c.authToken)) {
        if (!headers.has('x-api-key')) headers.set('x-api-key', c.authToken);
      } else if (!headers.has('Authorization')) {
        headers.set('Authorization', c.authToken);
      }
    }
    const resp = await fetch(url, { ...options, headers, credentials: 'include' });
    return resp;
  }

  async function fetchAccounts() {
    state.config = readForm();
    saveConfig();
    let page = 1;
    const items = [];
    while (true) {
      if (state.stopRequested) break;
      const url = new URL('/api/v1/admin/accounts', state.config.apiBase);
      url.searchParams.set('page', String(page));
      url.searchParams.set('page_size', String(state.config.pageSize));
      for (const k of ['platform', 'type', 'status', 'privacy_mode', 'group', 'search']) url.searchParams.set(k, '');
      url.searchParams.set('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai');
      log(`拉取账号列表第 ${page} 页`);
      const resp = await apiFetch(url.toString(), { headers: { Accept: 'application/json, text/plain, */*' } });
      if (!resp.ok) throw new Error(`账号列表请求失败：HTTP ${resp.status}`);
      const json = await resp.json();
      if (json.code !== 0) throw new Error(`账号列表返回异常：${json.message || json.code}`);
      const pageItems = json?.data?.items || [];
      items.push(...pageItems);
      const pages = Number(json?.data?.pages || 1);
      if (page >= pages || pageItems.length === 0) break;
      page += 1;
    }
    state.accounts = items;
    state.results = items.map((account) => accountToRow(account, 'pending'));
    state.stats.total = items.length;
    saveResults();
    renderStats();
    renderTable();
    await refreshAllUsageSummaries({ concurrency: 3 });
    log(`共获取 ${items.length} 个账号`, 'ok');
    return items;
  }

  function accountToRow(account, status, extra = {}) {
    const usage = getUsageWindows(account);
    return {
      id: account.id,
      name: account.name || account.extra?.email_address || account.email || '(未命名)',
      notes: account.notes || '',
      platform: account.platform || 'unknown',
      type: account.type || '-',
      plan: getPlan(account),
      accountStatus: account.status || '-',
      healthTier: getHealthTier(account),
      errorMessage: account.error_message || '',
      schedulable: !!account.schedulable,
      proxy: account.proxy?.name || (account.proxy_id ? `Proxy #${account.proxy_id}` : '直连'),
      concurrency: account.concurrency ?? '-',
      currentConcurrency: account.current_concurrency ?? 0,
      priority: account.priority ?? '-',
      quota: summarizeQuota(account),
      rateLimit: summarizeRateLimit(account),
      expiresAt: getExpiresAt(account),
      importTime: account.created_at || '',
      groups: (account.groups || []).map((g) => g.name).filter(Boolean),
      updatedAtRaw: account.updated_at || account.last_used_at || account.created_at || '',
      models: getModels(account),
      usage,
      usageSummary: getUsageSummary(account),
      tempUnschedulable: null,
      raw: account,
      status,
      action: '',
      reason: '',
      testedAt: '',
      updatedAt: new Date().toISOString(),
      ...extra,
    };
  }

  function getPlan(account) {
    const raw = account?.credentials?.plan_type || account?.extra?.plan_type || account?.plan_type || account?.credentials?.tier_id || account?.extra?.tier_id || '';
    const text = String(raw || '').toLowerCase().trim();
    if (!text) return '-';
    if (text.includes('prolite')) return 'prolite';
    if (text.includes('team')) return 'team';
    if (text.includes('plus')) return 'plus';
    if (text.includes('pro')) return 'pro';
    if (text.includes('free')) return 'free';
    return text;
  }

  function isFuture(value) {
    if (!value) return false;
    const t = Date.parse(value);
    return Number.isFinite(t) && t > Date.now();
  }

  function isRateLimitedAccount(account) {
    if (isFuture(account.rate_limit_reset_at) || isFuture(account.overload_until) || isFuture(account.temp_unschedulable_until)) return true;
    const limits = account.extra?.model_rate_limits;
    if (limits && typeof limits === 'object') {
      return Object.values(limits).some((x) => isFuture(x?.rate_limit_reset_at));
    }
    return false;
  }

  function getHealthTier(account) {
    if (isBannedAccount(account)) return 'banned';
    if (account.status === 'error' || account.error_message) return 'error';
    if (!account.schedulable) return 'disabled';
    if (isRateLimitedAccount(account)) return 'rate_limited';
    if (account.health_tier) return account.health_tier;
    return 'healthy';
  }

  function getRequest7d(account) {
    const extra = account.extra || {};
    const direct = account.requests_7d ?? account.request_7d ?? extra.requests_7d ?? extra.codex_7d_requests;
    const ok = account.success_requests_7d ?? extra.success_requests_7d ?? account.success_requests ?? 0;
    const err = account.error_requests_7d ?? extra.error_requests_7d ?? account.error_requests ?? 0;
    if (direct != null) return { ok: Number(direct) || 0, err: Number(err) || 0 };
    return { ok: Number(ok) || 0, err: Number(err) || 0 };
  }


  function getUsageSummary(account) {
    const extra = account.extra || {};
    const usage = account.usage || account.usage_info || extra.usage || {};
    const summary = account.summary || account.usage_summary || usage.summary || extra.summary || extra.usage_summary || account.usage_stats?.summary || extra.usage_stats?.summary || account.stats?.summary || extra.stats?.summary || {};
    const stats = account.stats || extra.stats || account.today_stats || extra.today_stats || {};
    const requests = firstNumber([
      summary.total_requests, summary.requests, stats.total_requests, stats.requests, usage.total_requests, usage.requests,
      account.total_requests, account.requests, account.request_count,
      extra.total_requests, extra.requests, extra.request_count,
      account.success_requests != null || account.error_requests != null ? Number(account.success_requests || 0) + Number(account.error_requests || 0) : null,
      extra.success_requests != null || extra.error_requests != null ? Number(extra.success_requests || 0) + Number(extra.error_requests || 0) : null,
    ]);
    const tokens = firstNumber([
      summary.total_tokens, summary.tokens, stats.total_tokens, stats.tokens, usage.total_tokens, usage.tokens,
      account.total_tokens, account.tokens, account.token_count,
      extra.total_tokens, extra.tokens, extra.token_count,
    ]);
    const accountCost = firstNumber([
      summary.total_cost, summary.total_account_cost, summary.account_cost, stats.total_account_cost, stats.account_cost, usage.total_account_cost, usage.account_cost,
      account.total_account_cost, account.account_cost, account.cost,
      extra.total_account_cost, extra.account_cost, extra.cost,
    ]);
    const userCost = firstNumber([
      summary.total_user_cost, summary.user_cost, stats.total_user_cost, stats.user_cost, usage.total_user_cost, usage.user_cost,
      account.total_user_cost, account.user_cost, account.actual_cost,
      extra.total_user_cost, extra.user_cost, extra.actual_cost,
      summary.total_actual_cost, stats.total_actual_cost, usage.total_actual_cost,
    ]);
    return { requests, tokens, accountCost, userCost };
  }

  function firstNumber(values) {
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue;
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  function firstValue(values) {
    for (const value of values) {
      if (value !== null && value !== undefined && value !== '') return value;
    }
    return '';
  }

  function getExpiresAt(account) {
    const extra = account?.extra || {};
    const credentials = account?.credentials || {};
    return firstValue([
      account?.expires_at,
      account?.expire_at,
      account?.expired_at,
      account?.expiration_time,
      account?.valid_until,
      credentials.expires_at,
      credentials.expire_at,
      credentials.expired_at,
      credentials.expiration_time,
      credentials.valid_until,
      extra.expires_at,
      extra.expire_at,
      extra.expired_at,
      extra.expiration_time,
      extra.valid_until,
      extra.subscription_expires_at,
      extra.plan_expires_at,
      extra.account_expires_at,
      extra.expiresAt,
      extra.expireAt,
      extra.validUntil,
    ]);
  }

  function formatExpireTime(value) {
    if (!value) return '-';
    const raw = typeof value === 'number' || /^\d+$/.test(String(value).trim()) ? Number(value) : value;
    const d = typeof raw === 'number' ? new Date(raw < 100000000000 ? raw * 1000 : raw) : new Date(raw);
    if (Number.isNaN(d.getTime())) return String(value);
    const text = d.toLocaleString('zh-CN', { hour12: false });
    if (d.getTime() < Date.now()) return `已过期 · ${text}`;
    return text;
  }

  function timeCell(value, formatter = formatTime) {
    const text = formatter(value);
    if (!text || text === '-') return '<span class="time-cell muted">-</span>';
    const normalized = String(text).replace('已过期 · ', '');
    const expiredPrefix = String(text).startsWith('已过期') ? '<span class="time-prefix">已过期</span>' : '';
    const parts = normalized.split(/\s+/);
    if (parts.length >= 2) {
      return `<span class="time-cell">${expiredPrefix}<span>${escapeHtml(parts[0])}</span><span>${escapeHtml(parts.slice(1).join(' '))}</span></span>`;
    }
    return `<span class="time-cell">${expiredPrefix}<span>${escapeHtml(text)}</span></span>`;
  }

  function expireClass(value) {
    if (!value) return '';
    const raw = typeof value === 'number' || /^\d+$/.test(String(value).trim()) ? Number(value) : value;
    const d = typeof raw === 'number' ? new Date(raw < 100000000000 ? raw * 1000 : raw) : new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const diff = d.getTime() - Date.now();
    if (diff < 0) return 'bad';
    if (diff < 7 * 24 * 3600 * 1000) return 'warn';
    return '';
  }

  function formatCompact(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0';
    if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return String(Math.round(n));
  }

  function formatMoney(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '$0.00';
    return `$${n.toFixed(2)}`;
  }

  function usageSummaryHtml(summary) {
    const s = summary || {};
    return `<div class="usage-summary">
      <span title="请求数">请求 ${escapeHtml(formatCompact(s.requests))}</span>
      <span title="Token 数">Token ${escapeHtml(formatCompact(s.tokens))}</span>
      <span title="账号成本">账号成本 ${escapeHtml(formatMoney(s.accountCost))}</span>
      <span title="用户费用">用户费用 ${escapeHtml(formatMoney(s.userCost))}</span>
    </div>`;
  }


  function getUsageWindows(account) {
    const extra = account.extra || {};
    const usageInfo = account.usage || account.usage_info || extra.usage || {};
    const five = firstUsageWindow([
      usageInfo.five_hour,
      usageInfo.fiveHour,
      account.five_hour,
      account.usage_five_hour,
      account.usage_5h,
      extra.five_hour,
      extra.usage_five_hour,
      extra.usage_5h,
      extra.codex_5h_used_percent != null ? { utilization: extra.codex_5h_used_percent, resets_at: extra.codex_5h_reset_at, remaining_seconds: extra.codex_5h_reset_after_seconds } : null,
      account.codex_5h_used_percent != null ? { utilization: account.codex_5h_used_percent, resets_at: account.codex_5h_reset_at, remaining_seconds: account.codex_5h_reset_after_seconds } : null,
      account.usage_percent_5h != null ? { utilization: account.usage_percent_5h, resets_at: account.usage_reset_5h || account.reset_at_5h } : null,
      extra.usage_percent_5h != null ? { utilization: extra.usage_percent_5h, resets_at: extra.usage_reset_5h || extra.reset_at_5h } : null,
      extra.openai_5h_used_percent != null ? { utilization: extra.openai_5h_used_percent, resets_at: extra.openai_5h_reset_at } : null,
    ]);
    const seven = firstUsageWindow([
      usageInfo.seven_day,
      usageInfo.sevenDay,
      account.seven_day,
      account.usage_seven_day,
      account.usage_7d,
      extra.seven_day,
      extra.usage_seven_day,
      extra.usage_7d,
      extra.codex_7d_used_percent != null ? { utilization: extra.codex_7d_used_percent, resets_at: extra.codex_7d_reset_at, remaining_seconds: extra.codex_7d_reset_after_seconds } : null,
      account.codex_7d_used_percent != null ? { utilization: account.codex_7d_used_percent, resets_at: account.codex_7d_reset_at, remaining_seconds: account.codex_7d_reset_after_seconds } : null,
      account.usage_percent_7d != null ? { utilization: account.usage_percent_7d, resets_at: account.usage_reset_7d || account.reset_at_7d } : null,
      extra.usage_percent_7d != null ? { utilization: extra.usage_percent_7d, resets_at: extra.usage_reset_7d || extra.reset_at_7d } : null,
      extra.openai_7d_used_percent != null ? { utilization: extra.openai_7d_used_percent, resets_at: extra.openai_7d_reset_at } : null,
    ]);
    return { fiveHour: normalizeUsageWindow(five) || { percent: 0, resetsAt: null }, sevenDay: normalizeUsageWindow(seven) || { percent: 0, resetsAt: null } };
  }

  function firstUsageWindow(items) {
    return items.find((x) => x && typeof x === 'object' && Object.keys(x).length) || null;
  }

  function normalizeUsageWindow(win) {
    if (!win) return null;
    const pct = Number(win.utilization ?? win.used_percent ?? win.percent ?? win.used ?? win.usage_percent ?? 0);
    return {
      percent: Number.isFinite(pct) ? pct : 0,
      resetsAt: win.resets_at || win.reset_at || win.resetAt || win.rate_limit_reset_at || null,
      remainingSeconds: win.remaining_seconds ?? win.reset_after_seconds ?? null,
      requests: win.window_stats?.requests ?? win.used_requests ?? null,
    };
  }

  async function fetchUsageForAccount(accountId, source = 'passive') {
    const row = state.results.find((r) => String(r.id) === String(accountId));
    if (row) { updateRow(row, { usageLoading: true }); renderTable(); }
    try {
      const resp = await apiFetch(`/api/v1/admin/accounts/${accountId}/usage?source=${encodeURIComponent(source)}`, { headers: { Accept: 'application/json, text/plain, */*' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const usage = json?.data || json;
      let statsSummary = usage.summary || null;
      try {
        const statsResp = await apiFetch(`/api/v1/admin/accounts/${accountId}/stats?days=30`, { headers: { Accept: 'application/json, text/plain, */*' } });
        if (statsResp.ok) {
          const statsJson = await statsResp.json();
          const statsData = statsJson?.data || statsJson;
          statsSummary = statsData?.summary || statsSummary;
        }
      } catch {}
      if (row) updateRow(row, { usage: { fiveHour: normalizeUsageWindow(usage.five_hour), sevenDay: normalizeUsageWindow(usage.seven_day) }, usageSummary: statsSummary ? getUsageSummary({ ...row.raw, summary: statsSummary }) : getUsageSummary({ ...row.raw, usage }), usageLoading: false, reason: usage.error || row.reason });
      renderTable(); saveResults();
      log(`账号 #${accountId} 用量已刷新`, 'ok');
    } catch (err) {
      if (row) updateRow(row, { usageLoading: false, reason: `用量获取失败：${err.message || err}` });
      renderTable();
      log(`账号 #${accountId} 用量获取失败：${err.message || err}`, 'warn');
    }
  }


  async function fetchJsonData(path, options = {}) {
    const resp = await apiFetch(path, { headers: { Accept: 'application/json, text/plain, */*', ...(options.headers || {}) }, ...(options || {}) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (json && typeof json === 'object' && json.code != null && json.code !== 0) throw new Error(json.message || `code ${json.code}`);
    return json?.data ?? json;
  }

  async function fetchAccountDetail(accountId) {
    const row = state.results.find((r) => String(r.id) === String(accountId));
    try {
      const [detail, temp] = await Promise.allSettled([
        fetchJsonData(`/api/v1/admin/accounts/${accountId}`),
        fetchJsonData(`/api/v1/admin/accounts/${accountId}/temp-unschedulable`),
      ]);
      const patch = {};
      if (detail.status === 'fulfilled') patch.raw = { ...(row?.raw || {}), ...(detail.value || {}) };
      if (temp.status === 'fulfilled') patch.tempUnschedulable = temp.value;
      if (row) updateRow(row, patch);
      const latest = state.results.find((r) => String(r.id) === String(accountId)) || { id: accountId, ...patch };
      renderTable(); saveResults();
      showAccountDetail(latest);
      log(`账号 #${accountId} 详情已读取`, 'ok');
    } catch (err) {
      log(`账号 #${accountId} 详情读取失败：${err.message || err}`, 'warn');
    }
  }

  async function postAccountAction(accountId, action) {
    const map = {
      refresh: ['/refresh', '刷新令牌'],
      clearError: ['/clear-error', '清除错误'],
      clearRateLimit: ['/clear-rate-limit', '清除限流'],
    };
    const [suffix, label] = map[action] || [];
    if (!suffix) return;
    const row = state.results.find((r) => String(r.id) === String(accountId));
    try {
      const data = await fetchJsonData(`/api/v1/admin/accounts/${accountId}${suffix}`, { method: 'POST' });
      if (row) {
        const refreshed = data && typeof data === 'object' && (data.id || data.account || data.data) ? (data.account || data.data || data) : null;
        const patch = refreshed && refreshed.id ? accountToRow(refreshed, 'pending') : {};
        updateRow(row, { ...patch, status: 'pending', action: label, reason: `${label}完成`, errorMessage: '', healthTier: patch.healthTier || (row.schedulable ? 'healthy' : 'disabled'), testedAt: new Date().toISOString() });
      }
      renderStats(); renderTable(); saveResults();
      log(`账号 #${accountId} ${label}完成`, 'ok');
    } catch (err) {
      const message = `${label}失败：${err.message || err}`;
      if (row) {
        updateRow(row, { action: label, reason: message, errorMessage: err.message || String(err), testedAt: new Date().toISOString() });
        renderStats(); renderTable(); saveResults();
      }
      log(`账号 #${accountId} ${message}`, 'warn');
    }
  }

  function detailItem(label, value, type = '') {
    return `<div class="detail-item"><span>${escapeHtml(label)}</span><strong class="${type}">${escapeHtml(value || '-')}</strong></div>`;
  }

  function showAccountDetail(row) {
    const r = row || {};
    const raw = r.raw || {};
    const temp = r.tempUnschedulable || raw.temp_unschedulable_until || raw.temp_unschedulable_reason || null;
    const tempText = typeof temp === 'object' ? JSON.stringify(temp, null, 2) : (temp || '-');
    if (!els.detailModal || !els.detailModalBody) return;
    els.detailModalTitle.textContent = r.name || raw.name || '账号详情';
    els.detailModalSub.textContent = `#${r.id || raw.id || '-'} · ${r.platform || raw.platform || '-'} / ${r.type || raw.type || '-'}`;
    els.detailModalBody.innerHTML = `
      <div class="detail-status-row">
        ${statusCell(r)}
        <span class="pill ${r.schedulable ? 'ok' : 'muted'}">${r.schedulable ? '调度启用' : '调度关闭'}</span>
        <span class="plan-badge inline">${escapeHtml(String(r.plan || getPlan(raw) || '-').toUpperCase())}</span>
      </div>
      <div class="detail-grid">
        ${detailItem('账号 ID', r.id || raw.id)}
        ${detailItem('平台', r.platform || raw.platform)}
        ${detailItem('类型', r.type || raw.type)}
        ${detailItem('代理', r.proxy || (raw.proxy?.name || (raw.proxy_id ? `Proxy #${raw.proxy_id}` : '直连')))}
        ${detailItem('分组', r.groups?.length ? r.groups.join(', ') : '未分组')}
        ${detailItem('并发', `${r.currentConcurrency ?? raw.current_concurrency ?? 0} / ${r.concurrency ?? raw.concurrency ?? '-'}`)}
        ${detailItem('优先级', r.priority ?? raw.priority ?? '-')}
        ${detailItem('过期时间', formatExpireTime(r.expiresAt || getExpiresAt(raw)), expireClass(r.expiresAt || getExpiresAt(raw)))}
        ${detailItem('导入时间', formatTime(r.importTime || raw.created_at))}
        ${detailItem('更新时间', formatTime(r.updatedAtRaw || raw.updated_at || r.updatedAt))}
      </div>
      <div class="detail-section">
        <h3>用量</h3>
        ${usageBars(r.usage, r.usageLoading)}
        ${usageSummaryHtml(r.usageSummary)}
      </div>
      <div class="detail-section">
        <h3>临时不可调度</h3>
        <pre>${escapeHtml(tempText)}</pre>
      </div>
      <div class="detail-section">
        <h3>错误信息</h3>
        <pre>${escapeHtml(r.errorMessage || raw.error_message || r.reason || '-')}</pre>
      </div>`;
    els.detailModal.hidden = false;
  }

  function closeAccountDetail() {
    if (els.detailModal) els.detailModal.hidden = true;
  }

  async function refreshAllUsageSummaries(options = {}) {
    const rows = state.results || [];
    if (!rows.length) return;
    const concurrency = Math.max(1, Math.min(4, options.concurrency || 3));
    let index = 0;
    let done = 0;
    log(`开始批量读取 ${rows.length} 个账号用量统计`);
    const worker = async () => {
      while (index < rows.length && !state.stopRequested) {
        const row = rows[index++];
        try {
          const [usageResult, statsResult] = await Promise.allSettled([
            apiFetch(`/api/v1/admin/accounts/${row.id}/usage?source=passive`, { headers: { Accept: 'application/json, text/plain, */*' } }),
            apiFetch(`/api/v1/admin/accounts/${row.id}/stats?days=30`, { headers: { Accept: 'application/json, text/plain, */*' } }),
          ]);
          let usage = null;
          if (usageResult.status === 'fulfilled' && usageResult.value.ok) {
            const json = await usageResult.value.json();
            usage = json?.data || json;
          }
          let statsSummary = null;
          if (statsResult.status === 'fulfilled' && statsResult.value.ok) {
            const json = await statsResult.value.json();
            const data = json?.data || json;
            statsSummary = data?.summary || data;
          }
          const patch = {};
          if (usage) patch.usage = { fiveHour: normalizeUsageWindow(usage.five_hour) || row.usage?.fiveHour, sevenDay: normalizeUsageWindow(usage.seven_day) || row.usage?.sevenDay };
          if (statsSummary) patch.usageSummary = getUsageSummary({ ...row.raw, summary: statsSummary });
          if (Object.keys(patch).length) updateRow(row, patch);
        } catch {}
        done += 1;
        if (done % 5 === 0 || done === rows.length) { renderTable(); saveResults(); setMessage(`用量统计读取 ${done}/${rows.length}`); }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    renderTable(); saveResults();
    log(`批量用量统计读取完成：${done}/${rows.length}`, 'ok');
  }

  function summarizeQuota(account) {
    const parts = [];
    if (account.quota_limit != null) parts.push(`总 ${fmtNum(account.quota_used || 0)}/${fmtNum(account.quota_limit)}`);
    if (account.quota_daily_limit != null) parts.push(`日 ${fmtNum(account.quota_daily_used || 0)}/${fmtNum(account.quota_daily_limit)}`);
    if (account.quota_weekly_limit != null) parts.push(`周 ${fmtNum(account.quota_weekly_used || 0)}/${fmtNum(account.quota_weekly_limit)}`);
    const cost = account.current_window_cost;
    if (cost != null) parts.push(`窗口 $${Number(cost).toFixed(3)}`);
    return parts.length ? parts.join(' · ') : '未限制';
  }

  function summarizeRateLimit(account) {
    if (account.temp_unschedulable_until && isFuture(account.temp_unschedulable_until)) return `临时不可调度至 ${formatTime(account.temp_unschedulable_until)}`;
    if (account.overload_until && isFuture(account.overload_until)) return `过载至 ${formatTime(account.overload_until)}`;
    if (account.rate_limit_reset_at && isFuture(account.rate_limit_reset_at)) return `限流重置 ${formatTime(account.rate_limit_reset_at)}`;
    if (account.error_message) return account.error_message;
    return account.status || 'active';
  }

  function fmtNum(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? '-');
    return n >= 1000000 ? `${(n / 1000000).toFixed(1)}m` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  }

  function formatTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('zh-CN', { hour12: false });
  }

  function usageBars(usage, loading = false) {
    if (loading) return '<div class="usage-loading">读取用量...</div>';
    const bars = [];
    if (usage?.fiveHour) bars.push(usageBar('5h', usage.fiveHour));
    if (usage?.sevenDay) bars.push(usageBar('7d', usage.sevenDay));
    return bars.length ? `<div class="usage-bars">${bars.join('')}</div>` : '<span class="account-id">-</span>';
  }

  function usageBar(label, win) {
    const pct = Math.max(0, Math.min(100, Number(win.percent || 0)));
    const tone = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'ok';
    return `<div class="usage-row"><span>${escapeHtml(label)}</span><div class="usage-track"><i class="${tone}" style="width:${pct}%"></i></div><b>${Number(win.percent || 0).toFixed(1)}%</b></div>${win.resetsAt ? `<div class="usage-reset">↻ ${escapeHtml(formatTime(win.resetsAt))}</div>` : ''}`;
  }

  function statusCell(row) {
    const health = row.healthTier;
    if (health === 'banned' || row.status === 'banned' || isBannedRow(row)) return `${badge('封禁', 'bad')}<div class="account-id">${escapeHtml(getBannedReason(row) || row.errorMessage || row.reason || row.accountStatus)}</div>`;
    if (health === 'error') return `${badge('错误', 'bad')}<div class="account-id">${escapeHtml(row.errorMessage || row.accountStatus)}</div>`;
    if (health === 'rate_limited') return `${badge('限流中', 'warn')}<div class="account-id">${escapeHtml(row.rateLimit)}</div>`;
    if (health === 'disabled') return `${badge('已关闭', 'muted')}<div class="account-id">${escapeHtml(row.accountStatus)}</div>`;
    return `${badge('可用', 'ok')}<div class="account-id">健康 · 并发 ${escapeHtml(row.currentConcurrency)}/${escapeHtml(row.concurrency)}</div>`;
  }

  function getModels(account) {
    const target = String(state.config.testModel || '').trim();
    if (target) return [target];

    const sources = [
      account?.credentials?.model_mapping,
      account?.extra?.model_mapping,
      account?.model_mapping,
    ];
    const keys = [];
    for (const mapping of sources) {
      if (mapping && typeof mapping === 'object') {
        for (const key of Object.keys(mapping)) {
          if (key && !keys.includes(key)) keys.push(key);
        }
      }
    }
    if (Array.isArray(account?.models)) {
      for (const model of account.models) {
        const id = typeof model === 'string' ? model : (model?.id || model?.name);
        if (id && !keys.includes(id)) keys.push(id);
      }
    }
    if (keys.length <= 1) return keys;
    const preferred = state.config.preferredModels.filter((m) => keys.includes(m));
    const rest = keys.filter((k) => !preferred.includes(k)).sort();
    return [...preferred, ...rest];
  }

  async function testModel(accountId, modelId) {
    const controller = new AbortController();
    let timer;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), state.config.timeoutSec * 1000);
    };
    try {
      resetTimer();
      const resp = await apiFetch(`/api/v1/admin/accounts/${accountId}/test`, {
        method: 'POST',
        headers: { Accept: '*/*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId, prompt: state.config.prompt }),
        signal: controller.signal,
      });
      if (!resp.ok) return { ok: false, limited: resp.status === 429, reason: `HTTP ${resp.status}` };
      const reader = resp.body?.getReader();
      if (!reader) return { ok: false, reason: `无响应流：${(await resp.text()).slice(0, 200)}` };
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        resetTimer();
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
        let splitIndex;
        while ((splitIndex = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, splitIndex);
          buffer = buffer.slice(splitIndex + 2);
          const dataLines = chunk.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim());
          for (const line of dataLines) {
            if (!line || line === '[DONE]') continue;
            let event;
            try { event = JSON.parse(line); } catch { continue; }
            if (event.type === 'error') {
              const reason = event.error || event.message || '未知错误';
              return { ok: false, limited: isRateLimitReason(reason), reason };
            }
            if (event.type === 'test_complete') return { ok: !!event.success, limited: !event.success && isRateLimitReason(event.error || event.message || event.reason || ''), reason: event.success ? 'success' : (event.error || event.message || event.reason || 'test_complete=false') };
          }
        }
      }
      return { ok: false, limited: false, reason: '响应流结束但没有 test_complete' };
    } catch (err) {
      return { ok: false, limited: false, reason: err?.name === 'AbortError' ? '请求超时' : (err?.message || String(err)) };
    } finally {
      clearTimeout(timer);
    }
  }


  function isRateLimitReason(reason) {
    const text = String(reason || '').toLowerCase();
    return text.includes('429') || text.includes('rate limit') || text.includes('rate_limit') || text.includes('too many requests') || text.includes('限流') || text.includes('频率') || text.includes('请求过多');
  }

  function isEofReason(reason) {
    const text = String(reason || '').toLowerCase();
    return text === 'eof'
      || text.includes(' eof')
      || text.includes('eof ')
      || text.includes(': eof')
      || text.includes('unexpected eof')
      || text.includes('socket hang up')
      || text.includes('connection closed')
      || text.includes('连接已关闭')
      || text.includes('连接被关闭');
  }

  async function testModelWithEofRetry(accountId, modelId, title) {
    const first = await testModel(accountId, modelId);
    if (!first.ok && isEofReason(first.reason)) {
      log(`${title} 模型 ${modelId} 返回 EOF，正在重新测试`, 'warn');
      await sleep(800);
      const second = await testModel(accountId, modelId);
      if (!second.ok && isEofReason(second.reason)) {
        second.reason = `EOF 重试后仍失败：${second.reason}`;
      } else if (second.ok) {
        log(`${title} 模型 ${modelId} EOF 重试后正常`, 'ok');
      }
      return second;
    }
    return first;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function setAccountSchedulable(accountId, schedulable) {
    const resp = await apiFetch(`/api/v1/admin/accounts/${accountId}/schedulable`, {
      method: 'POST',
      headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedulable: !!schedulable }),
    });
    if (!resp.ok) return { ok: false, limited: resp.status === 429, reason: `HTTP ${resp.status}` };
    const json = await resp.json();
    if (json.code !== 0) return { ok: false, reason: json.message || `code=${json.code}` };
    return { ok: true, data: json.data };
  }

  async function runCheck() {
    if (state.running) return log('已有任务正在运行', 'warn');
    state.stopRequested = false;
    setRunning(true);
    resetStats();
    state.results = [];
    renderTable();
    try {
      const accounts = await fetchAccounts();
      for (const account of accounts) {
        if (state.stopRequested) break;
        await checkOneAccount(account, { respectOnlySchedulable: true });
      }
      log(state.stopRequested ? '任务已按要求停止' : '巡检完成', state.stopRequested ? 'warn' : 'ok');
    } catch (err) {
      log(`运行异常：${err.message || err}`, 'error');
    } finally {
      setRunning(false);
      saveResults();
      renderTable();
    }
  }

  async function checkOneAccount(account, options = {}) {
    const title = `#${account.id} ${account.name || '(未命名)'}`;
    const row = state.results.find((r) => r.id === account.id) || accountToRow(account, 'pending');
    if (isBannedAccount(account) || isBannedRow(row)) {
      updateRow(row, {
        status: 'banned',
        healthTier: 'banned',
        action: '跳过',
        reason: getBannedReason(row) || '账号已封禁，跳过测试',
        testedAt: new Date().toISOString(),
      });
      state.stats.checked += 1; state.stats.skipped += 1; renderStats(); renderTable(); saveResults();
      log(`${title} 已封禁，跳过测试`, 'warn');
      return;
    }
    if (options.respectOnlySchedulable && state.config.onlySchedulable && !account.schedulable) {
      updateRow(row, { status: 'skipped', reason: '当前 schedulable 已关闭，按策略跳过' });
      state.stats.checked += 1; state.stats.skipped += 1; renderStats(); renderTable();
      log(`${title} 跳过：schedulable 已关闭`, 'warn');
      return;
    }
    const models = getModels(account);
    if (!models.length) {
      await handleFailure(row, account, '没有 model_mapping');
      return;
    }
    log(`${title} 开始测试 ${models.length} 个模型`);
    let accountOk = true;
    let accountLimited = false;
    let failReason = '';
    for (const model of models) {
      if (state.stopRequested) break;
      updateRow(row, { status: 'running', reason: `正在测试 ${model}` }); renderTable();
      log(`${title} 测试模型 ${model}`);
      const result = await testModelWithEofRetry(account.id, model, title);
      if (!result.ok) {
        accountOk = false;
        accountLimited = !!result.limited;
        const banned = isBannedReason(result.reason);
        failReason = `模型 ${model} ${banned ? '封禁' : (accountLimited ? '限流' : '异常')}：${result.reason}`;
        log(`${title} ${failReason}`, accountLimited ? 'warn' : 'error');
        if (state.config.stopOnFirstFailure) break;
      } else {
        log(`${title} 模型 ${model} 正常`, 'ok');
      }
    }
    if (state.stopRequested) return;
    if (accountOk) await handleSuccess(row, account);
    else if (accountLimited) await handleRateLimited(row, account, failReason);
    else if (isBannedReason(failReason)) await handleBanned(row, account, failReason);
    else await handleFailure(row, account, failReason);
  }

  async function runSingleAccount(accountId) {
    if (state.running) return log('已有任务正在运行，请等待结束后再单测', 'warn');
    state.config = readForm();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
    const account = state.accounts.find((a) => String(a.id) === String(accountId));
    if (!account) return log(`未找到账号 #${accountId}，请先点击“仅拉取账号”刷新列表`, 'error');
    const row = state.results.find((r) => String(r.id) === String(accountId)) || accountToRow(account, 'pending');
    if (isBannedAccount(account) || isBannedRow(row)) {
      updateRow(row, {
        status: 'banned',
        healthTier: 'banned',
        action: '跳过',
        reason: getBannedReason(row) || '账号已封禁，跳过测试',
        testedAt: new Date().toISOString(),
      });
      saveResults(); renderTable();
      return log(`账号 #${accountId} 已封禁，跳过测试`, 'warn');
    }
    state.stopRequested = false;
    setRunning(true);
    try {
      log(`开始单独测试账号 #${accountId}`);
      await checkOneAccount(account, { respectOnlySchedulable: false });
      log(`账号 #${accountId} 单独测试完成`, 'ok');
    } catch (err) {
      log(`账号 #${accountId} 单测异常：${err.message || err}`, 'error');
    } finally {
      setRunning(false);
      saveResults();
      renderTable();
    }
  }

  async function handleSuccess(row, account) {
    const title = `#${account.id} ${account.name || '(未命名)'}`;
    state.stats.checked += 1;
    state.stats.ok += 1;
    let action = '无';
    let reason = '全部模型正常';
    if (!account.schedulable && state.config.autoEnable) {
      const on = await setAccountSchedulable(account.id, true);
      if (on.ok) { state.stats.enabled += 1; action = '已启用 schedulable'; log(`${title} 已重新启用 schedulable`, 'ok'); }
      else { action = '启用失败'; reason += `；启用失败：${on.reason}`; log(`${title} 启用失败：${on.reason}`, 'error'); }
    } else {
      log(`${title} 全部模型正常`, 'ok');
    }
    updateRow(row, { status: 'ok', action, reason, schedulable: (!account.schedulable && state.config.autoEnable) ? true : row.schedulable, testedAt: new Date().toISOString() });
    renderStats(); renderTable(); saveResults();
  }


  async function handleRateLimited(row, account, limitReason) {
    const title = `#${account.id} ${account.name || '(未命名)'}`;
    state.stats.checked += 1;
    state.stats.limited += 1;
    const action = '保持 schedulable 不变';
    const reason = limitReason || '请求被限流';
    log(`${title} 标记为限流，不关闭 schedulable`, 'warn');
    updateRow(row, { status: 'limited', action, reason, testedAt: new Date().toISOString() });
    renderStats(); renderTable(); saveResults();
  }

  async function handleBanned(row, account, banReason) {
    const title = `#${account.id} ${account.name || '(未命名)'}`;
    state.stats.checked += 1;
    state.stats.failed += 1;
    let action = '标记封禁';
    let reason = banReason || '账号疑似被封禁';
    if (state.config.autoDisable) {
      const off = await setAccountSchedulable(account.id, false);
      if (off.ok) { state.stats.disabled += 1; action = '封禁，已关闭 schedulable'; log(`${title} 封禁，已关闭 schedulable`, 'ok'); }
      else { action = '封禁，关闭失败'; reason += `；关闭失败：${off.reason}`; log(`${title} 封禁但关闭失败：${off.reason}`, 'error'); }
    } else {
      log(`${title} 标记为封禁`, 'error');
    }
    updateRow(row, { status: 'banned', healthTier: 'banned', action, reason, schedulable: state.config.autoDisable ? false : row.schedulable, testedAt: new Date().toISOString() });
    renderStats(); renderTable(); saveResults();
  }

  async function handleFailure(row, account, failReason) {
    const title = `#${account.id} ${account.name || '(未命名)'}`;
    state.stats.checked += 1;
    state.stats.failed += 1;
    let action = '无';
    let reason = failReason;
    if (state.config.autoDisable) {
      const off = await setAccountSchedulable(account.id, false);
      if (off.ok) { state.stats.disabled += 1; action = '已关闭 schedulable'; log(`${title} 已关闭 schedulable`, 'ok'); }
      else { action = '关闭失败'; reason += `；关闭失败：${off.reason}`; log(`${title} 关闭失败：${off.reason}`, 'error'); }
    }
    updateRow(row, { status: 'failed', action, reason, schedulable: state.config.autoDisable ? false : row.schedulable, testedAt: new Date().toISOString() });
    renderStats(); renderTable(); saveResults();
  }

  function updateRow(row, patch) {
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    const idx = state.results.findIndex((r) => r.id === row.id);
    if (idx >= 0) state.results[idx] = row;
    else state.results.push(row);
  }

  function parseTimeValue(value) {
    if (!value) return 0;
    const raw = typeof value === 'number' || /^\d+$/.test(String(value).trim()) ? Number(value) : value;
    const d = typeof raw === 'number' ? new Date(raw < 100000000000 ? raw * 1000 : raw) : new Date(raw);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function sortRows(rows) {
    if (state.sort.field !== 'importTime') return rows;
    const dir = state.sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const diff = parseTimeValue(a.importTime) - parseTimeValue(b.importTime);
      if (diff) return diff * dir;
      return String(a.id || '').localeCompare(String(b.id || '')) * dir;
    });
  }

  function updateSortUI() {
    if (!els.importTimeSortIcon) return;
    els.importTimeSortIcon.textContent = state.sort.field === 'importTime' ? (state.sort.direction === 'asc' ? '↑' : '↓') : '↕';
    document.querySelectorAll('[data-sort-field]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-sort-field') === state.sort.field);
      btn.setAttribute('aria-sort', btn.getAttribute('data-sort-field') === state.sort.field ? (state.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  }

  function getFilteredRows() {
    const q = els.searchInput.value.trim().toLowerCase();
    const group = els.platformFilter?.value || state.filters.group || 'all';
    const plan = state.filters.plan || 'all';
    const statusFilter = state.filters.status || 'all';
    const rows = state.results.filter((r) => {
      if (group !== 'all' && !(r.groups || []).includes(group)) return false;
      if (plan !== 'all' && String(r.plan || '').toLowerCase() !== plan) return false;
      if (statusFilter === 'normal' && !(r.healthTier === 'healthy' || r.healthTier === 'normal' || r.status === 'ok')) return false;
      if (statusFilter === 'disabled' && r.healthTier !== 'disabled' && r.schedulable) return false;
      if (statusFilter === 'limited' && r.healthTier !== 'rate_limited' && r.status !== 'limited') return false;
      if (statusFilter === 'banned' && r.healthTier !== 'banned' && r.status !== 'banned' && !isBannedRow(r)) return false;
      if (statusFilter === 'locked' && !r.raw?.locked && !r.locked) return false;
      if (statusFilter === 'failed' && r.healthTier !== 'error' && r.status !== 'failed') return false;
      if (!q) return true;
      const haystack = [r.id, r.name, r.notes, r.platform, r.type, r.plan, r.expiresAt, formatExpireTime(r.expiresAt), r.accountStatus, r.healthTier, r.proxy, r.quota, r.rateLimit, r.status, r.action, r.reason, ...(r.models || [])];
      return haystack.some((v) => String(v || '').toLowerCase().includes(q));
    });
    return sortRows(rows);
  }

  function isBannedRow(r) {
    return r.healthTier === 'banned' || r.status === 'banned' || isBannedReason(`${r.accountStatus || ''} ${r.errorMessage || ''} ${r.rateLimit || ''} ${r.reason || ''} ${r.action || ''} ${flattenForSearch(r.raw)}`);
  }

  function isBannedAccount(account) {
    return isBannedReason(flattenForSearch({
      status: account?.status,
      error_message: account?.error_message,
      last_error: account?.last_error,
      rate_limit_reason: account?.rate_limit_reason,
      extra: account?.extra,
    }));
  }

  function isBannedReason(reason) {
    const text = String(reason || '').toLowerCase();
    return text.includes('account_deactivated')
      || text.includes('account has been deactivated')
      || text.includes('token_invalidated')
      || text.includes('authentication token has been invalidated')
      || text.includes('deactivated')
      || text.includes('unauthorized')
      || text.includes('banned')
      || text.includes('封禁')
      || text.includes('forbidden')
      || text.includes('violation');
  }

  function getBannedReason(row) {
    const text = `${row.reason || ''} ${row.errorMessage || ''} ${row.accountStatus || ''} ${flattenForSearch(row.raw)}`;
    if (String(text).toLowerCase().includes('account_deactivated')) return 'OpenAI 账号已停用';
    if (String(text).toLowerCase().includes('account has been deactivated')) return 'OpenAI 账号已停用';
    if (String(text).toLowerCase().includes('token_invalidated')) return '认证 Token 已失效';
    if (String(text).toLowerCase().includes('authentication token has been invalidated')) return '认证 Token 已失效';
    return row.reason || row.errorMessage || row.accountStatus || '账号疑似被封禁';
  }

  function flattenForSearch(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  }

  function renderTable() {
    updateFilterCounts();
    updateSortUI();
    updateGroupOptions();
    updatePlanOptions();
    const rows = getFilteredRows();
    const p = state.pagination;
    p.totalRows = rows.length;
    p.totalPages = Math.max(1, Math.ceil(rows.length / p.pageSize));
    if (p.page > p.totalPages) p.page = p.totalPages;
    if (p.page < 1) p.page = 1;
    const startIdx = rows.length ? (p.page - 1) * p.pageSize : 0;
    const pageRows = rows.slice(startIdx, startIdx + p.pageSize);
    updatePaginationUI(startIdx, pageRows.length);
    renderAccountView(pageRows);
  }

  function renderAccountView(rows) {
    const isCards = state.accountView === 'cards';
    if (els.tableWrap) els.tableWrap.hidden = isCards;
    if (els.cardGrid) els.cardGrid.hidden = !isCards;
    els.accountViewToggle?.querySelectorAll('[data-account-view]').forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-account-view') === state.accountView));
    if (!rows.length) {
      const emptyHtml = '<tr class="empty"><td colspan="9">暂无匹配账号。请刷新账号或调整过滤条件。</td></tr>';
      els.resultBody.innerHTML = emptyHtml;
      if (els.cardGrid) els.cardGrid.innerHTML = '<div class="card-empty">暂无匹配账号。请刷新账号或调整过滤条件。</div>';
      return;
    }
    if (isCards) {
      els.resultBody.innerHTML = '';
      els.cardGrid.innerHTML = rows.map(renderAccountCard).join('');
      return;
    }
    if (els.cardGrid) els.cardGrid.innerHTML = '';
    els.resultBody.innerHTML = rows.map((r) => `
      <tr>
        <td>
          <div class="account-name">${escapeHtml(r.name)}</div>
          <div class="account-id">#${escapeHtml(r.id)}</div>
          <div class="account-id">${escapeHtml(r.platform)} / ${escapeHtml(r.type)}</div>
        </td>
        <td><strong>${escapeHtml(r.plan)}</strong><div class="account-id">${escapeHtml(r.groups?.length ? r.groups.join(', ') : '未分组')}</div></td>
        <td>${statusCell(r)}</td>
        <td>${usageBars(r.usage, r.usageLoading)}</td>
        <td>${usageSummaryHtml(r.usageSummary)}</td>
        <td>${timeCell(r.importTime)}</td>
        <td>${timeCell(r.updatedAtRaw || r.updatedAt)}</td>
        <td><span class="${escapeHtml(expireClass(r.expiresAt))}">${timeCell(r.expiresAt, formatExpireTime)}</span></td>
        <td class="actions-cell">
          <div class="action-buttons two-line">
            <button class="btn mini" type="button" data-account-detail="${escapeHtml(r.id)}">详情</button>
            <button class="btn mini" type="button" data-single-test="${escapeHtml(r.id)}">测试</button>
            <button class="btn mini ghost" type="button" data-fetch-usage="${escapeHtml(r.id)}">用量</button>
            <button class="btn mini ghost" type="button" data-refresh-token="${escapeHtml(r.id)}">刷新令牌</button>
            <button class="btn mini ghost" type="button" data-clear-error="${escapeHtml(r.id)}">清错</button>
            <button class="btn mini ghost" type="button" data-clear-rate-limit="${escapeHtml(r.id)}">清限流</button>
          </div>
          <div class="action-text">${rowActionText(r)}</div>
        </td>
      </tr>`).join('');
  }

  function formatActionTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleTimeString('zh-CN', { hour12: false });
  }

  function compactActionMessage(r) {
    const text = String(r.reason || r.action || '').trim();
    if (!text) return '';
    if (text.includes('刷新令牌完成')) return '刷新成功';
    if (text.includes('刷新令牌失败')) return text.replace('刷新令牌失败', '刷新失败');
    if (text.includes('清除错误完成')) return '清错完成';
    if (text.includes('清除错误失败')) return text.replace('清除错误失败', '清错失败');
    if (text.includes('清除限流完成')) return '清限流完成';
    if (text.includes('清除限流失败')) return text.replace('清除限流失败', '清限流失败');
    return text;
  }

  function rowActionText(r) {
    const message = compactActionMessage(r);
    const time = r.testedAt ? formatActionTime(r.testedAt) : '未测试';
    const detail = message ? `${message} · ${time}` : time;
    return `${statusBadge(r.status)} <span class="action-message" title="${escapeHtml(r.reason || detail)}">${escapeHtml(detail)}</span>`;
  }

  function renderAccountCard(r) {
    return `
      <article class="account-card ${cardToneClass(r)}">
        <div class="account-card-head">
          <div class="card-title" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</div>
          <span class="plan-badge">${escapeHtml(String(r.plan || '-').toUpperCase())}</span>
        </div>
        <div class="card-subline">#${escapeHtml(r.id)} · ${escapeHtml(r.platform)} / ${escapeHtml(r.type)}</div>
        ${usageSummaryHtml(r.usageSummary)}
        <div class="card-usage-block">${cardUsageBars(r.usage, r.usageLoading)}</div>
        <div class="card-footer">
          <div class="card-meta-row"><span>${escapeHtml(formatTime(r.importTime))}</span><span>${escapeHtml(r.groups?.length ? r.groups.join(', ') : '未分组')}</span></div>
          <div class="card-meta-row"><span class="${escapeHtml(expireClass(r.expiresAt))}">过期：${escapeHtml(formatExpireTime(r.expiresAt))}</span></div>
          <div class="card-actions">
            <button class="icon-btn" type="button" data-account-detail="${escapeHtml(r.id)}" title="详情">i</button>
            <button class="icon-btn" type="button" data-single-test="${escapeHtml(r.id)}" title="单账号测试">▶</button>
            <button class="icon-btn" type="button" data-fetch-usage="${escapeHtml(r.id)}" title="刷新该账号用量">↻</button>
            <button class="icon-btn" type="button" data-clear-error="${escapeHtml(r.id)}" title="清除错误">×</button>
          </div>
        </div>
      </article>`;
  }

  function cardToneClass(r) {
    if (r.healthTier === 'banned' || r.status === 'banned' || isBannedRow(r)) return 'danger';
    if (r.healthTier === 'error' || r.status === 'failed') return 'danger';
    if (r.healthTier === 'rate_limited' || r.status === 'limited') return 'warn';
    if (r.status === 'ok' || r.healthTier === 'healthy') return 'active';
    return '';
  }

  function cardUsageBars(usage, loading) {
    if (loading) return '<div class="usage-loading">读取用量...</div>';
    const five = usage?.fiveHour || { percent: 0, resetsAt: null };
    const seven = usage?.sevenDay || { percent: 0, resetsAt: null };
    return `${cardUsageBar('5小时配额', five)}${cardUsageBar('周配额', seven)}`;
  }

  function cardUsageBar(label, win) {
    const raw = Number(win?.percent || 0);
    const pct = Math.max(0, Math.min(100, raw));
    const tone = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'ok';
    return `<div class="card-usage-row"><div class="card-usage-label"><span>${escapeHtml(label)}</span><b class="${tone}">${raw.toFixed(1)}%</b></div><div class="card-track"><i class="${tone}" style="width:${pct}%"></i></div><div class="card-reset">重置：${escapeHtml(win?.resetsAt ? formatTime(win.resetsAt) : '-')}</div></div>`;
  }

  function updatePaginationUI(startIdx, count) {
    if (!els.pageSummary) return;
    const total = state.pagination.totalRows;
    const from = total ? startIdx + 1 : 0;
    const to = total ? startIdx + count : 0;
    els.pageSummary.textContent = `显示 ${from}-${to} / 共 ${total} 条`;
    els.pageIndicator.textContent = `第 ${state.pagination.page} / ${state.pagination.totalPages} 页`;
    els.prevPageBtn.disabled = state.pagination.page <= 1;
    els.nextPageBtn.disabled = state.pagination.page >= state.pagination.totalPages;
    if (els.accountPageSize.value !== String(state.pagination.pageSize)) els.accountPageSize.value = String(state.pagination.pageSize);
  }

  function getRowsForStatusCounts() {
    const q = els.searchInput?.value.trim().toLowerCase() || '';
    const group = els.platformFilter?.value || state.filters.group || 'all';
    const plan = state.filters.plan || 'all';
    return state.results.filter((r) => {
      if (group !== 'all' && !(r.groups || []).includes(group)) return false;
      if (plan !== 'all' && String(r.plan || '').toLowerCase() !== plan) return false;
      if (!q) return true;
      const haystack = [r.id, r.name, r.notes, r.platform, r.type, r.plan, r.expiresAt, formatExpireTime(r.expiresAt), r.accountStatus, r.healthTier, r.proxy, r.quota, r.rateLimit, r.status, r.action, r.reason, ...(r.models || [])];
      return haystack.some((v) => String(v || '').toLowerCase().includes(q));
    });
  }

  function updateFilterCounts() {
    if (!els.filterAllCount) return;
    const rows = getRowsForStatusCounts();
    els.filterAllCount.textContent = rows.length;
    els.filterNormalCount.textContent = rows.filter((r) => r.healthTier === 'healthy' || r.healthTier === 'normal' || r.status === 'ok').length;
    els.filterLimitedCount.textContent = rows.filter((r) => r.healthTier === 'rate_limited' || r.status === 'limited').length;
    els.filterBannedCount.textContent = rows.filter(isBannedRow).length;
    els.filterFailedCount.textContent = rows.filter((r) => r.healthTier === 'error' || r.status === 'failed').length;
    els.filterDisabledCount.textContent = rows.filter((r) => r.healthTier === 'disabled' || !r.schedulable).length;
    els.filterLockedCount.textContent = rows.filter((r) => r.raw?.locked || r.locked).length;
  }

  function updateGroupOptions() {
    if (!els.platformFilter) return;
    const current = els.platformFilter.value || 'all';
    const groups = [...new Set(state.results.flatMap((r) => (r.groups?.length ? r.groups : ['未分组']).map(String)))].sort();
    const html = '<option value="all">全部分组</option>' + groups.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    if (els.platformFilter.dataset.options !== html) {
      els.platformFilter.innerHTML = html;
      els.platformFilter.value = groups.includes(current) ? current : 'all';
      els.platformFilter.dataset.options = html;
    }
  }

  function updatePlanOptions() {
    if (!els.planTabs) return;
    els.planTabs.querySelectorAll('[data-plan-filter]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-plan-filter') === (state.filters.plan || 'all'));
    });
  }

  function badge(text, type = '') { return `<span class="pill ${type}">${escapeHtml(text)}</span>`; }
  function statusBadge(status) {
    const map = { pending: ['待处理', 'muted'], running: ['测试中', 'warn'], ok: ['正常', 'ok'], limited: ['限流', 'warn'], banned: ['封禁', 'bad'], failed: ['异常', 'bad'], skipped: ['跳过', 'muted'] };
    const [text, type] = map[status] || [status || '未知', 'muted'];
    return badge(text, type);
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  function exportResults() {
    const payload = { exportedAt: new Date().toISOString(), config: { ...state.config, authToken: state.config.authToken ? '***' : '' }, stats: state.stats, results: state.results };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sub2api-check-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  els.sideNav?.addEventListener('click', (event) => { const link = event.target.closest('[data-view]'); if (!link) return; switchView(link.getAttribute('data-view')); });
  els.configForm.addEventListener('submit', (e) => { e.preventDefault(); saveConfig(); });
  els.startBtn.addEventListener('click', runCheck);
  els.stopBtn.addEventListener('click', () => { state.stopRequested = true; log('已请求停止，当前请求结束后退出', 'warn'); });
  els.loadAccountsBtn.addEventListener('click', () => runAccountRefresh());
  els.exportBtn.addEventListener('click', exportResults);
  els.searchInput.addEventListener('input', () => { state.pagination.page = 1; renderTable(); });
  els.statusFilters?.addEventListener('click', (event) => { const btn = event.target.closest('[data-filter-status]'); if (!btn) return; state.filters.status = btn.getAttribute('data-filter-status') || 'all'; state.pagination.page = 1; els.statusFilters.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn)); renderTable(); });
  els.platformFilter?.addEventListener('change', () => { state.filters.group = els.platformFilter.value || 'all'; state.pagination.page = 1; renderTable(); });
  els.planTabs?.addEventListener('click', (event) => { const btn = event.target.closest('[data-plan-filter]'); if (!btn) return; state.filters.plan = btn.getAttribute('data-plan-filter') || 'all'; state.pagination.page = 1; renderTable(); });
  els.accountViewToggle?.addEventListener('click', (event) => { const btn = event.target.closest('[data-account-view]'); if (!btn) return; state.accountView = btn.getAttribute('data-account-view') || 'table'; localStorage.setItem(ACCOUNT_VIEW_KEY, state.accountView); renderTable(); });
  els.tableWrap?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-sort-field]');
    if (!btn) return;
    const field = btn.getAttribute('data-sort-field');
    state.sort.direction = state.sort.field === field && state.sort.direction === 'desc' ? 'asc' : 'desc';
    state.sort.field = field;
    state.pagination.page = 1;
    renderTable();
  });
  els.accountPageSize?.addEventListener('change', () => { state.pagination.pageSize = Number(els.accountPageSize.value || 20); state.pagination.page = 1; renderTable(); });
  els.prevPageBtn?.addEventListener('click', () => { state.pagination.page -= 1; renderTable(); });
  els.nextPageBtn?.addEventListener('click', () => { state.pagination.page += 1; renderTable(); });
  els.accountsView?.addEventListener('click', (event) => {
    const detailBtn = event.target.closest('[data-account-detail]');
    if (detailBtn) return fetchAccountDetail(detailBtn.getAttribute('data-account-detail'));
    const usageBtn = event.target.closest('[data-fetch-usage]');
    if (usageBtn) return fetchUsageForAccount(usageBtn.getAttribute('data-fetch-usage'), 'active');
    const refreshTokenBtn = event.target.closest('[data-refresh-token]');
    if (refreshTokenBtn) return postAccountAction(refreshTokenBtn.getAttribute('data-refresh-token'), 'refresh');
    const clearErrBtn = event.target.closest('[data-clear-error]');
    if (clearErrBtn) return postAccountAction(clearErrBtn.getAttribute('data-clear-error'), 'clearError');
    const clearLimitBtn = event.target.closest('[data-clear-rate-limit]');
    if (clearLimitBtn) return postAccountAction(clearLimitBtn.getAttribute('data-clear-rate-limit'), 'clearRateLimit');
    const btn = event.target.closest('[data-single-test]');
    if (!btn) return;
    runSingleAccount(btn.getAttribute('data-single-test'));
  });
  els.detailModalClose?.addEventListener('click', closeAccountDetail);
  els.detailModal?.addEventListener('click', (event) => { if (event.target === els.detailModal) closeAccountDetail(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAccountDetail(); });
  const autoSaveConfig = () => saveConfig({ silent: true });
  ['change', 'blur'].forEach((eventName) => {
    els.apiBase.addEventListener(eventName, autoSaveConfig);
    els.authToken.addEventListener(eventName, autoSaveConfig);
    els.testModel.addEventListener(eventName, autoSaveConfig);
    els.timeoutSec.addEventListener(eventName, autoSaveConfig);
    els.pageSize.addEventListener(eventName, autoSaveConfig);
    els.prompt.addEventListener(eventName, autoSaveConfig);
    els.preferredModels?.addEventListener(eventName, autoSaveConfig);
    els.scheduledIntervalMin.addEventListener(eventName, autoSaveConfig);
    els.autoRefreshIntervalMin?.addEventListener(eventName, autoSaveConfig);
  });
  [els.onlySchedulable, els.stopOnFirstFailure, els.autoDisable, els.autoEnable, els.scheduledCheckEnabled, els.autoRefreshEnabled].filter(Boolean).forEach((el) => el.addEventListener('change', autoSaveConfig));
  els.authToken.addEventListener('input', updateAuthState);
  els.runScheduledNowBtn?.addEventListener('click', async () => { saveConfig({ silent: true }); if (state.running) return log('已有任务正在运行，无法立即触发定时巡检', 'warn'); log('手动触发定时巡检', 'info'); await runCheck(); updateScheduleTimer(); });
  els.runAutoRefreshNowBtn?.addEventListener('click', async () => { saveConfig({ silent: true }); log('手动触发自动刷新', 'info'); await runAccountRefresh(); updateAutoRefreshTimer(); });

  fillForm();
  renderStats();
  renderTable();
  switchView(localStorage.getItem(VIEW_KEY) || 'dashboard');
  updateScheduleTimer();
  updateAutoRefreshTimer();
  log('工具已就绪。请确认 API Base 和 Authorization 后开始。');
})();






