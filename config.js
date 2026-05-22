// Sub2API 账号巡检工具默认配置
// 注意：authToken 写入这里后，能访问本页面的人都可以在浏览器源码中看到。
// 页面“系统设置”保存后会自动更新本文件。
window.SUB2API_CHECKER_DEFAULTS = {
  "apiBase": window.location.origin,
  "authToken": "",
  "testModel": "gpt-5.4",
  "timeoutSec": 45,
  "pageSize": 100,
  "prompt": "hi",
  "onlySchedulable": false,
  "stopOnFirstFailure": true,
  "autoDisable": true,
  "autoEnable": true,
  "preferredModels": [
    "gpt-5.4",
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4.1",
    "gpt-4.1-mini"
  ],
  "scheduledCheckEnabled": false,
  "scheduledIntervalMin": 30,
  "autoRefreshEnabled": false,
  "autoRefreshIntervalMin": 10,
  "saveConfigToFile": true
};
