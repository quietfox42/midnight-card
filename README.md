[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/quietfox42/mail)

# Quietfox Mail · 临时邮箱

在 Cloudflare **免费套餐**上运行的公开临时收件箱。打开网页就得到一个 `xxxx@你的域名` 地址，无需注册，收到的邮件直接在网页上查看，24 小时后自动删除。

```
发件人 ──SMTP──▶ Cloudflare Email Routing (catch-all)
                         │
                         ▼
               ┌─────────────────────┐    Cron 每小时
               │  一个 Worker        │◀── DELETE 过期邮件
               │  email() / fetch()  │
               └──────────┬──────────┘
                          │ 每封邮件 1 次 INSERT
                          ▼
                       D1 (SQLite)
浏览器 ──▶ Workers Static Assets（CDN，不计请求数）
       └─▶ /api/*  ──▶ 同一个 Worker
```

- **后端**：一个 Worker 同时处理 Email、API 和 Cron；`postal-mime` 解析；D1 存储（不用 KV）。
- **前端**：Vite + React + TypeScript + Radix Themes，构建产物由 Workers Static Assets 托管；只有 `/api/*` 进 Worker。
- **安全**：邮件 HTML 放在 `<iframe sandbox srcdoc>` 中渲染，禁止脚本，CSP 禁止加载任何外部资源（追踪像素、远程图片、字体都不会自动加载）。

> ⚠️ **地址是公开的**：任何知道地址的人都能看到这个地址收到的邮件。不要用于重要账号。

---

## 目录

1. [部署](#部署)
   - [方式 A：一键部署按钮](#方式-a一键部署按钮)
   - [方式 B：命令行](#方式-b命令行)
   - [方式 C：GitHub Actions 自动部署](#方式-cgithub-actions-自动部署)
   - [手动步骤（必须在 Cloudflare 面板完成）](#手动步骤必须在-cloudflare-面板完成)
2. [配置](#配置)
3. [功能说明](#功能说明)
4. [免费额度估算](#免费额度估算)
5. [本地开发与测试](#本地开发与测试)

---

## 部署

### 自动与手动的边界

| 能自动完成（按钮 / `npm run setup` + `npm run deploy`） | 必须手动完成（Cloudflare 目前无法通过按钮配置） |
|---|---|
| ✅ 创建 D1 数据库 | ⬜ 把域名托管到 Cloudflare |
| ✅ 绑定 D1、限流、Cron、静态资源 | ⬜ 开启 Email Routing |
| ✅ 建表（schema.sql） | ⬜ 把 catch-all 规则指向本 Worker |
| ✅ 构建前端并部署 Worker | ⬜ 把 `DOMAIN` 变量改成你的域名（按钮部署时可在页面上填） |

### 方式 A：一键部署按钮

1. 点击顶部 **Deploy to Cloudflare** 按钮，登录 Cloudflare。
2. 部署页会把本仓库复制到你的 GitHub/GitLab 账号，并列出需要的资源：
   - **DB**：D1 数据库，自动创建（可改名）。
   - **DOMAIN** 等变量：把 `DOMAIN` 改成你的收信域名，其他保持默认即可。
3. 确认构建设置：Build command 留空或 `npm run build`，**Deploy command 为 `npm run deploy`**（它会在部署后执行 `schema.sql` 建表）。
4. 点击部署，等待完成。
5. 继续完成下方的 [手动步骤](#手动步骤必须在-cloudflare-面板完成)。

### 方式 B：命令行

需要 Node.js 20+。

```bash
git clone https://github.com/quietfox42/mail.git
cd mail
npm install
npm run setup -- --domain mail.example.org
npm run deploy
```

**`npm run setup`**（幂等，重复执行不会报错或重复创建资源）：

1. 检测 `wrangler` 登录状态，未登录则打开浏览器登录；
2. 查找名为 `tempmail` 的 D1，不存在才创建；
3. 把 `database_id` 写回 `wrangler.toml`（已存在且一致则不改动）；
4. 若 `DOMAIN` 仍是占位符 `example.com`，使用 `--domain` 参数或交互询问并写入；
5. 执行 `schema.sql`（全部是 `IF NOT EXISTS`）。

**`npm run deploy`**：`vite build` → `wrangler deploy` → 再执行一次 `schema.sql`（幂等，几乎不消耗额度）。

> `database_id` 不是机密，建议把 setup 修改后的 `wrangler.toml` 提交到你自己的仓库，这样 CI 部署也能找到同一个数据库。

### 方式 C：GitHub Actions 自动部署

仓库自带 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)：push 到 `main` 时运行测试并执行 `npm run deploy`。

1. 先在本地运行一次 `npm run setup`，把写好 `database_id` 和 `DOMAIN` 的 `wrangler.toml` 提交。
2. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加：
   - `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 面板 → 任意域名概览页右下角的 *Account ID*。
   - `CLOUDFLARE_API_TOKEN`：**My Profile → API Tokens → Create Token → Create Custom Token**，最小权限：

     | 范围 | 权限 | 级别 |
     |---|---|---|
     | Account | Workers Scripts | Edit |
     | Account | D1 | Edit |
     | Zone（仅当在 `wrangler.toml` 配置了 `routes` 自定义域名） | Workers Routes | Edit |

     Account Resources 选择你的账号；Zone Resources（如需要）选择对应域名。

未配置 secrets 时工作流只跑测试，不部署。

### 手动步骤（必须在 Cloudflare 面板完成）

**① 把域名托管到 Cloudflare**（已托管可跳过）
- 面板 → **Add a domain** → 输入域名 → 选择 Free 套餐 → 按提示到域名注册商把 NS 改为 Cloudflare 提供的两个 NS。
- 等待域名状态变为 **Active**。

**② 开启 Email Routing**
- 面板 → 选择域名 → 左侧 **Email → Email Routing** → **Get started / Enable Email Routing**。
- 按提示 **Add records and enable**，Cloudflare 会自动添加 MX 和 SPF（TXT）记录。
- 若域名原来有其他 MX 记录（如企业邮箱），需先删除——同一域名只能有一套收信服务。可考虑使用子域名（如 `mail.example.org`），在 Email Routing → Settings 中为子域名启用。

**③ 把 catch-all 指向 Worker**
- **Email → Email Routing → Routing rules** → 页面底部 **Catch-all address** → **Edit**。
- Action 选择 **Send to a Worker**，Destination 选择 **quietfox-mail**（或你部署时的 Worker 名）。
- 保存并确认 Catch-all 状态为 **Active**（开关打开）。

**④（可选）给网站绑定自定义域名**
- **Workers & Pages → quietfox-mail → Settings → Domains & Routes → Add → Custom domain**，例如 `inbox.example.org`。
- 不绑定也可以直接使用 `https://quietfox-mail.<你的子域>.workers.dev`。

**⑤ 确认 `DOMAIN` 变量**
- **Workers & Pages → quietfox-mail → Settings → Variables and Secrets**，`DOMAIN` 必须与收信域名一致（按钮部署时填过则无需改）。
- 注意：在面板修改变量后，下一次 `wrangler deploy` 会以 `wrangler.toml` 为准覆盖，长期修改请改 `wrangler.toml`。

#### 检查清单

- [ ] 域名在 Cloudflare 中状态为 Active
- [ ] Email Routing 显示 *Enabled*，DNS 中有 `route1/2/3.mx.cloudflare.net` 的 MX 记录
- [ ] Catch-all 规则 Action 为 *Send to a Worker → quietfox-mail*，且已启用
- [ ] 打开网站能看到地址，地址后缀是你的域名
- [ ] 从任意邮箱给该地址发一封 “Your verification code is 123456” 的邮件，10 秒内出现在列表中并带有 `123456` 徽章
- [ ] **Workers & Pages → quietfox-mail → Logs** 中没有报错
- [ ] 发给 `admin@你的域名` 的邮件被拒收（保留前缀）

---

## 配置

所有参数都在 [wrangler.toml](wrangler.toml) 中，无需改代码：

| 变量 | 默认 | 说明 |
|---|---|---|
| `DOMAIN` | `example.com` | 收信域名（占位符，必须修改） |
| `RETENTION_HOURS` | `24` | 邮件保留小时数，Cron 每小时清理 |
| `MAX_RAW_BYTES` | `1048576` | 原始邮件超过此大小直接拒收（含附件） |
| `MAX_BODY_BYTES` | `204800` | 存储的正文上限（text 优先，html 用剩余额度），超出截断 |
| `POLL_SECONDS` | `10` | 前端轮询间隔，最小 10 |
| `BLOCKED_SENDERS` | 空 | 拒收的发件人或域名，逗号分隔，如 `spam@x.com,bad.org` |
| `EXTRA_RESERVED` | 空 | 额外保留前缀，逗号分隔 |
| `FORWARD_TO` | 空 | 发往保留前缀（postmaster、abuse…）的邮件转发到此地址；需先在 Email Routing → Destination addresses 验证。留空则拒收 |

其他：

- **速率限制**：`[[ratelimits]]` 中 `limit = 60, period = 60`，即每个 IP 每分钟 60 次数据请求（正常轮询只用 6 次）。`namespace_id` 是自选整数，不是账号 ID。
- **Cron**：`[triggers] crons = ["0 * * * *"]`。
- **D1 名称**：`database_name = "tempmail"`。

---

## 功能说明

### 1. 自定义前缀

- 点击 **自定义**，输入前缀即可使用 `前缀@你的域名`。
- 规则：`a-z 0-9 . _ -`，长度 3-32，点不能在首尾或连续出现。前端和 Worker 使用同一份校验代码 [src/shared/address.ts](src/shared/address.ts)。
- 保留前缀（`admin`、`postmaster`、`abuse`、`support`、`security`、`noreply`、`webmaster` 等）不能使用，发往这些地址的邮件会被拒收（或转发到 `FORWARD_TO`）。
- catch-all 模式下任何前缀都能直接收信，**不需要预先创建，也不写数据库**。

### 2. 随机生成邮箱

- 点击 **换新地址**，前端用 `crypto.getRandomValues` 生成 8 位小写字母+数字前缀，不请求后端。
- 当前地址保存在 `localStorage`，刷新页面保持不变。
- 页面始终提示：地址公开，知道地址的人都能看到邮件，不要用于重要账号。

### 3. 验证码与链接自动提取

在 Email Worker 收信时提取**一次**，存入 D1 的 `code`、`link` 列，前端直接展示，不重复计算。代码见 [src/worker/extract.ts](src/worker/extract.ts)。

- 只扫描主题 + 正文前 **5KB**（纯 HTML 邮件先做廉价去标签，保留 `<a href>` 中的 URL）。
- **验证码**：查找“验证码 / 校验码 / 动态码 / 一次性密码 / code / verification / OTP / passcode / PIN …”关键词，在其后 80 字符、其前 40 字符的窗口中找 4-8 位数字或字母数字（必须含数字），也支持 `123 456` 分组格式。纯数字优先、距离关键词越近越优先；排除年份、价格、颜色值、URL 里的数字。匹配不到留空。
- **链接**：第一个包含 `verify` / `confirm` / `activate` 的 URL。前端显示 **打开链接** 按钮（新标签页，`rel="noopener noreferrer"`），**只展示，绝不自动访问**。
- 列表中显示验证码徽章，点击即复制并提示“已复制”。
- 测试用例覆盖 Google（`G-123456`）、GitHub、微信、Microsoft、Apple、Discord、纯 HTML、营销邮件等：`npm test`。

---

## 免费额度估算

Cloudflare 免费套餐（每天重置）：

| 资源 | 免费额度 |
|---|---|
| Workers 请求 | 100,000 次/天（含 email 事件和 Cron；**静态资源请求免费且不计入**） |
| Workers CPU | 10 ms/次 |
| D1 读取 | 5,000,000 行/天 |
| D1 写入 | 100,000 行/天 |
| D1 存储 | 5 GB |

> D1 的“写入行数”包含索引更新：本项目有 2 个索引，所以插入一封邮件 ≈ 3 行写入，删除一封 ≈ 3 行写入。

### 每个动作的消耗

| 动作 | Worker 请求 | D1 读取行 | D1 写入行 |
|---|---|---|---|
| 收一封邮件 | 1 | 0 | ≈3（1 行 + 2 索引） |
| 清理一封过期邮件 | —（Cron 每天 24 次，共享） | ≈1 | ≈3 |
| 打开网页 | 0（静态资源走 CDN） | 0 | 0 |
| `/api/config` | 1（浏览器缓存 1 小时） | 0 | 0 |
| 一次轮询（无新邮件） | 1 | ≈0（覆盖索引查找，返回 0 行） | 0 |
| 首次拉列表 | 1 | ≤50 | 0 |
| 打开一封邮件 | 1（同一封浏览器缓存 24h） | 1 | 0 |

### 能支撑多少

**邮件量（受 D1 写入限制）**：每封 ≈ 6 行写入（收 3 + 删 3）→ 100,000 ÷ 6 ≈ **16,000 封/天**。

**访客量（受 Workers 请求限制）**：
- 一个停留 5 分钟、页面一直可见的访客 ≈ 1 config + 30 次轮询 + 2 次查看 ≈ **33 次请求**。
- 一个挂着 1 小时的标签页：前 5 分钟每 10 秒、之后无新邮件退避到每 30 秒 ≈ **140 次/小时**；切到后台则 **0 次**。
- 扣除邮件和 Cron 后：

| 每日邮件数 | 剩余请求 | 约可支撑（5 分钟访问） |
|---|---|---|
| 1,000 | ~99,000 | ~3,000 次访问/天 |
| 5,000 | ~95,000 | ~2,900 次访问/天 |
| 10,000 | ~90,000 | ~2,700 次访问/天 |

**存储**：常见验证邮件存储后 10-30KB；16,000 封 × 30KB ≈ 0.5GB。即使每封都达到 200KB 上限也只有 ≈ 3.2GB，低于 5GB。保留 24 小时，存储不会持续增长。

**D1 读取**：增量轮询几乎不读行；即使 10 万次请求每次都读 50 行也只有 500 万行，刚好等于额度，实际远低于此。

### 瓶颈

1. **Workers 请求数（轮询）是第一瓶颈**。缓解措施已内置：页面不可见时暂停、5 分钟无新邮件退避到 30 秒、`/api/config` 和邮件详情走浏览器缓存、静态资源完全不进 Worker。访客更多时可调大 `POLL_SECONDS`（例如 20 秒约翻倍容量）。
2. **D1 写入是第二瓶颈**，只在每天上万封邮件时出现。每封邮件的写入量是固定的，缩短保留时间不会减少写入；可用 `BLOCKED_SENDERS` 挡掉垃圾邮件源。
3. **CPU 10ms**：正则只扫 5KB（实测 < 1ms）；`postal-mime` 解析是主要开销，所以超过 `MAX_RAW_BYTES`（1MB）的邮件直接拒收。若日志中出现 CPU 超限，可把 `MAX_RAW_BYTES` 降到 `524288`。

超出额度时，Cloudflare 免费套餐会让请求失败（不会产生费用）：网页仍可打开，API 返回错误，邮件会被退回。

### 防滥用

- 超过 `MAX_RAW_BYTES` 的邮件、`BLOCKED_SENDERS` 中的发件人、非本域名/格式非法/保留前缀的收件人：在 SMTP 阶段直接 reject，不解析、不写库。
- 附件一律丢弃；正文超过 `MAX_BODY_BYTES` 截断。
- API 只读，按 IP 限流，所有请求都校验地址格式；读取单封邮件必须同时提供 id 和地址，无法通过遍历 id 读取他人邮件。

---

## 本地开发与测试

```bash
npm install
npm test                                              # 正则与地址校验测试
npm run build                                         # 构建前端到 dist/
npx wrangler d1 execute DB --local --file=schema.sql  # 本地建表
npx wrangler dev --var DOMAIN:test.dev                # http://localhost:8787
```

前端热更新：另开终端 `npm run dev`（Vite 会把 `/api` 代理到 8787）。

模拟收信与 Cron（`wrangler dev` 运行时）：

```bash
curl -X POST "http://localhost:8787/cdn-cgi/handler/email?from=a@b.com&to=demo1234@test.dev" --data-binary @test.eml
```

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+*+*+*+*"
```

`test.eml` 至少需要 `From`、`To`、`Subject`、`Message-ID` 头。

### 项目结构

```
wrangler.toml            Worker、D1、静态资源、限流、Cron、变量
schema.sql               emails 表与索引
scripts/setup.mjs        幂等初始化脚本
src/shared/address.ts    前后端共用的地址校验
src/worker/index.ts      入口：fetch / email / scheduled
src/worker/email.ts      收信处理
src/worker/api.ts        只读 API
src/worker/extract.ts    验证码与链接提取
src/web/                 React 前端
public/_headers          /assets/* 一年 immutable 缓存
test/                    vitest 测试
```

## License

MIT
