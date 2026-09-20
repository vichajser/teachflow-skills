# TeachFlow 官网直销方案：上传 · 版本更新 · 支付后下载 · 安全与版权

核查日期：2026-09-20
状态：方案待拍板（§1.4 的三选一是唯一阻塞项）
范围：官网（tryteachflow.com）自营直销链路。Agensi 渠道不变，继续按 `docs/agensi-listing-gap.md` 推进。

---

## 0. 现状盘点（方案的地基，全部实测）

| 事实 | 出处 |
| --- | --- |
| 站点是 Astro 5 纯静态产物，`dist/` 由 Hetzner 上的 Caddy 直接托管，**服务器没有 Node 运行时** | `README.md`、`deploy/README.md` |
| 部署唯一闸门是 `npm run verify`（只读 `dist/` 的纯校验脚本），完整链是 `verify:all` | `scripts/verify-build.mjs` |
| 公司主体、价格、客服邮箱的唯一出口是 `src/config/site.ts`；价格全站只有一个数：USD 29.90（六合一 bundle 价） | `src/config/site.ts` 第 22–32 行 |
| 六个 skill 是纯 markdown zip（23.2–63.9 KB），无可执行代码、无网络访问，8 项安全扫描已逐项对应 | `docs/agensi-listing-gap.md` §1.1–1.2 |
| 法务页四份已上线（en/ko 双语）：terms / privacy / refund / delivery | `src/content/legal/` |
| **zip 内 LICENSE 仍是 MIT，与官网专有许可互相矛盾**，已决定替换、尚未执行 | `docs/agensi-listing-gap.md` §3.2 |
| 目前"直销"在法务文本里的定义是**手工流程**：邮件发票 + 确认付款后 2 个工作日内人工发下载链接 | `src/content/legal/en/delivery.md`、`refund.md` |
| 退款政策把直销退款条件写成"**未下载才退款**"——手工时代无法证明"没下载"，自动化后下载日志让这条真正可执行 | `refund.md` "If you bought directly from us" 节 |
| 条款已预设直销主体："If you bought directly from us, CROSSXTOP LTD is the seller." | `terms.md` "Who you are contracting with" 节 |
| Stripe 侧已有的合规准备：页脚公司信息与 Companies House 逐字一致、无 Basic Auth、无 noindex、价格记法统一，这些都有 `verify` 检查钉死 | `deploy/README.md` §5 |
| Stripe Connect（Agensi payout 用）**不等于**直销商户账号——直销需要完整的 Stripe 商户激活与人工复审 | `docs/agensi-listing-gap.md` §2.2 |

**结论**：法务框架和 Stripe 审核姿态已经按"将来会直销"写好，缺的是整条技术链路和一个关键决定（谁当 merchant of record）。

---

## 1. 总体架构

### 1.1 不可动的约束

1. 前台保持 Astro 静态站。购买按钮跳支付，**不在官网托管支付表单**（PCI 边界交给 Stripe/平台）。
2. `npm run verify` 仍是部署闸门；新增页面必须扩检查，不许放宽规则让它变绿（`deploy/README.md` §1 的既有原则）。
3. 六个 zip 的构建与校验仍由 `TeachFlow-KR/package.py` 产出——上传系统**不重打包内容**，只做验收、登记、分发。
4. 全站价格仍只有 USD 29.90 一个数（`site.ts` 唯一出口）。直销价 = bundle 价，不新增单品阶梯（单品入口留在 Agensi）。

### 1.2 架构总览（推荐形态）

```
买家                    官网(静态, Caddy)              直销服务(新增, 唯一动态件)
 │ 点 Buy                    │                              │
 │──────────────────────────▶│ /en/buy 静态页                │
 │                           │ 按钮 → Stripe Checkout        │
 │──────────────────────────────────────────────────────────▶│
 │  Stripe 托管收银台（卡/Apple Pay/…）                        │
 │◀──────────────────────────────────────────────────────────▶
 │                           │                              │ ◀── webhook:
 │                           │                              │     checkout.session.completed
 │                           │                              │     → 建订单 → 发下载页链接邮件
 │ 收邮件，打开下载页 /download?t=JWT                          │
 │──────────────────────────────────────────────────────────▶│
 │  下载页列 6 个 zip + 版本号 + SHA-256                       │
 │  每个文件走 10 分钟短时签名 URL，服务端动态注入购买人水印      │
```

动态件只有**一个**：一个约 300–500 行的直销服务（下称 `shop-api`），负责四件事——Stripe webhook、订单/授权表、zip 存储与签名下载、管理员上传。

### 1.3 `shop-api` 放哪：两个候选

| | A. Hetzner 同机小服务（推荐） | B. Cloudflare Workers + R2 + D1 |
| --- | --- | --- |
| 形态 | Node 20 单进程 + SQLite，Caddy `reverse_proxy /api/*` 转发，文件存 `/srv/teachflow/files/`（webroot 之外） | 无服务器，Hetzner 继续保持纯静态 |
| 运维面 | 多一个 systemd 单元；与现有 rsync/Caddy 同机同流程 | 新增 Cloudflare 账号与一套平台概念 |
| 与既有约束的冲突 | 打破"服务器不需要 Node 运行时"（`README.md`）——但这是为直销付的明确代价，静态站部分不受影响 | 不打破 |
| 成本 | 0 增量（同机） | 免费额度内基本为 0 |
| 锁死风险 | 无 | Workers/D1/R2 是平台专属 API |

**推荐 A**：一个运维面、无新平台依赖、SQLite 对订单量级（个位数到百位数/月）绰绰有余。B 作为"不想在服务器上跑 Node"的备选，架构设计不变，只是适配层换掉。

### 1.4 唯一阻塞决策：谁当 merchant of record（MoR）

| | 方案一：Stripe 直销（CROSSXTOP 自己是卖家） | 方案二：MoR 平台（Paddle / Lemon Squeezy / Polar 等） |
| --- | --- | --- |
| 卖家身份 | CROSSXTOP LTD——与 `terms.md` 现有文本一致 | 平台是 MoR——`terms.md` 需加一节，照 Agensi 节的写法复制 |
| 税务 | **自己扛**：英国 VAT（注册阈值内可豁免，但卖到 EU/韩国是另一回事，见 §6.3）；Stripe Tax 可自动计税但申报仍是你的 | 平台全包 VAT/销售税，你拿净额分账 |
| 费率 | 约 1.5%–2.9% + 固定费 + Stripe Tax 0.5% | 约 5% + $0.50 |
| 与现有资产的关系 | 站点的 Stripe 复审姿态（实体一致、无 basicauth、价格记法）就是为此准备的 | 复审姿态同样有用（MoR 也审店） |
| 代码量 | webhook + 计税 + 发票邮件 | webhook 几乎相同，无计税 |

**建议**：
- 若预期月销 < 几十单且主要买家在韩国：**先用方案二（MoR）上线**，把 VAT/韩国电子服务税的合规负担整体外包，跑通需求后再评估迁移。
- MoR 三家的费率与接入差异已核实并细化到 **附录 A**（2026-09-20 对三家官方页面逐一核实）；结论：**首选 Polar（Starter），备选 Paddle，Lemon Squeezy 因注册通道不确定排第三**。
- 若确定要 Stripe 直销：§6 的全部税务准备项必须先做完，尤其是韩国 VAT 简易登记（见 §6.3）。
- **代码层把 webhook 处理写成适配器**（`stripe.ts` / `mor.ts` 各实现同一接口），两个方案共享订单、下载、水印逻辑，将来换轨成本是一周而非重做。

---

## 2. 功能设计

### 2.1 数据模型（SQLite，四张表）

```sql
CREATE TABLE releases (            -- 版本登记：上传的物理产物
  id INTEGER PRIMARY KEY,
  skill_id TEXT NOT NULL,          -- lesson-workflow 等六个枚举
  version TEXT NOT NULL,           -- semver，来自 SKILL.md frontmatter
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  file_path TEXT NOT NULL,         -- /srv/teachflow/files/<skill>/<version>.zip
  changelog TEXT NOT NULL,         -- 上传时必填，空的不收
  uploaded_at TEXT NOT NULL,
  UNIQUE(skill_id, version)
);

CREATE TABLE orders (              -- 订单：webhook 是唯一写入入口
  id TEXT PRIMARY KEY,             -- Stripe session id / MoR order id
  provider TEXT NOT NULL,          -- 'stripe' | 'mor'
  buyer_email TEXT NOT NULL,
  amount INTEGER NOT NULL,         -- 分
  currency TEXT NOT NULL,
  status TEXT NOT NULL,            -- paid | refunded | chargeback
  created_at TEXT NOT NULL
);

CREATE TABLE entitlements (        -- 授权：一个订单对全部六个 skill
  order_id TEXT NOT NULL REFERENCES orders(id),
  skill_id TEXT NOT NULL,
  PRIMARY KEY (order_id, skill_id)
);

CREATE TABLE downloads (           -- 下载日志：退款政策"未下载才退款"的证据
  id INTEGER PRIMARY KEY,
  order_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  version TEXT NOT NULL,
  ip TEXT NOT NULL,
  downloaded_at TEXT NOT NULL
);
```

`downloads` 表不是可选的——`refund.md` 承诺的"provided you have not yet downloaded"靠它举证，拒付（chargeback）抗辩材料也靠它。

### 2.2 上传与版本更新流程（管理员侧）

**有意不做 web 上传表单**。上传者只有你一个人，攻击面最小的做法是 CLI 脚本 + bearer token：

```bash
python3 tools/publish.py \
  --zip dist/lesson-workflow.zip \
  --skill lesson-workflow --version 1.1.0 \
  --changelog "修正 worksheet 依赖行措辞"
```

服务端验收管线（全部通过才入库，任何一步失败原样退回、不留半成品）：

1. **认证**：`Authorization: Bearer <SHOP_ADMIN_TOKEN>`，token 只存在于服务器环境变量，不进仓库、不进前端 bundle。
2. **zip 结构检查**：无二层嵌套 zip、无 `../` 路径穿越条目、无绝对路径条目、无 `.DS_Store`/`__MACOSX`、单文件 < 1 MB、总大小 < 5 MB（当前最大 zip 63.9 KB，上限给足余量但仍挡 zip bomb）。
3. **安全复扫**：把 `TeachFlow-KR/verify.py` 的 8 项检查（prompt injection 公告在位、无外部 URL、无 secret 模式、无危险命令、无混淆、无 credential 访问）抽成共享模块，服务端重跑一遍——本地过了不等于上传路上没被污染。
4. **版本单调递增**：同 skill 新版本必须 semver 大于当前最新版；不许覆盖已存在的 (skill, version)——**已售出的版本不可变**，这是版权与退款争议时的物证。
5. **登记**：算 SHA-256、落盘到 webroot 之外、写 `releases`。
6. **回执**：脚本输出版本号、SHA-256、下载页上买家将看到的 changelog。

**版本更新对买家的呈现**（延续 Agensi 渠道已承诺的政策："版本更新对老买家免费重新下载"，`agensi-listing-gap.md` 步骤 11）：

- 下载页对每个 skill 显示当前最新版 + 该买家可下的历史版本。
- 新版本发布后给所有 `status = paid` 的买家发一封更新邮件（版本号 + changelog + 下载页链接）。
- SKILL.md frontmatter 里补 `version:` 字段（现在没有），`package.py` 打包时校验它与 `--version` 一致。

### 2.3 支付后下载流程（买家侧）

1. `/en/buy`（静态页）：价格块复用 `PriceBlock.astro`，按钮跳 Checkout。**Checkout 按钮文案与 USD 29.90 记法由 `site.ts` 驱动**，`verify-build.mjs` 的 price-notation 检查自动覆盖新页面。
2. Stripe 托管收银台收款 → webhook `checkout.session.completed`：
   - 验签（`stripe.webhooks.constructEvent`，签名密钥只存服务器环境变量）；
   - 幂等建单（session id 作主键，重复投递不产生第二单）；
   - 建六条 entitlement；
   - 生成下载 token（JWT，HS256，30 天有效，可续发）；
   - 发下载页链接邮件。邮件里写 UK/EU/Korea 法定撤销权的确认文字——**把现在 `refund.md` 里"invoice email 里确认"的承诺原样搬进这封自动邮件**，文案不得改写。
3. 下载页 `/download?t=...`：列六个 skill、当前版本号、changelog、每个 zip 的 SHA-256。
4. 点下载 → 服务端生成**单个文件、10 分钟有效**的签名 URL → 响应时**动态注入水印**（见 §3.2）→ 写 `downloads` 日志。
5. token 过期：买家在下载页输入购买邮箱，重发链接（验证邮箱下存在 paid 订单才发——不存在也返回相同文案，防邮箱枚举）。
6. 退款/chargeback webhook：`status` 翻转，entitlement 即刻失效，后续下载 403；**已下载文件不追索**（`terms.md` 已写明 "we cannot and do not disable files already on your machine"）。

**法务页连带改动**（自动化上线当天必须同批发布，否则页面承诺与实际行为矛盾）：
- `delivery.md`："If you bought directly from us" 节从"2 个工作日内邮件发送"改为"支付完成后立即发邮件"；保留"没收到就写信"的兜底。
- `refund.md`：直销节补一句"下载与否以我们的下载日志为准"。
- `privacy.md`：补支付处理方（Stripe/MoR）与"保留订单与下载日志用于退款与争议处理"两条。
- 以上 en/ko 双语同步，`updated` 日期刷新——`terms.md` 承诺过 "The version in force for your purchase is the one published on the day you bought"，日期就是版本号。

### 2.4 前端改动清单（静态侧，全部走既有构建链）

| 改动 | 位置 |
| --- | --- |
| 新增 Buy 页 ×2（en/ko） | `src/pages/[lang]/buy.astro` |
| 下载页外壳（token 校验与文件列表由 `shop-api` 渲染，静态侧只有一个跳转/说明页） | `src/pages/[lang]/download.astro` |
| `SITE` 常量补 `buyCtaUrl`（Checkout 链接或 `/api/checkout` 端点） | `src/config/site.ts` |
| i18n 文案（buy/download 两页） | `src/i18n/en.json`、`ko.json` |
| `verify-build.mjs` 新增检查：buy 页存在、含 Checkout 端点、价格记法仍唯一 | `scripts/verify-build.mjs` |
| 单测：`SITE.buyCtaUrl` 存在性、i18n key 双语对齐 | `tests/unit/` |

---

## 3. 安全设计

### 3.1 威胁模型（按现实概率排序）

| 威胁 | 现状/对策 |
| --- | --- |
| 下载链接被转发给未购买者 | 短时签名 URL + 水印（§3.2）+ `terms.md` 已明文禁止分享链接。接受"链接会漏"的事实，靠水印追责而非封堵 |
| 退款欺诈（下载完退款） | `downloads` 日志举证；"未下载才退款"条款 + UK/EU/Korea 法定权利的既有写法不变 |
| 上传管道被冒用 | 无 web 表单；bearer token 只存服务器 env；可选叠加 Caddy 层 IP 白名单 |
| 上传途中 zip 被篡改/污染 | 服务端重跑 8 项安全扫描 + 结构检查（§2.2）；SHA-256 入库并对买家公示 |
| webhook 伪造 | Stripe 签名验证；MoR 同理；验签失败直接 400，不进业务逻辑 |
| 邮箱枚举（重置下载链接接口） | 统一响应文案，不区分"邮箱不存在"与"已发送" |
| zip 解压攻击（买家侧） | 产物是纯 markdown、单文件 < 100 KB，zip bomb 面天然为零；服务端仍做大小上限兜底 |
| 依赖供应链 | `shop-api` 依赖白名单制（目标 ≤ 5 个直接依赖：stripe/无 ORM 的 sqlite 驱动/无框架的 router 或直接用 Node 原生 http）；`npm audit` 进 CI；前台 Astro 侧维持现状 |

### 3.2 版权处理逻辑

**前置阻塞项**（`agensi-listing-gap.md` §3.2 已决定未执行）：zip 内 MIT LICENSE 必须替换为与 `/legal/terms` 对齐的专有许可，六个 SKILL.md 的 `license:` 字段同步改。**直销上线前这是硬闸门**——MIT 允许转售，直销第一天就等于放弃版权主张。

上线后的四层版权机制：

1. **包内许可文本**：新 LICENSE 与 terms.md 的 licence 节逐条对齐（perpetual、non-exclusive、non-transferable；禁止 resell/redistribute/分享链接；禁止删改许可与署名）。
2. **购买人水印**：每次下载时服务端向 zip 追加一个 `LICENSE-HOLDER.txt`（购买邮箱 + 订单号 + 购买日期 + "Licensed to the named holder only" 一行），按 (order, version) 缓存。这是追责锚点，不是 DRM——文件仍是纯文本可读的。
3. **下载日志即证据**：`downloads` 表 + Stripe 拒付抗辩材料。
4. **外流监测**：低频人工动作——每个水印含订单号，若包外流（搜索引擎、网盘、二手平台），按水印定位订单，走平台投诉/律师函。不做爬虫自动化，量级不值得。

版权边界**不变**的部分（terms.md 已写好，不要动）：买家产出物归买家；教材版权归出版方且免责声明已在位；许可只随违约终止、不远程禁用。

---

## 4. 自测方案

### 4.1 本地/CI 层（不花真钱）

| 测试 | 方法 |
| --- | --- |
| 上传管线：合法 zip 入库 | `publish.py` 对六个真实 zip 各跑一遍，断言 `releases` 行数、SHA-256 与 `sha256sum` 实测一致 |
| 上传管线：拒绝项逐个验证 | 构造坏 zip 各一：嵌套 zip、`../` 条目、`.DS_Store`、超尺寸、semver 回退、重复版本——全部必须 4xx 且 `releases` 无残留行 |
| 安全复扫 | 往 SKILL.md 里塞一个测试用外部 URL，确认扫描拦截后移除 |
| webhook 幂等 | `stripe listen --forward-to localhost` + `stripe trigger checkout.session.completed`，同一事件重放 3 次，断言只有 1 单 6 授权 |
| webhook 验签 | 篡改 payload 一字节，必须 400 |
| 下载链路 | 测试单 → 下载页 → 解出 zip → 断言含 `LICENSE-HOLDER.txt` 且邮箱/订单号正确 → `unzip -t` 完整 → SHA-256 与页面公示值一致（注意：公示的是**注水前**的哈希，页面文案要写清 "checksum of the package before licence-holder stamping"） |
| 签名 URL | 过期 URL 403；改一个字节 403；A 订单的 URL 不能下 B 订单的文件 |
| 退款 | 测试单退款 webhook → 下载页 403、`downloads` 日志仍在（证据不删） |
| 邮箱枚举 | 对不存在的邮箱请求重发链接，响应文案与存在的逐字相同 |
| 静态侧 | `npm run verify:all` 全绿 + 新增的 buy/download 检查项；vitest 覆盖 `SITE.buyCtaUrl` 与 i18n key 对齐 |

### 4.2 服务器/真钱层（上线前必做，对应 `deploy/README.md` §6 的传统——只能真机验）

```bash
# 1) API 不在 webroot：直接抓文件路径必须 404
curl -sI https://<域名>/files/lesson-workflow/1.0.0.zip | head -1   # 404

# 2) webhook 端点不验签不放行
curl -sX POST https://<域名>/api/webhooks/stripe -d '{}' | head -1  # 400

# 3) 真实 Stripe test mode 全链路：测试卡 4242 买一单 → 收邮件 → 下载 → 解水印 → 退款 → 再下载被拒
# 4) 真实 $1 单（自己的卡）走一遍，确认 payout、发票邮件、下载日志三项落地，然后退款
# 5) 拒付演练（可选）：Stripe 测试卡 4000000000000259 模拟 dispute，确认日志可导出为抗辩材料
```

### 4.3 法务一致性自查（每次改 legal 页后跑）

- delivery.md 承诺的交付时效 = 系统实际行为；
- refund.md 的退款条件 = 系统实际的判定逻辑（查 `downloads`）；
- terms.md 的许可条款 = zip 内 LICENSE 逐条一致；
- 三处 en/ko 双语文意对齐；
- 价格仍只有 `site.ts` 一个出口（`verify` 已钉死，新页面自动被扫）。

---

## 5. 支付账号与流程准备

### 5.1 Stripe 直销商户（方案一需要，方案二不需要）

1. **商户激活**：CROSSXTOP LTD 完整 KYB——公司号 `16339041`、注册地址、实控人证件、公司银行账户。**全部字段复制粘贴自 `site.ts`，与 Companies House 逐字一致**（`agensi-listing-gap.md` §2.2 的硬警告同样适用于此，且直销审核比 Connect payout 严格得多）。
2. **网站人工复审**：站点已按复审姿态构建（无 basicauth、实体页脚、refund/delivery/privacy 齐、价格记法统一）——复审前把 Buy 页上线，让审核员能看到完整购买路径。
3. **Statement descriptor**：设为 `TEACHFLOW` 或 `CROSSXTOP*TEACHFLOW`，降低"不认识这笔扣款"型拒付。
4. **收款账户**：英国公司银行账户（对公）。若没有，先开——这是比代码更早的长周期项。
5. **Stripe Tax**（若走方案一）：开启并按 §6.3 配置税区；每月导出税务报表。

### 5.2 MoR 平台（方案二需要）

1. 选一家（Paddle / Lemon Squeezy / Polar，**选择时以当下费率与韩国买家支付体验为准重新核实**，本文不锁定具体平台）。
2. 店铺审核同样需要实体信息与官网——复用 §5.1 第 2 条的资产。
3. 商品配置：一个 bundle 商品，USD 29.90，含六个文件——但**文件不让平台直接分发**（否则拿不到下载日志、做不了水印）；商品只收款，交付仍走自家 webhook + 下载页。

### 5.3 两个渠道共用

- 客服邮箱 `crossxtop@gmail.com` 必须真实可达（`deploy/README.md` §5 唯一的人工项，现在仍未勾选——**做掉它**）。
- 订单/下载日志保留期写进 privacy.md 后再开始收集。
- Agensi 与直销双渠道的退款措辞继续遵守同一原则：只链接平台政策，不复述天数。

---

## 6. 法务与版权风险准备

### 6.1 版权（自家内容）

- [ ] **硬闸门**：新专有 LICENSE 写好 → 替换六份 → 六个 SKILL.md `license:` 字段同步 → 重跑 `package.py` 重新构建 zip → `agensi-listing-gap.md` §6 前两项重新勾选。**直销与 Agensi 上架共用这一个产物，做一次两边受益。**
- [ ] `LICENSE-HOLDER.txt` 水印文案写入 terms.md（一句话：下载的副本内含购买者标识）。
- [ ] 确认六个 skill 正文不含任何第三方版权材料（教材原文、第三方模板）——现状是纯原创指令文档，做一次全文确认存档。

### 6.2 消费者法（已有文本，保持不动）

UK/EU 14 天、韩国 전자상거래법 7 天及 Article 17(2)5/17(6) 数字内容例外，refund.md 已逐条写好。**自动化的义务**：把"invoice email 确认撤销权"的承诺原样实现在自动邮件里；韩国条款要求的"明确告知 + 提供试用"中，试用以现有 `/samples` 样例页充当，下载页/购买页需链接到它。

### 6.3 税务（方案一直销的前置硬项）

> 以下是任务清单而非税务意见，执行前找懂跨境数字服务的会计师过一遍。

- [ ] **英国 VAT**：确认 CROSSXTOP 当前是否已注册、是否低于注册阈值；对英买家的 B2C 数字销售在阈值内是否可豁免。
- [ ] **EU OSS**：英国公司卖数字内容给 EU 消费者，需 non-Union OSS 或逐国注册——小量级下这几乎等于"要么 MoR、要么不做 EU 直销"。
- [ ] **韩国 VAT**：韩国对境外 B2C 电子服务征收 10% VAT，境外供应商有简易登记制度；主要目标市场是韩国教师，这条绕不开，必须确认登记义务与流程。
- [ ] **结论性建议**：三条税务线任一条的成本都可能超过 USD 29.90 × 预期单量的利润。**这正是 §1.4 推荐先 MoR 的实质理由**——MoR 把这三条整体吃掉。

### 6.4 隐私

privacy.md 增补：支付处理方数据流、订单与下载日志的用途（退款判定、争议抗辩）与保留期、买家删除权与"账务记录法定保留"的边界。

---

## 7. 实施顺序

| # | 步骤 | 依赖 | 粗略工作量 |
| --- | --- | --- | --- |
| 0 | **拍板 §1.4（Stripe 直销 vs MoR）** | 无 | 决策 |
| 1 | LICENSE 替换 + 重打包（§6.1 硬闸门，与 Agensi 上架共用） | 0 无关，可先行 | 半天 |
| 2 | `shop-api` 骨架：SQLite schema、上传端点、验收管线 | 无 | 1–2 天 |
| 3 | webhook + 订单/授权 + 下载页 + 签名 URL + 水印 | 2 | 2–3 天 |
| 4 | 退款/chargeback webhook + 下载日志 + 链接重发 | 3 | 1 天 |
| 5 | 静态侧：buy/download 页、i18n、`verify` 新检查 | 无（与 2–4 并行） | 1 天 |
| 6 | 法务页三处更新（delivery/refund/privacy，双语） | 3 | 半天 |
| 7 | §4.1 全部自测 + §4.2 真机五项 | 2–6 | 1 天 |
| 8 | 支付账号激活 + 网站复审（Stripe 或 MoR，长周期项，**第 0 步拍板后立即启动**，与 1–7 并行） | 0 | 1–2 周等待 |
| 9 | 税务确认（仅方案一；方案二此项归零） | 0 | 咨询 + 登记周期不定 |
| 10 | 上线：rsync + Caddy 加 reverse_proxy + systemd 单元，§4.2 真钱单验证 | 7, 8, (9) | 半天 |

**第 0 步是唯一的真正分叉点**；第 8 步的等待期是整个项目的关键路径，代码反而不是。

---

## 8. 明确不做的事（写下来防止范围蔓延）

1. 不做买家账号体系——邮件 + token 已够，账号是下一个量级的事。
2. 不做 web 上传后台——单人运营，CLI 更安全。
3. 不做 DRM/加密——纯 markdown 产品的版权策略是"水印 + 条款 + 追责"，不是技术封堵。
4. 不做单品直销——单品入口留在 Agensi，官网只卖 USD 29.90 套装，与现有定价叙事一致。
5. 不做订阅——`refund.md` 已公开承诺 "no subscription and no auto-renewal"。

---

## 附录 A：MoR 三家对比（Paddle / Lemon Squeezy / Polar）

核实日期：2026-09-20。费率均来自各家**官方页面**（Paddle pricing 页、Lemon Squeezy 官方 fees 文档、Polar 官方 fees 文档与 2026-05-20 官方博客）；注册通道状态、退款不退费等条目来自第三方评测，已标注"待官方确认"。

### A.1 官方费率（已核实）

| | Paddle | Lemon Squeezy | Polar |
| --- | --- | --- | --- |
| 基础费率 | **5% + $0.50**/笔 | **5% + $0.50**/笔 | **Starter（免费）：5% + $0.50**/笔 |
| 月费 | 无 | 无 | Starter 无；Pro $20/月 3.8%+40¢；Growth $100/月 3.6%+35¢；Scale $400/月 3.4%+30¢ |
| 国际卡（非美国卡）附加 | **含在基础费率内** | **+1.5%** | **+1.5%** |
| 订阅附加 | 含 | +0.5% | Starter 起无订阅附加（仅 2026-05-27 前注册的 Early Member 老组织有 +0.5%） |
| 提现费 | 官方页未列（第三方称跨币种有 2–3% 汇兑差价，待确认） | 美国银行免费；**非美国银行 +1%/笔**（经 Stripe） | Stripe 实收：$2/月 + 0.25% + $0.25/笔，跨境 0.25%（EU）–1%（其他）；Polar 不加价 |
| 低价商品限制 | **< $10 商品需谈自定义价**（官方页脚注） | < $10 可谈自定义价 | 无 |
| 拒付/争议费 | 未列 | 未列 | **$15/笔争议**（无论结果） |
| 税务 | MoR 全包（计税、申报、缴纳） | MoR 全包 | MoR 全包（底层用 Stripe Tax 计税，申报缴纳由 Polar 负责） |

### A.2 代入 TeachFlow 实际场景算账

场景：USD 29.90 套装，韩国买家（国际卡），一次性购买（订阅附加不适用），收款到英国银行（非美国）。**注意费率按含税总额计算**——MoR 会在结账时给韩国买家加 10% VAT（总额 $32.89），下表按 $29.90 裸价估算，实际每单再多个位数美分。

| | 单笔扣费估算 | 有效费率 | 单笔到手（税前） |
| --- | --- | --- | --- |
| Paddle | 5%×29.90 + 0.50 ≈ **$2.00** | ~6.7% | ~$27.90 |
| Lemon Squeezy | +1.5% 国际 ≈ **$2.44** | ~8.2% | ~$27.46（提现再 -1%） |
| Polar Starter | +1.5% 国际 ≈ **$2.44** | ~8.2% | ~$27.46 |
| Polar Pro（$20/月） | 3.8% + 0.40 + 1.5% ≈ **$1.98** | ~6.6% | ~$27.91，另扣 $20 月费 |

Polar 官方给出的 Pro 回本线是**月销售额 ~$1,379**（≈ 46 套/月）。低于这个量 Starter 更划算；高于则升 Pro。对照 Agensi 渠道（30% 分成，bundle 到手约 $20.93），直销渠道每单多到手约 **$6.5–7**。

### A.3 接入差异（对本方案的适配度）

| | Paddle | Lemon Squeezy | Polar |
| --- | --- | --- | --- |
| 定位 | 成熟、偏中大型 SaaS/企业 | 独立开发者、数字商品 | 开发者优先、开源（Apache 2.0） |
| 文件下载 | 非原生强项，需自建交付（与本方案 §2.3 自建下载页吻合） | 原生文件托管分发 | **原生 File Download benefit**，但本方案为做购买人水印仍需自建交付，走其 Custom Benefit webhook |
| webhook / API | 完整但文档偏厚重 | 简单易用 | **最干净**，事件模型与本方案 §2.1 订单/授权表几乎一一对应 |
| 结账形态 | 嵌入式 overlay / 托管页 | 托管页 / overlay | 托管 Checkout + API 创建 session |
| 商户审核 | 网站+公司审核，周期数天到数周 | 快（ historically 小时级） | 首笔提现前需账户审核（官方明示，防欺诈） |
| 公司背景风险 | 独立运营（2012 年至今），MoR 就是主业 | **2024-07 被 Stripe 收购**，正并入 Stripe Managed Payments；第三方报道 2026 年中起新商户注册转为 waitlist/邀请制（**未获官方确认，注册前必须先实测**） | 2023 年创立，体量最小；开源代码降低锁定风险 |
| 韩国买家支付体验 | 国际卡（Visa/MC 通道）可用；三家均不支持 KakaoPay/Naver Pay 等韩国本地支付方式——韩国发行的卡按"国际卡"计，走卡组织通道，买家侧无感但费率侧 +1.5%（Paddle 除外） | 同左 | 同左 |

### A.4 结论

1. **首选 Polar（Starter 档）**：费率与 LS 持平但无隐藏加价、webhook/文件交付模型与本方案最贴、开源、回本线清晰（46 套/月再升 Pro）。代价是平台最年轻，且首笔提现前有账户审核——**账号注册与审核是长周期项，方案 §7 第 8 步拍板后立即启动**。
2. **备选 Paddle**：国际卡不加价、到账最干净（~6.7%），但 onboarding 更重、文档更厚、文件分发非原生；若 Polar 审核不过或中途出问题，切它。
3. **Lemon Squeezy 排第三**：费率附加最多（国际 +1.5%、非美提现 +1%）、Stripe 收购后的迁移方向未定、新注册可能 gated——三条叠加，除非前两家都走不通，否则不选。
4. **待官方确认项**（下单前各花 10 分钟实测）：Paddle 提现汇兑差价、Paddle 退款是否退手续费（第三方称其不退，影响 §2.3 退款流程的净损计算）、Lemon Squeezy 当前是否开放自助注册、三家对韩国发行卡的实际受理成功率。
5. **条款连带**：选定平台后，`terms.md` 直销节的 "CROSSXTOP LTD is the seller" 需改为照 Agensi 节的 MoR 写法（平台为 merchant of record），en/ko 双语同步，`updated` 日期刷新。

---

## 附录 B：韩国本地支付（KakaoPay / Naver Pay）的处理策略

核实日期：2026-09-20。起因：附录 A 指出三家 MoR 的托管结账默认都不展示韩国本地钱包，而 TeachFlow 的主要买家是韩国教师。

### B.1 先厘清三个事实（已核实）

1. **卡支付在韩国本身就是主流**：韩国卡支付渗透率约 75%（OECD 第一），几乎所有成年人都有 Shinhan / Hyundai / Samsung 等本地发行的卡，且这些卡普遍带 Visa/Mastercard 联名标识，可以直接走国际卡通道完成美元结算。KakaoPay/Naver Pay 的价值是**降低移动端摩擦、提升转化**，不是支付准入门槛——没有它们买家照样能付款。
2. **Stripe 官方已支持韩国本地方法**：Naver Pay、Kakao Pay、Samsung Pay、PAYCO 及全部韩国本地卡（Shinhan/Hyundai/Samsung），KRW 结算，**无需韩国本地实体**（通过 Stripe 的韩国本地处理伙伴），支持退款与争议。 [Stripe 官方韩国支付文档](https://docs.stripe.com/payments/countries/korea "citation")
3. **但"Polar 底层是 Stripe" ≠ "Polar 结账页开着这些方法"**。Stripe 侧韩国钱包要求 KRW 结算且需商户在 Dashboard 显式启用；Polar 托管结账是否暴露这些方法、是否支持 KRW presentment，官方文档未写明——**这是选型实测清单的第一项**（见 B.3）。

### B.2 策略阶梯（按代价从低到高）

**第 0 级：先卡支付上线，用数据说话。**
直接以 Polar 卡支付结账上线。Agensi 渠道同样走 Stripe 卡支付，韩国买家在该渠道已在用卡购买——卡支付不是市场障碍是已被验证的事实。上线后在下载页/购买漏斗埋点，观察韩国访客的结账放弃率。

**第 1 级：向 Polar 要开关。**
正式询问 Polar support：结账页能否启用 Kakao Pay / Naver Pay / Samsung Pay（底层 Stripe 能力存在，问题只是 Polar 是否暴露），以及是否支持 KRW presentment。若能开启，零代码解决。等待期间第 0 级照常运行。

**第 2 级：韩国市场双轨。**
若实测证明钱包缺失显著伤害转化，为韩国买家单独加一条**Stripe 直销通道**（Stripe Checkout 开 Kakao Pay/Naver Pay/Samsung Pay/PAYCO + KRW 结算），其余国家继续走 Polar。代价是韩国这条线上 **CROSSXTOP 自己成为卖家**——韩国 VAT 简易登记（§6.3）就此从"可选"变成"必须"，税务成本只覆盖韩国一个市场，比全球自营可控得多。`shop-api` 的适配器设计（§1.4）已为此预留：同一套订单/下载/水印逻辑，多接一个 `stripe-kr.ts` 适配器。

**不做的事**：不为韩国钱包放弃 MoR 转全面自营（把全球税务负担换单一市场转化提升，不划算）；不引入第四家声称支持韩国钱包的 PSP（WooshPay、OnerWay 等有此能力，但其 MoR 资质、结算与合规记录未经核实，仅登记在此备查，不作为推荐）。

### B.3 选型实测清单（附录 A.4 第 4 条的扩展）

注册 Polar 后、上线前，用测试结账逐条验证：

- [ ] 结账页对韩国 IP/账单地址展示的支付方式清单
- [ ] 能否启用 Kakao Pay / Naver Pay（不能 → 发 support 工单，记录答复）
- [ ] 是否支持 KRW presentment；USD 结账时韩国买家的货币转换体验
- [ ] 韩国发行卡（借一张或用 Stripe 测试卡）的实际成功率
- [ ] 同一组问题对 Agensi 结账也测一遍——若 Agensi 同样只有卡支付，则双渠道体验一致，钱包问题不构成竞争劣势
