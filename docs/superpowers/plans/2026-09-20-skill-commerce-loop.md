# Skill 商业闭环实施计划

> **执行方式：** 本次在主会话内联执行（用户未要求 subagent 分派）。

**目标：** 建成自营发行系统，闭合「上传 zip → 买家付款 → 买家下载 → 发新版 → 买家免费重下」。

**架构：** Hetzner 同机上的 Node 服务（`shop-api/`）+ PostgreSQL 16 + pg-boss worker；Astro 站点保持纯静态，只新增一个跳转页 `/[lang]/buy`。

**Spec：** `docs/superpowers/specs/2026-09-20-skill-commerce-loop-design.md`

## 全局约束

- 外部依赖只有 `pg` 与 `pg-boss`。其余一律 Node 内建（`node:http`/`node:crypto`/`node:zlib`/内建 `fetch`）。
- 前端保持纯静态：`/download` 由 shop-api 服务端渲染，**不进 `dist/`**，`tests/build/no-js.test.mjs` 必须继续全绿。
- 站内不出现任何支付表单。
- 上传接口不重新打包内容，只接收、校验、登记、分发。
- 价格唯一出口是 `src/config/site.ts`，写法 `USD 29.90`，不写 `$29.9`。
- 已售版本不可变：`(skill_id, version)` 已存在一律 409，永不覆盖。
- `npm run verify` 原九项检查一项不改，只新增 `npm run verify:api`。
- 所有面向买家的文案英韩双语；韩文用합니다체；无 emoji、无感叹号、无营销形容词。
- 密钥只从环境变量读，不入库、不入日志；邮箱在日志中只留域名部分。

---

## 任务清单

每个任务都以「能独立测试的交付物 + 一次提交」结束。

### Task 1 — shop-api 骨架

**文件：** `shop-api/package.json`、`src/config.ts`、`src/db/pool.ts`、`src/db/migrate.ts`、`src/db/migrations/001_init.sql`、`src/http/router.ts`、`src/routes/health.ts`、`src/server.ts`、`test/config.test.ts`、`test/router.test.ts`

**产出接口：**
- `loadConfig(env): Config` —— 缺任一必需变量即 `throw`，错误信息列出全部缺失项（不是只报第一个）
- `createRouter(): { add(method, pattern, handler), handle(req, res) }` —— 支持 `/api/download/:skillId` 形式的单段参数

**测试：** 缺变量时抛错且信息含全部缺失名；路由参数解析；未匹配返回 404 JSON。

### Task 2 — zip 校验

**文件：** `src/lib/zip.ts`（读中央目录）、`src/lib/zip-validate.ts`、`test/zip-validate.test.ts`

**产出接口：**
- `readCentralDirectory(buf): ZipEntry[]`，`ZipEntry = { name, compressedSize, uncompressedSize, method, localHeaderOffset, crc32 }`
- `validateSkillZip(buf, expectedSkillId): { ok: true, entries } | { ok: false, reason }`

**必须拒绝的用例（各一条）：** 非 zip 字节；嵌套 `.zip` 条目；含 `../`；绝对路径；`__MACOSX/`；`.DS_Store`；顶层目录名 ≠ `expectedSkillId`；缺 `<skill>/SKILL.md`；单文件 > 1 MB；解压总量 > 5 MB。合法包必须通过（用 `TeachFlow-KR/dist/lesson-workflow.zip` 作 fixture）。

### Task 3 — 水印与 token

**文件：** `src/lib/watermark.ts`、`src/lib/token.ts`、`test/watermark.test.ts`、`test/token.test.ts`

**产出接口：**
- `injectLicenseHolder(zipBuf, { skillId, email, orderId, purchasedAt }): Buffer`
- `signToken(secret, { orderId, ttlDays }): string` / `verifyToken(secret, token): { orderId } | null`

**测试：** 注入后 zip 仍可被 `readCentralDirectory` 解析；`<skill>/LICENSE-HOLDER.txt` 存在且含订单号与邮箱；原有条目字节与偏移未被破坏（逐条比对名称与 CRC）。token 往返成功；过期拒绝；改一位签名即拒绝；算法字段被篡改为 `none` 拒绝。

### Task 4 — R2 存储

**文件：** `src/lib/sigv4.ts`、`src/lib/storage.ts`、`test/sigv4.test.ts`

**产出接口：**
- `signRequest({ method, url, headers, body, accessKeyId, secretAccessKey, region, service }): Headers`
- `storage.putMaster(skillId, version, buf)` / `storage.getMaster(skillId, version): Promise<Buffer>`（先本地 `MASTER_DIR`，未命中回源 R2，带 LRU）

**测试：** SigV4 用 AWS 官方测试向量校验规范请求串与签名；LRU 命中与淘汰。

### Task 5 — MoR 适配器

**文件：** `src/mor/types.ts`、`src/mor/polar.ts`、`src/mor/index.ts`、`test/mor-polar.test.ts`

**产出接口：**
- `NormalizedOrderEvent`（见 spec §3.2）
- `verifyAndNormalize(rawBody, headers, secret): { eventId, event: NormalizedOrderEvent } | { error }`

**测试：** 正确签名通过；错签名拒绝；时间戳超 5 分钟窗口拒绝；三类事件（paid/refunded/chargeback）归一字段正确；未知事件类型被安全忽略而非抛错。

### Task 6 — 发版接口

**文件：** `src/lib/multipart.ts`、`src/routes/admin-releases.ts`、`src/db/releases.ts`、`test/admin-releases.test.ts`

**行为：** 见 spec §3.1 六步。`timingSafeEqual` 比 token；semver 严格递增；同版本重传 409 且库中记录不变；frontmatter `version` 与参数不符则 400。

### Task 7 — webhook 接口

**文件：** `src/routes/webhooks.ts`、`src/db/orders.ts`、`test/webhooks.test.ts`

**行为：** 见 spec §3.2。重放同一 `event_id` 不产生第二条订单；`paid` 建单 + 六条 entitlement 在同一事务。

### Task 8 — 邮件与日配额

**文件：** `src/lib/mailer.ts`、`src/db/quota.ts`、`test/mailer.test.ts`

**行为：** `sendMail` 前先占配额（`email_quota` 按 UTC 日历日，上限 80 留 20 给交易邮件）；占不到返回 `{ sent: false, reason: 'quota' }` 而非抛错。交付邮件正文逐字包含 `src/content/legal/{en,ko}/refund.md` 的撤回权段落。

### Task 9 — 下载页与下载接口

**文件：** `src/views/download.ts`、`src/routes/download.ts`、`test/download.test.ts`

**行为：** 见 spec §3.3。双语服务端渲染，内联 CSS，无脚本。授权四种失败情形（无 token／过期／非本单 skill／订单已退款）各返回正确状态码。

### Task 10 — 重发链接

**文件：** `src/lib/ratelimit.ts`、`src/routes/resend-link.ts`、`test/resend-link.test.ts`

**行为：** 邮箱存在与否返回**逐字节相同**的 202 响应；IP 与邮箱双限流。

### Task 11 — worker 与任务

**文件：** `src/jobs/archive-master.ts`、`src/jobs/notify-update.ts`、`src/worker.ts`、`test/notify-update.test.ts`

**行为：** 见 spec §3.4。配额耗尽时剩余部分重新排程到次日 UTC 00:05，已发部分不重发。

### Task 12 — 操作者 CLI

**文件：** `tools/publish.py`

**行为：** 参数 `--skill --version --zip --changelog-en --changelog-ko`；从环境变量读 `ADMIN_TOKEN` 与 `API_BASE`；打印服务端回执；非 2xx 时以非零码退出并原样打印错误体。

### Task 13 — TeachFlow-KR 配套

**文件：** `TeachFlow-KR/skills/*/SKILL.md`（六个，加 `version:`）、`TeachFlow-KR/package.py`（断言该字段存在且为合法 semver）

**注意：** `verify.py` 的 frontmatter 白名单已含 `version`，无需改动它。

### Task 14 — 站点侧

**文件：** `src/config/site.ts`（加 `buyCtaUrl`）、`src/pages/[lang]/buy.astro`、`src/i18n/{en,ko}.json`、`tests/unit/site.test.ts`、`tests/build/pages.test.mjs`

**注意：** 新页面要进语言对等检查；价格写法仍必须是 `USD 29.90`；`no-js` 与 `claims` 两项检查必须继续全绿。

### Task 15 — 部署物料

**文件：** `shop-api/.env.example`、`shop-api/README.md`、`deploy/shop-api.service`、`deploy/shop-api-worker.service`、`deploy/Caddyfile.snippet`

**内容：** 两条 `reverse_proxy`（`/api/*` 与 `/download*`）、两个 systemd unit、环境变量清单与各自的取得方式。

---

## 自检

- Spec 每一节都有对应任务：§1 架构→T1/T15，§2 数据模型→T1，§3.1→T2/T6/T12/T13，§3.2→T5/T7/T8，§3.3→T3/T4/T9/T10，§3.4→T11，§4 接口→T6-T10，§5 配置→T1/T15，§6 安全→T2/T3/T5/T10，§7 测试→各任务自带，§8 选型→T5，§9 人工事项→最后汇总输出。
- 类型一致性：`ZipEntry` 在 T2 定义，T3 复用；`NormalizedOrderEvent` 在 T5 定义，T7 消费；`Config` 在 T1 定义，全局消费。
