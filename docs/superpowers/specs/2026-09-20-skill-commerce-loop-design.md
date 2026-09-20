# TeachFlow Skill 商业闭环设计：上传 · 托管 · 发版 · 销售 · 更新

**日期** 2026-09-20 · **状态** 已拍板，待实施
**上游文档** `docs/2026-09-20-direct-sales-payment-plan.md`（本 spec 取代其 §1.3 与 §1.4 的悬而未决部分）
**参考形态** Agensi.io 的托管/交付机制（2026-09-18 浏览器核实，见 memory `agensi-stripe-listing-requirements`）

---

## 0. 边界

**做什么**：在现有 Astro 静态站旁边，建一套自营发行系统，闭合"我上传 zip → 买家付款 → 买家下载 → 我发新版 → 买家免费重下"这条环。

**不做什么**（逐条都有理由，见 §10）：不做审核队列、不做买家账号、不做 Web 上传表单、不做 DRM、不做订阅、不做单品直销、不接 LLM。

**继承的硬约束**（来自上游文档 §1.1，一条不放松）：

| 约束 | 本设计如何满足 |
|---|---|
| 前端保持 Astro 纯静态 | 新增的动态页 `/download` 由 shop-api 服务端渲染，不进 `dist/`，`tests/build/no-js.test.mjs` 不受影响 |
| 站内不托管任何支付表单 | `/[lang]/buy` 只是一个跳转到 Polar 托管结账页的链接 |
| `npm run verify` 保持部署闸门，只扩不松 | 新增 `npm run verify:api`，原九项检查一项不改 |
| 上传系统不得重新打包内容 | `POST /api/admin/releases` 只接收、校验、登记、分发；zip 由 `TeachFlow-KR/package.py` 产出 |
| 价格是唯一一个数，来源 `src/config/site.ts` | 结账价在 Polar 后台配置，站内展示仍读 `SITE.price.display` |

**现状订正**（实施前逐项核实于 2026-09-20）：

- `TeachFlow-KR/LICENSE` 已是 `LicenseRef-TeachFlow-Proprietary`（CROSSXTOP LTD），六个 `SKILL.md` 的 `license:` 字段已全部改完，且已打进 `dist/*.zip`。**专有许可闸门已关闭**，不是待办。
- 六个 zip 合计约 230 KB，最大单文件 `GUIDE.md` 41 KB。
- `verify.py` 的 frontmatter 白名单已含 `version`，新增 `version:` 字段无需改 `verify.py`。

---

## 1. 架构

### 1.1 拓扑

全部落在已有的那台 Hetzner 机器上，对外只有 Caddy 一个入口：

```
tryteachflow.com  ──  Caddy
                       ├─ /                → Astro 静态产物（dist/，不变）
                       ├─ /api/*           → localhost:8787
                       └─ /download*       → localhost:8787   （服务端渲染）

                               shop-api (Node 20, node:http)
                                     │
                               PostgreSQL 16   ← 只监听 127.0.0.1
                                     │
                               pg-boss worker  （独立进程）

外部依赖：Polar（MoR + 托管结账）· Cloudflare R2（master zip 归档）· Resend（邮件）
```

### 1.2 为什么不是 Vercel + Next.js

2026-09-20 核实：

- Vercel **Hobby 明确限定 personal, non-commercial use**（[Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)）。卖 USD 29.90 的商品踩这条。
- Hobby 的 Cron **只能日频**，`0 * * * *` 在部署阶段直接报错（[Cron 用量](https://vercel.com/docs/cron-jobs/usage-and-pricing)）。

同机部署一次解决三件事：不违反商用条款；Postgres 不出公网，省掉 TLS、连接池、IP 白名单；定时任务交给 pg-boss 自带调度，不受日频限制。Next.js 的存在理由是 Vercel，Vercel 出局后引入它等于在一个仓库里养两套前端框架，故不引入。

### 1.3 R2 的真实作用

**不是**省出流量费。230 KB 乘以任何现实下载量，对 Hetzner 自带流量额度都是零头。R2 在此承担的是 **master zip 的异地归档与版本历史**，以及 samples 页静态产物的分发。设计文档里不写"零出流量费所以选它"。

### 1.4 技术选型

**原则：外部依赖收敛到两个，其余用 Node 内建。**

| 关注点 | 选择 | 理由 |
|---|---|---|
| PG 客户端 | `pg` (Pool) | Postgres 线协议无法用内建替代；pg-boss 本就依赖它，共用一个 Pool |
| 任务队列 | `pg-boss` 10 | 复用同一个 Postgres，无需 Redis；自带 cron 调度 |
| HTTP | `node:http` + 手写小路由 | webhook 验签需要原始 body，内建拿原始 body 比框架的 content-type parser 更直接；路由面只有 7 条 |
| JWT | `node:crypto` HMAC-SHA256 | HS256 签发与校验约 30 行，不值得一个依赖 |
| zip 读写 | `node:zlib` raw deflate/inflate | 校验需要解析中央目录，水印只需追加一个 local header 再重写中央目录；230 KB 量级全内存操作 |
| 对象存储 | `node:crypto` 手签 SigV4 + 内建 `fetch` | R2 是 S3 兼容；只用到 PUT/GET 两个操作，换掉一个巨型依赖树 |
| 邮件 | 内建 `fetch` POST `api.resend.com` | 一个 HTTP 调用 |
| 测试 | vitest（复用站点仓库已装的） | 纯逻辑模块因此无需任何安装即可测 |

这个收敛不只是为了绕开安装限制：它让 zip 校验、水印、token、SigV4 签名、webhook 事件归一这五个最容易出错的模块**完全不依赖外部包**，可以在任何环境下独立测试；真正需要 `npm install` 的只有触库和排队的那部分。

### 1.5 目录

shop-api 作为同仓库的独立包，不污染站点构建：

```
workspace/
├── src/ …                       现有 Astro 站点（新增 buy.astro）
├── scripts/verify-build.mjs     现有九项检查，不改
├── shop-api/
│   ├── package.json             独立依赖，独立 test
│   ├── src/
│   │   ├── server.ts            node:http 组装与启动
│   │   ├── http/router.ts       手写小路由（method + 单段参数）
│   │   ├── worker.ts            pg-boss worker 入口
│   │   ├── config.ts            环境变量读取与校验（缺一即拒绝启动）
│   │   ├── db/
│   │   │   ├── pool.ts
│   │   │   ├── migrate.ts       顺序执行 migrations/*.sql
│   │   │   └── migrations/001_init.sql
│   │   ├── routes/
│   │   │   ├── admin-releases.ts
│   │   │   ├── webhooks.ts
│   │   │   ├── entitlements.ts
│   │   │   ├── download.ts
│   │   │   ├── resend-link.ts
│   │   │   └── health.ts
│   │   ├── mor/
│   │   │   ├── types.ts         NormalizedOrderEvent 接口
│   │   │   ├── polar.ts         签名验证 + 事件归一
│   │   │   └── index.ts         按 MOR_PROVIDER 选择适配器
│   │   ├── lib/
│   │   │   ├── zip-validate.ts  完整性校验
│   │   │   ├── watermark.ts     注入 LICENSE-HOLDER.txt
│   │   │   ├── token.ts         JWT 签发与校验
│   │   │   ├── storage.ts       R2 读写 + 本地 LRU
│   │   │   ├── mailer.ts        Resend 封装 + 日配额计数
│   │   │   └── ratelimit.ts     内存滑窗
│   │   ├── jobs/
│   │   │   ├── notify-update.ts
│   │   │   └── archive-master.ts
│   │   └── views/download.ts    服务端渲染的下载页（双语，内联 CSS）
│   └── test/…
└── tools/publish.py             操作者 CLI
```

---

## 2. 数据模型

`shop-api/src/db/migrations/001_init.sql`。迁移只增不改，文件名带序号，`migrate.ts` 记录已执行的文件名于 `schema_migrations`。

```sql
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE skills (
  id          text PRIMARY KEY,               -- = SKILL.md frontmatter name
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE releases (
  id            bigserial PRIMARY KEY,
  skill_id      text NOT NULL REFERENCES skills(id),
  version       text NOT NULL,                -- semver，严格递增
  sha256        char(64) NOT NULL,
  size_bytes    integer NOT NULL,
  r2_key        text NOT NULL,                -- masters/<skill>/<version>.zip
  changelog_en  text NOT NULL,
  changelog_ko  text NOT NULL,
  published_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id, version)                  -- 已售版本不可变
);

CREATE TABLE orders (
  id           text PRIMARY KEY,              -- provider 侧 order id
  provider     text NOT NULL,                 -- 'polar' | 'paddle'
  buyer_email  citext NOT NULL,
  amount_cents integer NOT NULL,
  currency     char(3) NOT NULL,
  status       text NOT NULL
                 CHECK (status IN ('paid','refunded','chargeback')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_buyer_email_idx ON orders (buyer_email);

CREATE TABLE entitlements (
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  skill_id text NOT NULL REFERENCES skills(id),
  PRIMARY KEY (order_id, skill_id)
);

CREATE TABLE downloads (
  id            bigserial PRIMARY KEY,
  order_id      text NOT NULL REFERENCES orders(id),
  skill_id      text NOT NULL,
  version       text NOT NULL,
  ip            inet NOT NULL,
  user_agent    text,
  downloaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX downloads_order_idx ON downloads (order_id);

CREATE TABLE webhook_events (
  provider    text NOT NULL,
  event_id    text NOT NULL,
  payload     jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE update_notices (
  order_id   text   NOT NULL REFERENCES orders(id),
  release_id bigint NOT NULL REFERENCES releases(id),
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, release_id)
);

CREATE TABLE email_quota (                    -- Resend 每日 100 封硬顶的本地账
  day   date PRIMARY KEY,                     -- UTC 日历日
  sent  integer NOT NULL DEFAULT 0
);
```

三张表各自撑着一件具体的事，删掉任何一张都有可见后果：

- `downloads` —— `/legal/refund` 里"尚未下载"的退款判定，以及拒付举证。
- `webhook_events` —— Polar 会重投事件；没有它就会重复建单、重复发信。
- `update_notices` —— 群发跨多天分批进行，没有它第二天会把第一天发过的人再发一遍。

---

## 3. 四条闭环

### 3.1 上传与发版

只有操作者一人，走 CLI + Bearer token，**不做 Web 上传表单**——单人场景下表单是更大的攻击面而非便利。

```bash
python3 tools/publish.py --skill lesson-workflow --version 1.2.0 \
  --zip ../TeachFlow-KR/dist/lesson-workflow.zip \
  --changelog-en "Clarified the integrated-lesson branch." \
  --changelog-ko "통합 수업 분기 설명을 명확히 했습니다."
```

服务端 `POST /api/admin/releases`（multipart）按顺序执行，**任一步失败即整体拒绝，不留半成品**：

1. `Authorization: Bearer <ADMIN_TOKEN>` 与环境变量定长比较（`timingSafeEqual`）。
2. 完整性校验（`lib/zip-validate.ts`）：
   - 能被解析为合法 zip
   - 不含嵌套 zip
   - 无 `../`、无绝对路径、无以 `/` 开头的条目
   - 无 `__MACOSX`、无 `.DS_Store`、无任何以 `.` 开头的路径段
   - 顶层唯一目录名 == 请求里的 `skill`，且 == zip 内 `SKILL.md` frontmatter 的 `name`
   - 存在 `<skill>/SKILL.md`
   - 单文件 < 1 MB，总解压体积 < 5 MB
3. `SKILL.md` frontmatter 的 `version:` 必须存在且 == 请求里的 `--version`。
4. semver 必须严格大于该 skill 现有最高版本；`(skill_id, version)` 已存在则返回 **409**，永不覆盖。
5. 计算 SHA-256，先把母版落到本地盘（反序会让库里留下指向空文件的记录），再写入 `releases`，提交后投递 pg-boss 的 `archive-master` 与 `notify-update`。

   投递在事务之外：pg-boss 10 没有"用调用方的连接"这类 API，要塞进同一事务只能直接写它的私有表，跨版本很脆。代价是提交与投递之间有一个窗口。窗口内进程挂掉的后果是「归档没做、更新邮件没发」，不是「订单出错」；接口对投递失败回 500 并在正文里带上 release id，明确写出记录已写入、不要重传。
6. 返回回执：`{ skill, version, sha256, size_bytes, published_at }`。

`archive-master` 任务负责把 zip 传到 R2 `masters/<skill>/<version>.zip`。上传先落本地 `MASTER_DIR`（webroot 之外），R2 是归档副本——这样 R2 短暂不可用不会阻断发版或下载。

**对 `TeachFlow-KR` 的配套改动**：六个 `SKILL.md` 增加 `version:` 字段；`package.py` 在打包前断言该字段存在。

### 3.2 销售与交付

`/[lang]/buy` 是纯链接页，跳 `SITE.buyCtaUrl`（Polar 托管结账）。站内不出现支付表单，PCI 面与支付页审核因此完全消失。

`POST /api/webhooks/polar` 的处理顺序：

1. 用原始 body 验签（Polar 遵循 Standard Webhooks：HMAC-SHA256，签名基串为 `<id>.<timestamp>.<body>`）。验签失败 → 401。
2. 时间戳偏移超过 5 分钟 → 401（防重放）。
3. `INSERT INTO webhook_events … ON CONFLICT DO NOTHING`；冲突即已处理过，直接返回 200。
4. 由 `mor/polar.ts` 归一为 `NormalizedOrderEvent`：

```ts
type NormalizedOrderEvent =
  | { kind: 'paid';       orderId: string; email: string;
      amountCents: number; currency: string; locale: 'en' | 'ko' }
  | { kind: 'refunded';   orderId: string }
  | { kind: 'chargeback'; orderId: string };
```

5. `paid`：在一个事务内建 `orders` + 六条 `entitlements`；签发 JWT（HS256，`sub = orderId`，30 天）；投递发信任务。
6. `refunded` / `chargeback`：把 `orders.status` 翻转。entitlement 随即失效（下载接口返回 403）。**已下载到本机的文件不追回**——`/legal/terms` 写明做不到也不做。

交付邮件正文必须逐字包含 `src/content/legal/{en,ko}/refund.md` 里的英/欧/韩撤回权告知，不得改写。

### 3.3 下载

`GET /download?t=<jwt>&lang=ko` 由 shop-api 服务端渲染，列出六个 skill、当前版本号、changelog、SHA-256。页面自带内联 CSS，不依赖站点构建产物的 hash 文件名，也不含任何脚本。

`GET /api/download/:skillId?t=<jwt>`：

1. 校验 JWT 签名与有效期 → 失效返回可读的过期页面并提示重发链接。
2. 查 `entitlements` 且 `orders.status = 'paid'` → 否则 403。
3. 取该 skill 最高版本的 master（先本地 `MASTER_DIR`，未命中再回源 R2，带 LRU 内存缓存）。
4. **内存中注入水印**：向 zip 追加 `<skill>/LICENSE-HOLDER.txt`，内容含买家邮箱、订单号、购买日期、`Licensed to the named holder only`。
5. 流式返回，`Content-Disposition: attachment`。
6. 写 `downloads`（含 IP 与 UA）。

水印**下载时现做而非预生成**：230 KB 的包追加一个文本文件是毫秒级操作；预生成会换来 R2 写路径、按订单膨胀的产物和清理任务，收益为零。

`POST /api/orders/resend-link`（body `{ email }`）：无论邮箱是否存在都返回**完全相同的 202 响应**（防枚举），存在才实际发信。按 IP 与邮箱双限流。这是 Agensi "dashboard 可重新生成下载链接" 的等价物，但不引入账号体系。

### 3.4 更新回流

pg-boss 任务 `notify-update`，由 §3.1 第 5 步投递：

1. 取所有 `status = 'paid'` 且 `(order_id, release_id)` 不在 `update_notices` 的订单。
2. 读 `email_quota` 当日已发数。**每日上限 80 封**，留 20 封给当天的交易邮件——Resend 免费版是 100 封/天且 3,000 封/月，日配额按 UTC 日历日重置，To/CC/BCC 每个收件人单独计数（[配额文档](https://resend.com/docs/knowledge-base/account-quotas-and-limits)）。
3. 逐封发送，每封成功后写一条 `update_notices` 并把 `email_quota.sent` 加一（同一事务）。
4. 配额耗尽则重新排程到次日 UTC 00:05，继续未发完的部分。

老买家不需要重新付款，也不需要新链接——token 未过期就直接进下载页取新版本；过期则走 `resend-link`。行为与 Agensi 的"版本更新免费重下"一致。

---

## 4. 接口契约

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/admin/releases` | Bearer | multipart：`zip`、`skill`、`version`、`changelog_en`、`changelog_ko` |
| GET | `/api/admin/releases` | Bearer | 列出全部版本，供 CLI 校对 |
| POST | `/api/webhooks/polar` | 签名 | Standard Webhooks 验签 |
| POST | `/api/orders/resend-link` | 无（限流） | `{ email }` → 恒定 202 |
| GET | `/download` | token in query | 服务端渲染的下载页 |
| GET | `/api/download/:skillId` | token in query | 水印 zip 流 |
| GET | `/api/health` | 无 | `{ ok, db, r2, queue }` |

错误响应统一 `{ error: { code, message } }`，`code` 取自固定枚举，`message` 不回显任何内部路径或 SQL。

---

## 5. 配置与密钥

`config.ts` 在启动时校验全部必需变量，缺一即拒绝启动并打印缺失清单——不做"运行到一半才发现没配"的惰性检查。

| 变量 | 用途 |
|---|---|
| `DATABASE_URL` | `postgres://…@127.0.0.1:5432/teachflow` |
| `ADMIN_TOKEN` | 发版 Bearer，仅服务端环境变量，不入库不入日志 |
| `DOWNLOAD_TOKEN_SECRET` | JWT HS256 密钥，≥ 32 字节 |
| `MOR_PROVIDER` | `polar` \| `paddle` |
| `POLAR_WEBHOOK_SECRET` | 验签 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | 归档 |
| `RESEND_API_KEY` / `MAIL_FROM` | 发信 |
| `MASTER_DIR` | webroot 之外的本地 master 目录 |
| `PUBLIC_BASE_URL` | 生成下载链接用 |

日志脱敏：邮箱只记域名部分，token 永不落盘，webhook payload 入库但不打印。

---

## 6. 安全与版权

**威胁与对策**

| 威胁 | 对策 |
|---|---|
| 伪造 webhook 白嫖 | 验签 + 时间戳窗口 + 事件去重 |
| 下载链接被转发 | token 绑定 `order_id`；每次下载写 `downloads`；zip 内含买家水印 |
| 邮箱枚举 | `resend-link` 恒定响应 + 双限流 |
| 发版接口被爆破 | `timingSafeEqual` 比较 + 失败限流 + 只监听经 Caddy 的路径 |
| 恶意 zip（路径穿越/zip bomb） | §3.1 第 2 步逐项校验，解压体积上限 |
| 退款后继续下载 | 状态翻转即 403 |

**版权四层**（与上游文档 §3.2 一致，无 DRM、无加密——产品是纯 markdown，加密只会妨碍买家）：

1. 包内专有许可文本（已完成）
2. 按买家注入的 `LICENSE-HOLDER.txt`
3. `downloads` 表作为举证链
4. 低频人工泄露排查

---

## 7. 测试策略

**shop-api 单元/集成测试（vitest，`npm run verify:api`）**

- `zip-validate`：合法包通过；嵌套 zip、`../`、绝对路径、`__MACOSX`、超限单文件、顶层目录名不匹配各一条用例，全部必须被拒。
- `watermark`：注入后 zip 仍可解析；`LICENSE-HOLDER.txt` 存在且含订单号；原有条目字节不变。
- `token`：签发—校验往返；过期拒绝；篡改签名拒绝。
- `mor/polar`：正确签名通过；错误签名、超窗时间戳、重放事件 id 各自被拒；三类事件归一结果正确。
- 发版流程：版本递增通过；同版本重传返回 409 且库中记录不变；frontmatter `version` 与参数不符则拒绝。
- `notify-update`：配额耗尽时剩余部分被重新排程，且已发部分不重发。
- 下载授权：无 token / 过期 token / 非本单 skill / 已退款订单，四种情况全部 403 或 401。

**站点侧（并入现有 `npm run test` 与 `npm run verify`）**

- `buy.astro` 双语存在、`SITE.buyCtaUrl` 被引用、价格写法仍为 `USD 29.90`。
- 语言对等检查覆盖新页面。
- `tests/build/no-js.test.mjs` 必须继续全绿——`/download` 不进 `dist/`，这条自然成立。

**真机检查**（部署后，人工执行）

1. 用 Polar 沙箱下单，确认收到邮件且链接可用。
2. 下载一个包，确认含 `LICENSE-HOLDER.txt` 且邮箱正确。
3. 重放同一 webhook 事件，确认不产生第二条订单。
4. 在 Polar 后台退款，确认下载随即 403。
5. 发一个新版本，确认老 token 能取到新版本。

---

## 8. MoR 选型：Polar，Paddle 保持可切换

按 USD 29.90、韩国发卡（对 MoR 而言皆为国际卡）、UK 收款计算（2026-09-20 核实）：

| | 单笔 | 到手 | 上线前闸门 |
|---|---|---|---|
| **Paddle** | 5% + $0.50，无国际卡附加 ≈ **$2.00** | ≈ $27.90 | KYB + **域名/网站人工审核 5–7 个工作日**，可能被打回 |
| **Polar Starter** | 5% + $0.50 + 1.5% 国际 ≈ **$2.44**，另每笔争议 $15 | ≈ $27.46 | KYB 账户审核约 1–2 周，无网站审核 |

Paddle 每单便宜约 $0.45 且无争议费，这点如实记录。选 Polar 的理由不是更便宜，而是：上线闸门更少（Paddle 的网站审核会盯"站上是否清楚列出全部在售商品及价格""是否有与 Paddle 无关的商品造成买家混淆"，而 TeachFlow 站同时指向 Agensi，这是真实的被打回风险）；接入面更干净；开源可自查。

**切换判据写死为一个数**：当 `月订单数 × $0.45 > 迁移工时成本` 时切 Paddle。适配器 `mor/` 的存在就是为了让这次切换只改一个文件加一个环境变量。

来源：[Polar 定价](https://polar.sh/resources/pricing) · [Polar 支持国家](https://polar.sh/docs/merchant-of-record/supported-countries) · [Paddle 域名审核](https://www.paddle.com/help/start/account-verification/what-is-domain-verification) · [Paddle 账户验证](https://www.paddle.com/help/start/account-verification)

---

## 9. 需要人工准备的事（代码不依赖，最后统一执行）

1. Polar 账户注册（GitHub/Google OAuth）、组织创建、KYB 资料、Stripe Connect Express 绑定 UK 主体。审核约 1–2 周，**应在写代码期间同步启动**。
2. 在 Polar 建商品：六合一套装，USD 29.90，一次性付款，不开订阅。
3. 取 `POLAR_WEBHOOK_SECRET`，把 webhook 端点指向 `https://tryteachflow.com/api/webhooks/polar`。
4. Cloudflare R2 建桶与 API token。
5. Resend 验证发信域名，取 API key。
6. Hetzner 上装 PostgreSQL 16，建库建角色，确认 `listen_addresses = 'localhost'`。
7. Caddy 增加两条 `reverse_proxy`。
8. 法务页同日更新：`delivery.md`（2 个工作日 → 即时）、`refund.md`（下载记录为准）、`privacy.md`（支付处理方数据流、订单与下载日志的用途与留存期），英韩两版，`updated` 日期同步刷新——`terms.md` 承诺"以购买当日公布的版本为准"。

---

## 10. 明确不做的事

| 不做 | 理由 |
|---|---|
| 审核队列与自动安全扫描 | 上传者只有你自己；`verify.py` 已在打包前跑过 |
| 买家账号体系 | magic link 重发已覆盖 Agensi dashboard 的全部实际用途 |
| Web 上传表单 | 单人场景下是更大的攻击面而非便利 |
| DRM / 加密 | 产品是纯 markdown，加密只妨碍买家不妨碍盗版 |
| 订阅与自动续费 | `/legal/refund` 已公开承诺"无订阅、无自动续费" |
| 单个 skill 直销 | 单品留在 Agensi，官网只卖套装 |
| 接入 AiHubMix 等 LLM | 上传、托管、发版、结算、交付五步无一需要 LLM |
| 预生成带水印的 zip | 见 §3.3 |
