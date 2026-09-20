# 人工准备执行手册（spec §9 逐条展开）

**日期** 2026-09-20 · **对应** `docs/superpowers/specs/2026-09-20-skill-commerce-loop-design.md` §9
**适用人** 操作者本人（单人运维），**不是**给代码读的文档

这份手册把 spec §9 的八条一句话，展开成可以照着敲的步骤。每一条都给出：**何时做 · 做什么 · 产出什么 · 怎么验收**。

spec §9 说这八条"代码不依赖，最后统一执行"——**这句话只对其中五条成立**。第 1 条（Polar KYB）耗时 1–2 周且不可压缩，必须第一天启动；第 8 条（法务页）有一项外部依赖（韩国法下的试用义务）需要提前确认。执行顺序见 §0。

---

## 0. 顺序、依赖与耗时

### 0.1 关键路径

```
Day 0  ├─ ①a 注册 Polar 正式账户 + 提交 KYB ──────────────► 等 1–2 周（阻塞收钱）
       ├─ ①b 注册 Polar sandbox 账户（独立账户，无需审核）──► 立刻可用
       ├─ ⑤a Resend 加域名 + 配 DNS ──────────────► 等 DNS 生效，通常 1 小时内
       └─ ⑧a 确认韩国法「试用」义务是否已满足（见 §8.4）

Day 0–1  ④ R2 建桶取 token（10 分钟）
         ⑥ PostgreSQL 16（30 分钟）
         ⑤b Resend 取 API key（域名验证通过后 2 分钟）

Day 1+   ②③ 在 sandbox 建商品、配 webhook —— 用 sandbox 打通全链路，
             不等 KYB。KYB 只阻塞真钱，不阻塞集成。

上线当天 ⑦ Caddy 改配置（注意 §7.2 的三处 matcher，不止两条 reverse_proxy）
         ②③ 在正式组织重做一遍（商品、webhook，密钥与 sandbox 不共用）
         ⑧ 法务页四页 × 双语同日发布
```

**唯一不可压缩的是 ①a。** 今天不点那个注册按钮，两周后就是今天的状态。

### 0.2 产出物总表

这张表是本手册的验收清单——八条做完，`/etc/teachflow/shop-api.env` 里应当恰好有这些值，一个不多一个不少（对照 `shop-api/src/config.ts` 的 `REQUIRED` 数组）。

| 环境变量 | 来自本手册哪一节 | 形态 |
|---|---|---|
| `DATABASE_URL` | §6 | `postgres://teachflow:<pwd>@127.0.0.1:5432/teachflow` |
| `ADMIN_TOKEN` | §6.5（自己生成） | `openssl rand -hex 32` |
| `DOWNLOAD_TOKEN_SECRET` | §6.5（自己生成） | `openssl rand -base64 48`，≥ 32 字节 |
| `POLAR_WEBHOOK_SECRET` | §3 | Polar webhook 端点上自设或生成 |
| `R2_ACCOUNT_ID` | §4.3 | 32 位十六进制 |
| `R2_ACCESS_KEY_ID` | §4.2 | R2 API token 的 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | §4.2 | **只显示一次** |
| `R2_BUCKET` | §4.1 | `teachflow-masters` |
| `RESEND_API_KEY` | §5.4 | `re_…`，**只显示一次** |
| `MAIL_FROM` | §5.2 | `TeachFlow <noreply@send.tryteachflow.com>` |
| `MASTER_DIR` | §6.6 | `/srv/teachflow/masters`（**必须在 webroot 之外**） |
| `PUBLIC_BASE_URL` | 已知 | `https://tryteachflow.com`，不带尾斜杠、不带路径 |

可选项（有默认值，不配也能启动）：`PORT=8787` · `MOR_PROVIDER=polar` · `DOWNLOAD_TOKEN_TTL_DAYS=30` · `DAILY_MAIL_BUDGET=80` · `BUNDLE_SKILL_IDS`（默认即六个 skill）。

### 0.3 密钥保管规矩

上面十二个值里有六个是密钥。定死三条，不做例外：

1. **唯一的服务端落点**是 `/etc/teachflow/shop-api.env`，`chown root:root`、`chmod 600`，由 systemd 的 `EnvironmentFile=` 读取。不放进 `~/.bashrc`，不放进仓库任何位置（包括 `.env.example` 的注释里）。
2. **唯一的备份落点**是你的密码管理器，一条目一密钥，备注里写清它属于 sandbox 还是正式环境。R2 的 Secret Access Key 与 Resend 的 API key **创建时只显示一次**，当场没存下就只能删了重建。
3. **sandbox 与正式的密钥绝不混用、绝不放同一个文件。** Polar 的 sandbox 是独立账户，商品 ID、webhook secret 全都不同；混用的典型症状是"结账页能开、webhook 永远收不到"。

---

## 1. Polar 账户、组织与 KYB

> spec §9 第 1 条。**Day 0 必做，耗时 1–2 周，阻塞一切真实收款。**

### 1.1 先理解这一步在审什么

Polar 是 merchant of record：**买家的钱付给 Polar（美国主体），不经过你的账户**；你这边接的 Stripe Connect Express **只是打款目的地**，用到的只是 transfer 与 payout 两个功能。

由此有两个直接后果，值得写下来免得白费功夫：

- **你不需要 Stripe 商户激活审核，也不会有 Stripe 的"网站人工审核"。** memory `agensi-stripe-listing-requirements` 里那份"Stripe 数字商品网站激活审核常见毙掉原因"清单，在这条路径上不适用。这正是 spec §8 选 Polar 而非 Paddle 的核心理由。
- 但 **Polar 自己的 MoR/KYC 复审仍然存在**，约一周（Polar 文档口径）到两周（spec §8 口径）。按两周排期。

来源：[Polar 支持国家](https://polar.sh/docs/merchant-of-record/supported-countries) · [Polar 定价](https://polar.sh/resources/pricing)

### 1.2 注册与建组织

1. 打开 <https://polar.sh>，用 GitHub 或 Google OAuth 注册。**用一个你长期持有、开了两步验证的账号**——这是整条收款链的根凭据。
2. 创建组织（Organization）。

**组织 slug 要一次选对。** 它会出现在托管结账页的 URL 里（`buy.polar.sh/<slug>/…` 形态），事后更改会让已经散出去的链接失效。建议 `teachflow`；若被占用用 `crossxtop`。**不要**用带年份、带 `-test`、带个人昵称的 slug。

3. 组织设置里填：
   - **Support email** —— 填 `crossxtop@gmail.com`，与站点页脚、四个法务页逐字一致。
   - **Terms of Service URL** —— `https://tryteachflow.com/en/legal/terms`
   - **Privacy Policy URL** —— `https://tryteachflow.com/en/legal/privacy`

   后两项是结账页要展示的。memory 里记着"Checkout 配置需要 ToS/Privacy URL，实务上必须有"——这里就是那个"必须有"落地的地方。

### 1.3 同时注册 sandbox（这一步很多人漏）

<https://sandbox.polar.sh> 是**完全独立的账户体系**，不需要 KYB，注册完立刻能建商品、能发 webhook、能跑假结账。

在上面重复 §1.2 与后面的 §2、§3，你就能在等 KYB 的那两周里把 spec §7 的"真机检查"前三条全部跑完。**KYB 只阻塞真钱，不阻塞集成。**

### 1.4 KYB 材料清单

在点"Connect payout account"之前，把这些准备在手边（源文件在仓库外的 `公司信息/` 目录）：

| 项 | 取值 / 来源 | 注意 |
|---|---|---|
| 法律主体名 | `CROSSXTOP LTD` | 逐字，含 `LTD`，不加句点、不写 `Ltd.` |
| 公司注册号 | `16339041` | |
| 注册国 | United Kingdom（England and Wales） | |
| 注册办公地址 | `Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ` | 注意是 **Kington**（赫里福德郡），不是 Kingdom |
| 成立日期 | 2025-03-24 | |
| 注册证书 | `公司信息/` 下的 PDF | 可抽文本的那份 |
| 董事身份证件 | 护照 | 扫描件需四角完整、无反光 |
| 董事住址证明 | 3 个月内的账单或银行对账单 | |
| 收款银行账户 | **户名应与 `CROSSXTOP LTD` 一致** | 见下方警告 |

> **银行账户这一条最容易卡住。** 以公司主体（Company / Business）完成 Connect Express 注册时，Stripe 期待收款账户户名与法律主体一致。用董事个人账户收公司款，轻则要求补充材料、重则被要求改注册类型。若你手上还没有公司账户，**今天就去开**——英国线上商业账户（Tide、Starling 等）通常几个工作日下号，比 KYB 复审还快，不会拖慢关键路径。

### 1.5 连接 payout account

组织后台 → **Finance / Payout Accounts** → 连接 Stripe → 走 Stripe 托管的 Connect Express 流程（业务信息、身份、税号、银行账户）。

具体字段随国家与主体类型变化，以界面为准。走完后回到 Polar，状态应变成 pending review。

**填写时逐字对照 §1.4 那张表。** 主体信息不一致是这类审核的经典死因（memory 里记的 Stripe 毙掉原因第 3 条就是它），在 MoR 路径下依然成立——只是审你的人从 Stripe 换成了 Polar。

### 1.6 验收

- [ ] 正式组织已创建，slug 确定且已记下
- [ ] sandbox 组织已创建
- [ ] Payout account 状态为 pending review 或 active
- [ ] 组织的 support email / ToS URL / Privacy URL 三项已填且与站点一致
- [ ] KYB 提交日期已记在日历上，**两周后没动静就去催**

---

## 2. 在 Polar 建商品

> spec §9 第 2 条。**先在 sandbox 做一遍，正式组织审核通过后原样再做一遍。**

### 2.1 商品配置

组织后台 → **Products** → New Product：

| 字段 | 值 | 为什么 |
|---|---|---|
| Name | `TeachFlow — 6-skill bundle` | 与站点对商品的称呼一致 |
| Pricing type | **One-time payment**，固定价 | 见 §2.2 |
| Price | `29.90` USD | 与 `SITE.price.display`（`USD 29.90`）同一个数 |
| Description | 见 §2.3 | 审核员与买家都会看 |

### 2.2 两个绝不能勾的选项

**① 不要建订阅 / 周期性定价。** `src/content/legal/en/refund.md` 第一段是公开承诺：

> TeachFlow is a one-time purchase. There is **no subscription and no auto-renewal**.

后台点错一下，这句话就变成虚假陈述。**这是法律风险，不是配置偏好。**

**② 不要挂 File Download 类型的 Benefit。** Polar 支持给商品附带"自动发放的权益"（文件下载、license key 等）。挂上去，买家就有了**两条交付路径**：Polar 自己那条，和我们的 shop-api 那条。后果具体而恼人——

- Polar 那条不会随 §3.4 的版本更新分发新版，买家永远停在购买当天的版本；
- 那条路径下载的 zip **没有 `LICENSE-HOLDER.txt` 水印**，直接废掉 spec §6 版权四层里的第 2、3 层；
- 两条路径给出的文件不一致时，你没有任何办法判断某个泄露的 zip 是从哪条出去的。

**交付只能有一条路径，就是 shop-api。** Polar 在这套设计里只负责收钱和发事件。

### 2.3 商品描述写什么

至少覆盖三件事（这也是数字商品审核普遍要看的）：

1. 买到的是什么：六个 skill，各一个 zip，纯文本，无可执行代码
2. 怎么拿到：付款后邮件收到下载链接，链接有效期 30 天，可自助重发
3. 版本更新免费重下

不要在描述里复述退款天数——指向 `https://tryteachflow.com/en/legal/refund` 即可，理由与 spec 对 Agensi 的处理相同：条款会变，页面才是事实源。

### 2.4 取结账链接，接进站点

商品建好后复制它的 **checkout link**（正式组织与 sandbox 各一条，**不要记混**）。

> **这里有一处 spec 与代码的落差，需要你补。** spec §3.2 写的是 `/[lang]/buy` 跳转 `SITE.buyCtaUrl`，但 `src/config/site.ts` 里**目前没有 `buyCtaUrl` 这个字段**，`src/pages/[lang]/` 下也**还没有 `buy.astro`**。这两处属于实施工作而非人工准备，本手册只负责把链接交给你——落地时记得 `SITE.buyCtaUrl` 与价格一样，是"唯一一个出口"，不要把结账 URL 散进页面。

### 2.5 验收

- [ ] sandbox 商品已建，类型为一次性付款，价 29.90 USD
- [ ] 未勾选任何订阅选项
- [ ] 未挂任何 File Download benefit
- [ ] 结账链接已记录（sandbox / 正式 分开记）

---

## 3. Webhook 端点与 `POLAR_WEBHOOK_SECRET`

> spec §9 第 3 条。**这一节的技术细节最多，也最容易在上线当天出事。**

### 3.1 创建端点

组织设置 → **Webhooks** → Add Endpoint：

| 字段 | 值 |
|---|---|
| URL | `https://tryteachflow.com/api/webhooks/polar` |
| Format | **Raw**（不要选 Discord / Slack 格式） |
| Secret | 自己生成：`openssl rand -base64 32` |
| Events | 见 §3.2 |

```bash
openssl rand -base64 32
```

自设 secret 比用它生成的好一点：你在建端点之前就能把值写进 `/etc/teachflow/shop-api.env`，少一次来回。

### 3.2 订阅哪些事件

spec §3.2 的 `NormalizedOrderEvent` 有三类：`paid` / `refunded` / `chargeback`。对应勾选：

- `order.paid` —— **必选**，这是唯一的履约触发点
- `order.refunded` —— 必选
- `order.updated` —— 建议勾上，作为状态翻转的兜底
- 列表中任何 dispute / chargeback 相关事件 —— 有就全勾

> **拒付事件的具体名称请以界面为准。** 我没有核实 Polar 当前是否有独立的 dispute 事件类型；`order.updated` 携带状态是更稳的兜底。因此 `mor/polar.ts` 的实现原则应当是：**遇到不认识的事件类型，记一条日志并返回 200，不要 4xx。** 返回 4xx 会触发 Polar 的重试，把一个无害的未知事件变成一串失败投递。

### 3.3 验签：三个必须当心的点

Polar 遵循 [Standard Webhooks](https://polar.sh/docs/integrate/webhooks/endpoints)：请求头 `webhook-id` / `webhook-timestamp` / `webhook-signature`，签名基串 `{webhook-id}.{webhook-timestamp}.{raw body}`，HMAC-SHA256 后 base64。

**① secret 本身要先 base64 解码再拿去做 HMAC。** Standard Webhooks 规范里 secret 是 base64 编码存放的；官方 SDK 帮你做了这一步，**我们是手写验签（spec §1.4 明确不引依赖），必须自己做**。漏掉这一步的症状是"签名永远对不上，但代码看起来完全正确"。

**② 必须用原始 body 验签。** 任何 `JSON.parse` 再 `stringify` 的往返都会改变字节（键序、空白、Unicode 转义），签名必然失败。`node:http` 直接拿 raw body 正是 spec §1.4 选它而非框架的理由。

**③ 新旧两种 secret 格式。** 有资料称 2026-09-08 之后生成的 secret 走 Standard Webhooks，更早的走 Polar 自有 HMAC 格式。**我们今天新建端点，必然是新格式**，但这条值得知道——万一验签死活不过，它是一个待排查方向。

> 以上三点都**只能靠一次真实投递来确认**。上线前务必在 sandbox 打一单，把收到的 header 与 body 原样打到日志里比对一次。文档读一百遍不如一次真实请求。

### 3.4 投递行为

- **重试最多 10 次**，指数退避 —— 这正是 spec §2 里 `webhook_events` 表存在的理由，没有它就会重复建单、重复发信。
- **超时**：文档口径在 10–20 秒之间不一致。按 **2 秒内必须 ACK** 来设计：验签、去重入库、投递 pg-boss 任务，然后立刻返回 200；发信、水印这些重活全交给 worker。
- 签名无效时 Polar 侧记录为 400。

### 3.5 验收

- [ ] sandbox 端点已建，secret 已存入密码管理器
- [ ] 已勾选 `order.paid`、`order.refunded`、`order.updated` 及全部争议类事件
- [ ] 已用一次 sandbox 真实投递确认验签通过（§3.3 三点）
- [ ] 正式环境上线当天**重建一次端点**，用不同的 secret

---

## 4. Cloudflare R2

> spec §9 第 4 条。**10 分钟，无阻塞。**

### 4.1 建桶

Cloudflare 后台 → **R2 Object Storage** → Create bucket。

- **名称**：`teachflow-masters`
- **Location hint**：选欧洲（贴近 Hetzner，回源更快）
- **不要选 "Jurisdiction: European Union"**

> 为什么不选 EU jurisdiction：它**不可逆**，而且会把 S3 端点主机名变成 `<account>.eu.r2.cloudflarestorage.com`，多一处易错配置。选它的唯一理由是数据驻留合规，而 **R2 里存的是 master zip——产品母版，不含任何个人数据**（买家水印按 spec §3.3 在下载时于内存中注入，从不落 R2）。没有个人数据，就没有驻留义务。普通桶 + location hint 足够。

**公开访问必须保持关闭。** 不绑自定义域、不开 `r2.dev` 公开访问。master 一旦可匿名取，整个付费闸门就没了意义。

### 4.2 建 API token

R2 页面 → **Manage API Tokens** → Create **Account** API token（不是 User token——User token 绑在你的个人用户上，用户被移除即失效）：

- **Permission**：`Object Read & Write`
- **Scope**：只勾 `teachflow-masters` 这一个桶，不要 "Apply to all buckets"
- **TTL**：永不过期（服务端长期运行，过期 = 半夜静默故障）

创建后立刻复制 **Access Key ID** 与 **Secret Access Key**。**Secret 只显示这一次。**

### 4.3 Account ID 与端点

Account ID 在后台 URL 里：`https://dash.cloudflare.com/<ACCOUNT_ID>/r2`，32 位十六进制。

给实现者的三条约定（`shop-api/src/lib/storage.ts` 手签 SigV4，没有 SDK 兜底）：

- 端点：`https://<ACCOUNT_ID>.r2.cloudflarestorage.com` —— **只到账户级主机名，不要拼桶名、不要拼路径**
- region：`auto`；service：`s3`
- payload hash：zip 只有 ~230 KB，**直接算整体 SHA-256**，不要用 `UNSIGNED-PAYLOAD`，省掉一类签名歧义

来源：[R2 Authentication](https://developers.cloudflare.com/r2/api/tokens/) · [R2 S3 兼容](https://developers.cloudflare.com/r2/get-started/s3/)

### 4.4 验收

- [ ] 桶已建，公开访问关闭
- [ ] Account API token 已建，权限 Object Read & Write，仅限该桶
- [ ] 四个值（account id / key id / secret / bucket）已入密码管理器
- [ ] 用 `curl` 或任意 S3 客户端做过一次 PUT + GET 往返

---

## 5. Resend

> spec §9 第 5 条。**DNS 生效需要等，Day 0 就把域名加上。**

### 5.1 先解决一个前提问题

`MAIL_FROM` **不可能**是 `crossxtop@gmail.com`——Resend 只能从你验证过的域名发信，gmail.com 不是你的域名。

于是出现一个必须当场决定的事：**发信地址与客服地址将是两个不同的地址。** 四个法务页里写了十几处"email crossxtop@gmail.com"，买家收到的交付邮件却来自 `@tryteachflow.com`。

处理办法（按推荐排序）：

1. **交付邮件设 `Reply-To: crossxtop@gmail.com`**，正文里同时写明客服邮箱。买家直接回信也能到你手上，法务页一个字不用改。**推荐这条。**
2. 把客服邮箱整体迁到自有域名（`support@tryteachflow.com`），四个法务页 × 双语 + `src/config/site.ts` + `shop-api/src/brand.ts` 同步改。更干净，但改动面大，且 `scripts/verify-build.mjs` 的 `entity-details` 检查会盯着这个串，改就要全改。

无论选哪条，**你实际监控的那个收件箱必须真的有人看**。`deploy/README.md` §5 已经把"客服邮箱真实可达并已测试收信"列为必须人工做的一条，这里再叠一遍：**交付邮件的 Reply-To 也要测一次**。

### 5.2 加域名

Resend 后台 → **Domains** → Add Domain。

**填子域名 `send.tryteachflow.com`，不要填根域名。** 理由：根域名的 SPF / DMARC 往往还要留给别的用途，子域名隔离后，发信配置出问题不会波及根域名的邮件信誉。

`MAIL_FROM` 随之定为：

```
TeachFlow <noreply@send.tryteachflow.com>
```

### 5.3 配 DNS 并验证

Resend 会列出需要添加的记录（通常是 DKIM 的 TXT/CNAME + SPF 的 MX 与 TXT）。到域名的 DNS 处（多半就是 Cloudflare，与 §4 同一个账户）逐条加上，回 Resend 点 "I've added the records"。

> **Cloudflare 特有的坑**：这些记录必须是 **DNS only（灰云）**，不要开橙云代理。邮件相关记录被代理会直接失效。

几分钟到一小时内状态转为 verified。Resend 会分别标出 DKIM / SPF / MX 哪一条没过，按提示修即可。

**再加一条 DMARC**（Resend 不强制，但直接影响进收件箱而不是垃圾箱）：

- 名称：`_dmarc.send.tryteachflow.com`
- 类型：TXT
- 值：`v=DMARC1; p=none; rua=mailto:crossxtop@gmail.com`

先用 `p=none` 观察，确认所有正常邮件都 `dmarc=pass` 之后再收紧到 `p=quarantine`。

来源：[Resend DMARC 文档](https://resend.com/docs/dashboard/domains/dmarc) · [邮件认证指南](https://resend.com/blog/email-authentication-a-developers-guide)

### 5.4 建 API key

**API Keys** → Create：

- **Permission：Sending access**（不要 Full access——这个 key 只需要发信）
- **Domain：限定到 `send.tryteachflow.com`**

`re_…` 开头，**只显示一次**。

### 5.5 配额这件事要现在想清楚

免费版：**每日 100 封（UTC 日历日重置）、每月 3,000 封**，To/CC/BCC 每个收件人单独计数。

`DAILY_MAIL_BUDGET` 默认 80，留 20 封给当天的交易邮件——这是 spec §3.4 的设计。但真正会先撞墙的是**月额度**：

| 买家数 | 一次全量更新群发 | 占月额度 |
|---|---|---|
| 100 | 100 封 | 3% |
| 500 | 500 封 | 17% |
| 1,000 | 1,000 封 | 33% |

日配额耗尽会由 pg-boss 自动顺延到次日（spec §3.4 第 4 步），**月配额耗尽不会**——它会让发信在月底直接失败。**买家数过 500 就该升级付费档**，把这个数记在你的运营看板上。

### 5.6 验收

- [ ] `send.tryteachflow.com` 状态 verified
- [ ] `_dmarc` TXT 已加，`p=none`
- [ ] API key 为 Sending-only 且限定该域名
- [ ] 已向自己的 Gmail 发一封测试信，**确认进收件箱而非垃圾箱**
- [ ] 已确认 Reply-To 回信能到达客服邮箱

---

## 6. 服务器：PostgreSQL 16、目录与密钥

> spec §9 第 6 条。以下命令按 Debian 12 / Ubuntu 24.04 写；发行版不同请自行折算。

### 6.1 装 PostgreSQL 16

发行版自带的版本未必是 16，用 PGDG 官方源锁死版本：

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
sudo apt install -y postgresql-16
```

### 6.2 建角色与库

```bash
sudo -u postgres psql -c "CREATE ROLE teachflow LOGIN PASSWORD '<强密码>';"
sudo -u postgres psql -c "CREATE DATABASE teachflow OWNER teachflow;"
```

> 让 `teachflow` 当库的 owner 不是图省事：**pg-boss 会在运行时创建自己的 `pgboss` schema**，角色必须在该库上有 CREATE 权限。owner 身份一次性满足这个条件。

### 6.3 确认只监听本机

```bash
sudo -u postgres psql -c "SHOW listen_addresses;"   # 期望 localhost
```

Debian 系默认就是 `localhost`。若不是，改 `/etc/postgresql/16/main/postgresql.conf` 的 `listen_addresses = 'localhost'` 后 `sudo systemctl restart postgresql`。

顺手确认 `pg_hba.conf` 里本地 TCP 连接用的是 `scram-sha-256` 而非 `trust`：

```bash
sudo grep -E '^(local|host)' /etc/postgresql/16/main/pg_hba.conf
```

**这一条是 spec §1.2 "Postgres 不出公网"整个论证的落点**——正是因为它只监听 127.0.0.1，才省掉了 TLS、连接池和 IP 白名单。别为了图方便改成 `*`。

### 6.4 `DATABASE_URL` 的密码要 URL 编码

```
postgres://teachflow:<urlencoded-pwd>@127.0.0.1:5432/teachflow
```

密码里若有 `@ : / ? # [ ] %` 必须百分号编码。生成密码时直接避开这些字符更省事：

```bash
openssl rand -hex 24
```

### 6.5 生成自有密钥

```bash
openssl rand -hex 32      # → ADMIN_TOKEN
openssl rand -base64 48   # → DOWNLOAD_TOKEN_SECRET（config.ts 要求 ≥ 32 字节）
```

### 6.6 目录

```bash
sudo mkdir -p /srv/teachflow/masters
sudo chown <服务账户>:<服务账户> /srv/teachflow/masters
sudo chmod 700 /srv/teachflow/masters
```

**`/srv/teachflow/masters` 与 Caddy 的 webroot `/srv/teachflow/dist` 是兄弟目录，不是父子。** 这是有意的：Caddy 的 `root` 指向 `dist`，masters 在它之外，任何路径穿越都到不了。**永远不要把 masters 挪进 dist**，那等于把付费内容摆在公网上。

### 6.7 写环境变量文件

```bash
sudo mkdir -p /etc/teachflow
sudo install -m 600 -o root -g root /dev/null /etc/teachflow/shop-api.env
sudo -e /etc/teachflow/shop-api.env
```

内容即 §0.2 那张表的十二行 `KEY=value`。写完 `sudo systemctl daemon-reload` 前先自检一遍：

```bash
sudo grep -c '=' /etc/teachflow/shop-api.env   # 期望 ≥ 12
```

### 6.8 备份（spec 没写，但你需要它）

**R2 存的是 master，Postgres 存的是"谁买了"。丢了 master 可以从 `TeachFlow-KR/dist/` 重新发版；丢了 Postgres，所有买家都无法再下载，而你连他们是谁都不知道。**

`orders` / `entitlements` 是这套系统里唯一无法重建的数据。装个每日转储：

```bash
sudo -u postgres pg_dump -Fc teachflow > /srv/teachflow/backup/teachflow-$(date +%F).dump
```

挂进 systemd timer 每日跑，保留 30 天，并同步一份到 R2（同一个桶开个 `backups/` 前缀即可，反正它已经在异地）。

### 6.9 验收

- [ ] `psql "postgres://teachflow:…@127.0.0.1:5432/teachflow" -c 'select 1'` 成功
- [ ] `SHOW listen_addresses` 为 `localhost`
- [ ] 从服务器外部 `nc -vz <host> 5432` **连不上**
- [ ] `/srv/teachflow/masters` 存在、权限 700、在 webroot 之外
- [ ] `/etc/teachflow/shop-api.env` 权限 600、owner root
- [ ] 备份 timer 已启用并成功跑过一次

---

## 7. Caddy

> spec §9 第 7 条写的是"增加两条 `reverse_proxy`"。**这句话不完整——照做会让 `/api/*` 全部 302 到 `/en`。** 下面是完整改法。

### 7.1 为什么不止两条

现有 `deploy/Caddyfile` 里有三个 matcher 会拦到新路径：

| matcher | 现有行为 | 对新路径的后果 |
|---|---|---|
| `@unknown_locale` | `not path / /en /en/* /ko /ko/* /_astro/* …` 之外的一切 302 到 `/en` | **`/api/webhooks/polar` 被 302，webhook 永远收不到** |
| `@html` | 反向排除写的"除静态资源外一切"都加 `Cache-Control: public, max-age=0, must-revalidate` | 带 token 的下载页与 zip 流被标成 `public` 可缓存 |
| `handle_errors` | 任何错误都 rewrite 到本地化 404 页 | shop-api 挂掉时的 502 被改写成 404 页面，排障时误导 |

第一条是**致命**的：Caddy 的默认指令顺序里 `redir` 排在 `handle` **之前**，所以哪怕你把 `reverse_proxy` 包进 `handle /api/*`，`redir @unknown_locale` 仍然先执行、先把请求跳走。**必须改 matcher 本身，绕不过去。**

### 7.2 改法

在 `deploy/Caddyfile` 的站点块里做三处改动：

**① 扩两个排除清单**（两行都加 `/api/*`、`/download`、`/download/*`）：

```caddyfile
@unknown_locale not path / /en /en/* /ko /ko/* /_astro/* /fonts/* /samples/* /api/* /download /download/* /favicon.svg /robots.txt /sitemap* /404.html
```

```caddyfile
@html not path /_astro/* /fonts/* /api/* /download /download/* /favicon.svg /robots.txt /sitemap*
```

> 注意 `/download` 与 `/download/*` **必须分别列出**。Caddy 的路径匹配里斜杠有意义，`/download/*` 匹配不到裸 `/download`——而 spec §3.3 的下载页正是裸 `/download?t=…`。这个坑现有 Caddyfile 已经就 `/en` 踩过一次并写了注释，同一个坑不要踩第二次。

**② 加反代块**，放在 `try_files` 之前：

```caddyfile
	@shop path /api/* /download /download/*
	handle @shop {
		reverse_proxy 127.0.0.1:8787 {
			header_up X-Forwarded-For {remote_host}
		}
	}
```

`reverse_proxy` 是终结型 handler，命中后后面的 `try_files` / `file_server` 不会再执行。

> `X-Forwarded-For` 不是装饰：spec §3.3 第 6 步要把真实 IP 写进 `downloads` 表当举证链，不加这个头，入库的全是 `127.0.0.1`。（Caddy 默认会追加 XFF，显式写出来是为了让这个依赖在配置里可见。）

**③ 错误页别吞掉后端故障**——在 `handle_errors` 顶部加一条透传：

```caddyfile
	handle_errors {
		@shop_err path /api/* /download /download/*
		respond @shop_err "{err.status_code} {err.status_text}" {err.status_code}
		… 现有三条 rewrite 与 file_server 不变 …
	}
```

shop-api 宕机时你应当看到 502，而不是一个假装正常的韩文 404 页。

### 7.3 systemd

两个单元：`teachflow-shop-api.service`（`npm start`）与 `teachflow-shop-worker.service`（`npm run worker`）。两者都：

```ini
[Unit]
After=postgresql.service
Wants=postgresql.service

[Service]
EnvironmentFile=/etc/teachflow/shop-api.env
Restart=always
RestartSec=5
```

`shop-api` 的 `package.json` 声明 `"engines": { "node": ">=22.18.0" }`，且 `start` 直接跑 `node src/server.ts`（靠 Node 内建的 TypeScript 剥离）——**服务器上的 Node 必须 ≥ 22.18**。这与站点仓库的 `>=20.3.0` 不同，装错版本的症状是启动时一个看不懂的语法错误。

> 另外注意：`deploy/README.md` 开头写着"服务器上不需要 Node 运行时"。**那句话从今天起失效了**，改 Caddy 的同时记得把它一并订正。

### 7.4 reload 与验收

```bash
caddy validate --config /etc/caddy/Caddyfile
SITE_DOMAIN=tryteachflow.com caddy reload --config /etc/caddy/Caddyfile
```

```bash
DOMAIN=tryteachflow.com

# 新增的三条
curl -sI "https://$DOMAIN/api/health" | head -1          # 200，不是 302
curl -s  "https://$DOMAIN/api/health"                    # {"ok":true,…}
curl -sI "https://$DOMAIN/download" | head -1            # 400/401 之类，不是 302

# deploy/README.md §6 原有的三条必须仍然全绿
curl -sI "https://$DOMAIN/en" | head -1                  # 200，不是 308
curl -sI "https://$DOMAIN/en/does-not-exist" | head -1   # 404，不是 200
curl -sI "https://$DOMAIN/" | head -1                    # 302 → /en
```

**上面第三组是回归检查，不是可选项。** 你动的是三个 matcher，而这三条 curl 正是它们唯一的运行时验证出口（本地沙箱没有 caddy 二进制）。

---

## 8. 法务页同日更新

> spec §9 第 8 条。**四页 × 两语 = 八个文件，必须与开卖同一天发布**，因为 `terms.md` 承诺"以购买当日公布的版本为准"。

### 8.1 `delivery.md`：2 个工作日 → 即时

**EN**，改 "If you bought directly from us" 整段。现文：

> We email your download link within **2 business days** of confirming payment…

改成描述真实行为：付款确认后几分钟内邮件送达 · 链接 30 天有效 · 过期可在站上自助重发 · 版本更新免费重下 · 每份文件带持有人标记。

**KO**，同段的 `**영업일 기준 2일** 이내에` 同步改。

注意：同一文件末尾"파일에 문제가 있다면 / If something is wrong with the files"段里的 "2 business days" 说的是**客服回复时效**，那个数没变，**不要一起改掉**。

### 8.2 `refund.md`：把"尚未下载"锚到下载记录

现文已经把退款窗口绑在下载动作上（"provided you have not yet downloaded the files"），方向正确。要补的是**依据**：说明系统会记录每次下载的时间，该记录即为判定依据。

这同时是在向买家披露 `downloads` 表的存在——**GDPR 下这是必须披露的处理活动**，藏着不说反而是问题。

### 8.3 `privacy.md`：改动最大的一页

四处：

**① 直销数据流。** 新增一节，说明：Polar 作为 merchant of record 是结账环节的控制者，我们收到的是订单记录而非卡号；我们自己存的是买家邮箱、订单号、金额、每次下载的时间/IP/User-Agent。

**② 子处理者清单。** Polar（MoR 与结账）· Stripe（打款）· Resend（发信）· Cloudflare R2（母版归档）· Hetzner（托管）。现文只笼统说"a regulated payment provider"，直销上线后要具名。

**③ 下载水印。** 每份下载的 zip 内含买家邮箱与订单号。这是把个人数据写进交付物，**必须明写**，理由（防止未授权再分发）也一并写清。

**④ 留存期——这一条是必须修的矛盾。** 现文写着：

> Our web server keeps standard request logs — IP address, timestamp, requested path, user agent — … our policy is to retain them for no longer than 30 days.

而 `downloads` 表存的正是 IP + UA，且按 spec §6 要当举证链，保存期必然远超 30 天。**照现在这个写法，上线当天隐私政策就是不准确的。** 处理办法：把下载记录单独成条，给它自己的留存期（建议 12 个月，与举证需要相称）和自己的合法性基础（正当利益——防范未授权再分发与拒付举证），与 30 天的通用 web 日志分开写。

顺带核对现文这句在直销下是否仍成立：

> **No third-party requests.** Everything a page needs is served from our own domain.

**仍然成立**——`/download` 由 shop-api 在同域服务端渲染、内联 CSS、无脚本（spec §3.3），结账是用户主动点击后跳走的外链，与现文已有的"A link is not a request"论述一致。**但前提是 `/download` 页面真的不引任何外部资源、不设 cookie。** 实施时守住这条，这一页就不用改。

### 8.4 `terms.md`：只需核对，外加一件事要提前确认

版本条款已经写好了（"the version in force for your purchase is the one published on the day you bought"），spec §3.1 的版本不可变设计正是靠它。**不用改。**

但 `refund.md` 的韩国段落藏着一个**需要提前确认的外部依赖**：

> Under the proviso to Article 17(2), that limit applies only if the seller has taken the measures required by Article 17(6): for digital content, both stating clearly that withdrawal is then unavailable **and** providing a trial — a preview, time-limited access, or a trial version…
> If those measures are missing, the 7-day right still applies.

也就是说，**"开始下载即不可撤回"这条限制，在韩国只有在你提供了试用/预览的前提下才成立。** 站上的 `/samples` 页目前是：五张卡都有真实渲染的预览图，但只有听力音频以其标称格式（.mp3）真实可下载，另外四张仅预览。

这大概率已满足"preview"的要求（Enforcement Decree 21-2 允许"체험판" 或在不可行时以内容信息替代），**但这是法律判断，不是我能替你拍板的事。** 上线前确认一次：要么接受现状并在结账流程中明确告知不可撤回，要么在 `/samples` 补一个更完整的试用包。**不要默认它已经解决了。**

### 8.5 发布前必跑

八个文件都要把 frontmatter 的 `updated` 刷成同一天。然后：

```bash
npm run verify:all
```

`scripts/verify-build.mjs` 会卡住三类回归：语言对等（八个文件必须成对）、价格写法（必须是 `USD 29.90`）、主体信息四项逐字一致。**改完法务页不跑这条就部署，最容易漏的是只改了英文没改韩文。**

### 8.6 验收

- [ ] 八个文件 `updated` 日期一致，且等于开卖日
- [ ] `delivery.md` 双语的"2 个工作日"已改为即时交付；客服回复时效那个"2 天"**未被误改**
- [ ] `refund.md` 双语已说明下载记录为判定依据
- [ ] `privacy.md` 双语已加：直销数据流 · 子处理者具名 · 水印披露 · **下载记录的独立留存期**
- [ ] 韩国法试用义务已确认（§8.4）
- [ ] `npm run verify:all` 退出码 0

---

## 9. 全链路验收（spec §7"真机检查"的可执行版）

八条做完后，按这个顺序跑一遍。**先在 sandbox 跑完 1–5，正式环境再跑一遍 1–2。**

| # | 动作 | 期望 | 失败时看哪 |
|---|---|---|---|
| 1 | Polar 沙箱下一单 | 几分钟内收到交付邮件，链接可打开 | webhook 投递日志 → §3.3 三个验签坑 |
| 2 | 下载一个包 | 含 `<skill>/LICENSE-HOLDER.txt`，邮箱与订单号正确 | 水印模块 |
| 3 | 在 Polar 后台重放同一事件 | **不产生第二条订单、不发第二封信** | `webhook_events` 去重 |
| 4 | 在 Polar 后台退款 | 下载立刻 403 | `orders.status` 翻转 |
| 5 | 发一个新版本 | 老 token 直接取到新版本，无需重新付款 | `notify-update` 任务 |
| 6 | `curl https://tryteachflow.com/api/health` | `{ ok, db, r2, queue }` 全 true | 对应子系统 |
| 7 | 故意停掉 shop-api 再 curl `/api/health` | **502**，不是韩文 404 页 | §7.2 第 ③ 项没做 |
| 8 | `curl -sI https://tryteachflow.com/en` | **200**，不是 308 | §7.2 改 matcher 时破坏了 `try_files` |

第 3 条和第 7 条最容易被跳过，也最容易在真实流量下咬人——**重放是 Polar 的正常行为（最多重试 10 次），不是异常。**

---

## 10. 本手册对 spec §9 的三处订正

写这份手册时发现的、spec §9 原文不准确的地方，一并记下：

1. **§9 第 7 条"Caddy 增加两条 `reverse_proxy`"不足以工作。** 现有 Caddyfile 的 `@unknown_locale` 会在 `handle` 之前把 `/api/*` 302 到 `/en`（Caddy 默认指令顺序中 `redir` 先于 `handle`）。必须同时修改三个 matcher，见 §7.2。
2. **§9 开头"代码不依赖，最后统一执行"对第 1 条不成立。** Polar KYB 耗时 1–2 周，必须 Day 0 启动；但 sandbox 账户无需审核，集成工作不被阻塞。见 §0.1。
3. **§9 第 8 条漏了一项。** `privacy.md` 现有的"web 日志保留不超过 30 天"与 `downloads` 表的长期留存直接冲突，不是"新增一节"能解决的，是必须修改现有措辞。见 §8.3 第 ④ 项。

另有两项属于实施范围、但在人工准备阶段就该知道：

- `src/config/site.ts` **没有 `buyCtaUrl` 字段**，`src/pages/[lang]/buy.astro` **不存在**（spec §3.2 假定两者存在）。
- `deploy/README.md` 开头"服务器上不需要 Node 运行时"在 shop-api 上线后失效，需同步订正。
