# Sub2API Web Checker 静态网站部署与使用说明

本文档只说明如何把本项目作为 **静态网站** 上传部署，以及如何在 Sub2API 中配置 CORS，让浏览器可以直接访问 Sub2API API。

适用部署方式：

- 宝塔面板静态网站
- 1Panel 静态网站
- Nginx / OpenResty 静态站点

---

## 一、需要上传的文件

静态部署只需要上传以下文件：

```text
index.html
styles.css
app.js
config.js
README.md
DEPLOY.md
```

如果只是部署页面，不需要上传：

```text
server.js
```

说明：

- `index.html`：页面入口
- `styles.css`：页面样式
- `app.js`：页面逻辑
- `config.js`：默认配置
- `README.md`：项目说明
- `DEPLOY.md`：部署说明

---

## 二、静态部署后的访问方式

假设部署域名为：

```text
https://checker.example.com
```

页面访问：

```text
https://checker.example.com
```

然后在页面中进入：

```text
系统设置 -> 连接与策略
```

填写：

```text
API Base: https://你的-sub2api-api域名
Authorization: admin-xxxx
```

例如：

```text
API Base: https://api.example.com
Authorization: admin-xxxxxxxx
```

---

## 三、宝塔面板部署示例

### 1. 创建静态网站

进入宝塔面板：

```text
网站 -> 添加站点
```

示例：

```text
域名：checker.example.com
根目录：/www/wwwroot/checker.example.com
PHP版本：纯静态
数据库：不创建
```

创建后进入站点根目录：

```text
/www/wwwroot/checker.example.com
```

---

### 2. 上传文件

把项目中的这些文件上传到网站根目录：

```text
index.html
styles.css
app.js
config.js
README.md
DEPLOY.md
```

上传后目录类似：

```text
/www/wwwroot/checker.example.com/
├─ index.html
├─ styles.css
├─ app.js
├─ config.js
├─ README.md
└─ DEPLOY.md
```

---

### 3. 设置默认文档

宝塔一般默认支持 `index.html`。

如果访问空白或 404，检查：

```text
网站 -> 设置 -> 默认文档
```

确认包含：

```text
index.html
```

---

### 4. 配置 HTTPS

宝塔面板中进入：

```text
网站 -> checker.example.com -> SSL
```

可选择：

- Let's Encrypt
- 商业证书
- 自签证书，不推荐公网使用

开启后访问：

```text
https://checker.example.com
```

---

### 5. 推荐添加访问认证

因为页面里可能保存管理员 API Key，建议给该站点加访问限制。

宝塔可使用：

```text
网站 -> 设置 -> 访问限制
```

添加用户名和密码。

---

## 四、1Panel 面板部署示例

### 1. 创建静态网站

进入 1Panel：

```text
网站 -> 创建网站
```

选择：

```text
运行环境：静态网站
主域名：checker.example.com
网站目录：/opt/1panel/apps/openresty/openresty/www/sites/checker.example.com/index
```

不同版本 1Panel 的目录可能略有不同，以面板显示为准。

---

### 2. 上传文件

进入网站目录，上传：

```text
index.html
styles.css
app.js
config.js
README.md
DEPLOY.md
```

目录示例：

```text
checker.example.com/index/
├─ index.html
├─ styles.css
├─ app.js
├─ config.js
├─ README.md
└─ DEPLOY.md
```

---

### 3. 配置 HTTPS

进入：

```text
网站 -> checker.example.com -> HTTPS
```

申请或上传 SSL 证书。

开启后访问：

```text
https://checker.example.com
```

---

### 4. 推荐添加访问认证

进入网站设置，开启：

```text
访问限制 / Basic Auth
```

设置用户名和密码。

如果当前 1Panel 版本没有图形化入口，也可以在 OpenResty/Nginx 配置里添加 Basic Auth。

---

## 五、Sub2API 添加 CORS 配置

静态部署时，浏览器会从：

```text
https://checker.example.com
```

直接请求 Sub2API API，例如：

```text
https://api.example.com/api/v1/admin/accounts
```

这属于跨域访问，所以 Sub2API 必须允许 Web Checker 的 Origin。

---

### 1. 推荐 CORS 配置

在 Sub2API 配置文件中添加或修改：

```yaml
cors:
  allowed_origins:
    - "https://checker.example.com"
  allow_credentials: true
```

如果你同时使用 HTTP 和 HTTPS：

```yaml
cors:
  allowed_origins:
    - "http://checker.example.com"
    - "https://checker.example.com"
  allow_credentials: true
```

如果本地调试也要允许：

```yaml
cors:
  allowed_origins:
    - "http://127.0.0.1:8787"
    - "http://localhost:8787"
    - "https://checker.example.com"
  allow_credentials: true
```

---

### 2. 不能用 0.0.0.0 表示全部来源

下面这种写法不表示允许全部地址：

```yaml
cors:
  allowed_origins:
    - "https://0.0.0.0"
```

`0.0.0.0` 是监听地址概念，不是浏览器 Origin 通配。

---

### 3. 如果要允许全部来源

通常写法是：

```yaml
cors:
  allowed_origins:
    - "*"
  allow_credentials: false
```

注意：

```text
* 通常不能和 allow_credentials: true 同时使用
```

如果你需要带 Cookie 或凭据，请使用明确域名：

```yaml
cors:
  allowed_origins:
    - "https://checker.example.com"
  allow_credentials: true
```

---

### 4. 修改 CORS 后需要重启 Sub2API

修改配置后，重启 Sub2API 服务。

Docker Compose 示例：

```bash
docker compose restart
```

systemd 示例：

```bash
sudo systemctl restart sub2api
```

1Panel / 宝塔 Docker 部署，则在容器管理里重启对应容器。

---

## 六、页面配置说明

打开部署好的页面后，进入：

```text
系统设置 -> 连接与策略
```

### API Base

填写 Sub2API API 地址。

示例：

```text
https://api.example.com
```

不要填写 Web Checker 自己的地址，除非你使用了代理服务。

静态部署时一般应该填写 Sub2API 后端地址。

---

### Authorization

填写 Sub2API 管理员 API Key：

```text
admin-xxxx
```

页面会自动以请求头发送：

```text
x-api-key: admin-xxxx
```

如果填写 Bearer Token：

```text
Bearer xxxxx
```

页面会以请求头发送：

```text
Authorization: Bearer xxxxx
```

---

### 测试模型

用于账号巡检和单账号测试。

示例：

```text
gpt-5.4
```

为空时，会尽量使用账号自身的模型映射。

---

### 优先模型列表

可配置多个模型，支持换行、逗号、空格分隔。

示例：

```text
gpt-5.4
gpt-4o-mini
gpt-4o
gpt-4.1
gpt-4.1-mini
```

巡检时会优先使用这里配置的模型。

---

### 单模型超时

每个模型测试请求的最大等待时间，单位秒。

示例：

```text
45
```

---

### 分页大小

读取账号列表时每页请求数量。

示例：

```text
100
```

账号很多时可以提高，但不建议超过后端承受范围。

---

### 测试 Prompt

单账号测试时发送的测试内容。

示例：

```text
hi
```

---

### 巡检策略

支持：

- 仅检查已启用 `schedulable` 的账号
- 单账号任一模型失败即停止后续模型
- 失败时自动关闭 `schedulable`
- 正常且当前关闭时自动重新启用 `schedulable`

---

### 定时巡检

浏览器页面保持打开时，按间隔自动执行“开始巡检”。

可配置：

- 是否启用
- 巡检间隔，单位分钟
- 下次执行时间
- 立即巡检一次

注意：页面关闭、浏览器退出、电脑休眠后不会继续执行。

---

### 自动刷新

浏览器页面保持打开时，按间隔自动执行“刷新”。

会重新读取：

- 账号列表
- 用量统计
- 状态信息

注意：如果正在巡检，会跳过本次自动刷新，避免任务重叠。

---

## 七、功能说明与使用方法

### 1. 仪表盘

仪表盘用于查看整体状态。

显示内容：

- 账号总数
- 已处理账号
- 正常账号
- 限流账号
- 异常账号
- 已启用账号
- 已关闭账号
- 跳过账号
- 巡检进度
- 当前运行状态
- 运行日志

常用操作：

- 点击右上角“刷新”：只读取账号列表和用量
- 点击“开始巡检”：读取账号并测试账号可用性
- 点击“停止”：请求停止当前巡检任务
- 点击“导出结果 JSON”：导出当前结果

---

### 2. 账号管理

账号管理用于查看账号列表和操作单个账号。

支持：

- 状态筛选
- 套餐筛选
- 平台筛选
- 搜索账号
- 分页
- 每页条数设置
- 行显示 / 列显示切换

账号显示内容：

- 账号名称
- 账号 ID
- 平台
- 类型
- 套餐，例如 Free、Plus、Pro
- 状态
- 5 小时用量
- 7 天用量
- 请求数
- Token
- 账号成本
- 用户费用
- 导入时间
- 更新时间

账号操作：

- 详情：查看账号详情、用量、临时不可调度信息、错误信息
- 测试：单独测试该账号
- 用量：刷新该账号用量和统计
- 清错：调用 Sub2API 清除账号错误
- 清限流：行显示中可用，用于清除账号限流状态

---

### 3. 系统设置

系统设置用于配置连接、授权和策略。

主要配置：

- API Base
- Authorization
- 测试模型
- 优先模型列表
- 单模型超时
- 分页大小
- 测试 Prompt
- 巡检策略
- 定时巡检
- 自动刷新

保存后配置会保存在浏览器本地。

如果你使用的是带 `server.js` 的本地代理模式，保存时也会尝试写入 `config.js`。

静态网站部署时，浏览器不能直接写服务器文件，所以 `config.js` 不会被页面自动改写。

---

## 八、静态部署注意事项

### 1. 静态部署不能自动写入 config.js

纯静态网站没有后端写文件能力。

因此页面保存配置时主要保存在浏览器 `localStorage`。

如果要修改默认配置，需要手动编辑并重新上传：

```text
config.js
```

---

### 2. Authorization 安全风险

如果你把管理员 API Key 写入 `config.js`，任何能访问页面源码的人都能看到。

更推荐：

- 页面打开后手动填写 Authorization
- 或给静态站点加访问认证
- 或只允许固定 IP 访问

---

### 3. CORS 必须配置正确

静态部署最常见问题是 CORS。

如果浏览器控制台出现：

```text
CORS policy
```

请检查 Sub2API 配置里的：

```yaml
cors.allowed_origins
```

是否包含当前 Web Checker 页面地址。

---

## 九、常见问题

### 页面能打开，但刷新账号失败

检查：

- API Base 是否填写 Sub2API 后端地址
- Authorization 是否正确
- Sub2API 是否允许当前页面 CORS
- 浏览器控制台是否有 CORS 错误
- Sub2API 后端是否在线

---

### 保存配置后刷新页面还在

正常。

配置保存在浏览器 localStorage 中，同一个浏览器、同一个域名下会保留。

---

### 换浏览器后配置没了

正常。

localStorage 是浏览器本地存储，不会跨浏览器同步。

可以手动编辑 `config.js` 设置默认值。

---

### 想让所有人打开页面都有默认 API Base

编辑：

```text
config.js
```

示例：

```js
window.SUB2API_CHECKER_DEFAULTS = {
  apiBase: 'https://api.example.com',
  authToken: '',
  testModel: 'gpt-5.4',
  timeoutSec: 45,
  pageSize: 100,
  prompt: 'hi',
  onlySchedulable: false,
  stopOnFirstFailure: true,
  autoDisable: true,
  autoEnable: true,
  preferredModels: ['gpt-5.4', 'gpt-4o-mini'],
  scheduledCheckEnabled: false,
  scheduledIntervalMin: 30,
  autoRefreshEnabled: false,
  autoRefreshIntervalMin: 10
};
```

不建议把 `authToken` 写进去。

---

## 十、推荐部署方式

推荐：

```text
Web Checker 静态站点：https://checker.example.com
Sub2API 后端：https://api.example.com
```

Sub2API CORS：

```yaml
cors:
  allowed_origins:
    - "https://checker.example.com"
  allow_credentials: true
```

Web Checker 页面设置：

```text
API Base: https://api.example.com
Authorization: admin-xxxx
```
