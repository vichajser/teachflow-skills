# 全流程漏斗统计方案（进入 → 支付 → 回跳）

日期：2026-09-29。目标：量化「用户进入站点 → 到达支付页 → 支付成功」每一步的丢失率，
据此优化转化。本文是调研结论 + 可落地实施计划。

---

## 1. 现状盘点（事实，非估计）

- **全站零统计。** 全仓（含 dist 产物）无任何 analytics/像素/GTM 痕迹；
  `BaseLayout.astro` head 里只有字体 preload。
- **隐私政策已公开承诺零统计**（`src/content/legal/en/privacy.md:24-29`）：
  "No analytics / No cookies / No third-party requests — no embedded scripts,
  **pixels**, iframes"。`/en/security` 页逐条复述同样承诺，ko 版同步。
  → **任何客户端脚本（哪怕 Umami/Plausible 这种「轻量」脚本）都直接违约**，
  且先改政策再上线，顺序不能反。
- **全站零 JS 是测试钉死的约束**：`tests/build/no-js.test.mjs` 断言除两个首页外
  任何页面不得含 `<script>`。
- **支付页不在本站域**：购买按钮是裸 `<a href="https://buy.polar.sh/polar_cl_…">`
  （`src/config/site.ts:16`，页头/hero/页底/CtaBanner 四处调用 `buyHref()`）。
  Polar 托管结账页不可能注入任何统计脚本——**「到达支付页」这一步，所有客户端
  统计工具都天然看不见**，只能靠服务端信号。
- **shop-api 已有可靠的支付成功信号**：`POST /api/webhooks/polar`
  （`shop-api/src/mor/polar.ts`）验签后处理 `order.paid` 等事件；
  未列入 `EVENT_KINDS` 的事件（含 `checkout.created`）被安全忽略、回 200。
- **Caddy 未开启访问日志**（`deploy/Caddyfile` 无 `log` 指令）——「进入页面」
  目前连数据源都不存在。
- **支付成功回跳**：Polar 后台配置 success URL =
  `/en/buy/success?checkout_id={CHECKOUT_ID}`；`success.astro` 是纯静态页，
  `checkout_id` 目前被丢弃。

### 漏斗五步与各步现有信号

| # | 步骤 | 现有信号 | 缺口 |
|---|------|----------|------|
| ① | 进入页面（/en、/ko 各页） | 无 | 无数据源 |
| ② | 点击购买按钮 | 无 | 纯 `<a>` 直链跳出，站内无感知 |
| ③ | 到达 Polar 支付页 | 无 | 在 Polar 域上，客户端不可见 |
| ④ | 支付成功 | `order.paid` webhook ✅ | 只差记录成漏斗事件 |
| ⑤ | 回跳站内成功页 | 静态页，`checkout_id` 被丢弃 | 需要接住回跳 |

## 2. 免费第三方候选对比

> 数字截至方案撰写时的公开定价，**接入当天以官网为准**（本次调研网络不可用，
> 未能实时核验，见 §7 待验证清单）。

| 方案 | 免费额度 | 漏斗报表 | 可纯服务端接入(无客户端脚本) | 本站适配结论 |
|------|----------|----------|------------------------------|--------------|
| **PostHog Cloud** | ~100 万事件/月，超出按量 | ✅ 免费含 | ✅ capture API 成熟 | **推荐** |
| **Mixpanel** | ~2000 万事件/月 | ✅ 免费含 | ✅ import/ingest API | 备选（额度更大，UI 偏产品分析） |
| GA4 | 免费 | ✅ 漏斗探索（≤5 步） | ⚠️ Measurement Protocol 笨重 | 不推荐：必须挂 JS（违约+需横幅）；广告拦截器恰好漏掉①步，丢失率被系统性高估 |
| Amplitude | 免费档按 MTU 限制 | ✅（有限制） | ✅ HTTP API | 免费额度按月活计，低流量站无所谓，但无优势 |
| Umami 自托管 | PV 无限 | ❌ 漏斗是付费功能，OSS 版无漏斗 UI | ⚠️ `/api/send` 可服务端推 | 只能做 PV 层，漏斗还得自己算 |
| Plausible 自托管 CE | 免费 | ❌ CE 版不含漏斗 | ❌ 无官方服务端 API | 排除 |
| Matomo 自托管 | 免费 | ❌ 漏斗是付费插件 | ⚠️ | 运维重，排除 |
| Cloudflare Web Analytics | 免费 | ❌ 无漏斗/无自定义事件 | 无 JS 模式需整站接入 CF 代理 | 只能做①步参考值，需改 DNS 架构，排除 |
| Yandex Metrica | 免费 | ✅ | ❌ | 合规与信誉风险，排除（UK 主体） |
| GoAccess 等日志分析 | 免费 | ❌ | — | 无漏斗，可作①步交叉验证 |

**核心判断**：由于③④⑤只能在服务端拿到（Polar webhook / 回跳），服务端埋点管道
是任何方案的必需组件；①②也完全可以服务端化（见 §3）。因此**客户端脚本不是必需品**
——这正好同时满足「零 JS 测试」「无第三方请求承诺」两条硬约束。第三方工具的价值
只剩「现成的漏斗 UI + 细分」，这一价值由 PostHog 免费档以纯服务端方式获得。

## 3. 推荐架构：零客户端脚本的全服务端漏斗

```
① 页面访问      Caddy JSON 访问日志 → 解析任务（过滤 bot/静态资源）→ funnel 事件
② 购买点击      按钮 href 改为 /api/checkout/start?src=<位置>&lang=<en|ko>
                 → 记录事件 → 302 到 Polar checkout link
③ 到达支付页    Polar webhook `checkout.created` → 记录事件（不动订单状态机）
④ 支付成功      `order.paid`（现有管道旁挂一条事件记录）
⑤ 回跳成功页    Polar 后台 success URL 改为 /api/checkout/return?checkout_id={CHECKOUT_ID}
                 → 记录事件 → 302 到现有静态 /en|/ko/buy/success
```

数据落点两选一：

- **方案 A（推荐）：自建 `funnel_events` 表为事实源，异步镜像到 PostHog Cloud 免费档**
  做漏斗 UI/细分。PostHog 挂了不影响业务；不想用第三方时随时关镜像，表还在。
- **方案 B：纯自建**。事件只落表，`/api/admin/funnel?days=30` 出 JSON 计数，
  配一张简单表格页或 psql 视图。零第三方依赖，但漏斗 UI、按来源/语言/UA 细分、
  时间趋势都要自己写。

两案的埋点管道完全相同，只是「汇」不同，可以先 B 后 A。

### 归因与关联（无 cookie 的边界）

- **按钮位置归因**：`src` 参数（hero / header / footer / cta-skills / cta-samples），
  无需任何标识符。
- **②→④ 订单关联**：Phase 2 把 `/api/checkout/start` 升级为调 Polar API
  `POST /v1/checkouts/` 创建会话（metadata 带 `src`、一次性 `vid`），302 到会话
  URL；metadata 随 `order.paid` webhook 回流，即可无 cookie 地把「点击」与「订单」
  挂上钩，还能给每个位置生成独立会话。失败时回退现有静态 checkout link。
- **①→② 访客级关联**：无 cookie 做不到，也不做——**计数级漏斗已足够回答丢失率**。
  若将来要访客级归因，再评估「单一 first-party 会话 cookie + 政策/横幅」的成本，
  不在本期。

### 已知口径偏差（写进报表脚注，避免误读）

- 无 JS 的①步含爬虫 → 用 UA + 「仅 text/html 请求」过滤后仍略高估；
  GA4 类方案则反向低估（拦截器）。**①②用同一来源（服务端）计数，③④用 Polar
  侧计数，跨步对比口径一致；绝不拿 GA4 的 PV 和 Polar 的订单直接相除。**
- ③→④ 可与 Polar 后台 checkout link 自带的转化数据交叉验证。

## 4. 分阶段落地清单

### Phase 0 — 决策与合规（0.5 天，先行）
1. 定数据汇：A（自建表 + PostHog 镜像）或 B（纯自建）。
2. 改 `src/content/legal/en/privacy.md` + `ko/privacy.md` + `/en/security` 同步措辞：
   从「No analytics」改为「匿名、聚合的漏斗统计；无 cookie、无客户端脚本、
   不长期存 IP；事件经（可选：第三方处理器 PostHog，EU 区）处理」。
   Short version 段一并改。**埋点上线必须晚于政策上线。**
3. `no-js` 测试不动——本方案不新增任何 `<script>`。

### Phase 1 — 服务端事件管道（1–2 天）
1. shop-api 新增 `funnel_events` 表（`event, ts, src, lang, vid?, checkout_id?,
   order_id?, ua, ref, meta jsonb`；**不存原始 IP**），随现有迁移机制建表。
2. `deploy/Caddyfile` 开 JSON 访问日志（含 UA / Referer）+ 轮转；服务器上加
   解析任务（cron 或 shop-api 定时 job）：只取 HTML 页面请求、过滤已知 bot UA，
   写①步事件。
3. 站点侧：`src/config/site.ts` 的 `buyHref()` 改为返回
   `/api/checkout/start?src=…&lang=…`（四个调用点标注各自 `src`）；
   `PUBLIC_BUY_CTA_URL` 兜底语义保留（空串仍回落 `/buy` 静态页）。
   `/api/*` 在 Caddy 的 `@unknown_locale` / `@html` 排除清单里已就位，无需动。
4. shop-api 新增 `GET /api/checkout/start`：记录② → 302 到 checkout link
   （URL 进 shop-api 环境变量，sandbox 演练切链接从此不再重构建站点）。
   对该路由做 UA bot 过滤，防爬虫灌高②。
5. webhook 路由旁路记录：`checkout.created` → ③（先在 sandbox 验证 checkout link
   被打开时确实触发此事件；若不触发，Phase 2 的 API 建会话天然覆盖③）。
6. `order.paid` 现有处理旁挂④事件。
7. （可选）Polar 后台把 success URL 改为 `/api/checkout/return`：记录⑤ →
   302 到静态成功页。`success.astro` 不动。

### Phase 2 — 看板与升级（0.5–1 天）
1. 方案 A：shop-api 队列异步镜像事件到 PostHog capture API
   （distinct_id 用 vid / 匿名 id），建漏斗：①→②→③→④→⑤，
   细分维度：lang、src、UA 大类、referrer。
2. 方案 B：`/api/admin/funnel`（adminToken 保护）返回逐步计数与转化率 JSON，
   配最小表格页或直接 psql 查询。
3. `/api/checkout/start` 升级为 Polar API 建会话（metadata: src/vid），
   失败回退静态链接。

### Phase 3 — 验证与口径校准（0.5 天）
1. 用 sandbox checkout link 走全流程（点击→支付→webhook→回跳），核对五事件
   逐条落库/上墙。
2. 抽样对比 Caddy 原始日志与①步计数、Polar 后台转化与③④——偏差写进报表脚注。
3. 上线后观察一周，确认每步转化率量级合理（例：①→② 若 <0.5% 先怀疑统计而非产品）。

### 回滚
- 全部改动都是「旁路记录 + 302 中转」，去掉中转（按钮 href 改回直链）即回到
  现状；事件表与镜像互不影响主链路（webhook 记录失败只打日志，不影响订单状态机）。

## 5. 风险

| 风险 | 缓解 |
|------|------|
| ② 中转多一次站内往返（同域 302，几十 ms） | 可忽略；Phase 2 若加 Polar API 建会话约 +300–500ms，失败即回退直链 |
| 无 JS 统计被爬虫污染 | UA + 路径过滤；报表脚注注明口径 |
| 政策改动影响「隐私卖点」 | 措辞强调「无 cookie、无脚本、匿名聚合」，实质承诺几乎未弱化 |
| `checkout.created` 触发时机不明 | sandbox 先验证；API 建会话方案兜底 |

## 6. 明确不做（本期）

- 客户端统计脚本（GA4/Umami/Plausible script）：与公开政策、no-js 测试冲突，
  且对③④⑤无能为力。
- Cookie / 会话标识 / 访客级归因 / 同意横幅：UK+EU GDPR 下成本高，计数级漏斗
  不需要。
- session replay、热图（PostHog 有免费额度）：与「零 JS」矛盾，将来若放开再议。

## 7. 待验证清单（网络恢复后 / 实施前）

1. PostHog 免费档当前额度与 capture API 限速（posthog.com/pricing）。
2. Mixpanel 免费档额度（备选）。
3. Umami OSS 是否仍不含漏斗（影响「自托管派」的备选价值）。
4. Polar：checkout link 被打开时是否触发 `checkout.created`；checkout link /
   checkout session 是否支持 URL 传 metadata（docs.polar.sh）。
5. Polar 后台对 checkout link 的原生转化报表字段（③→④ 交叉验证用）。

---

## 8. 实施记录（2026-09-29，Phase 0–3 全部落地）

### 已交付

| 部分 | 文件 |
|---|---|
| 迁移（funnel_events + funnel_log_state） | `shop-api/src/db/migrations/003_funnel.sql` |
| 事件汇 + bot 判定 + 批量插入 | `shop-api/src/funnel/events.ts` |
| PostHog 镜像（env 门控，默认关） | `shop-api/src/funnel/posthog.ts` |
| 计数报表查询 | `shop-api/src/funnel/report.ts` |
| Polar API 建会话（env 门控，默认关） | `shop-api/src/funnel/polar-session.ts` |
| Caddy 日志 → page_view 解析 | `shop-api/src/funnel/caddy-log.ts` |
| 摄取脚本（timer 每 5 分钟） | `shop-api/src/bin/ingest-caddy-logs.ts` + `deploy/funnel-log-ingest.{service,timer}` |
| 购买中转 + 回跳接缝 | `shop-api/src/routes/checkout.ts` |
| webhook 旁路（checkout.created / order.paid） | `shop-api/src/mor/polar.ts`、`mor/types.ts`、`routes/webhooks.ts` |
| 报表接口（JSON/HTML） | `shop-api/src/routes/funnel-report.ts`、`lib/authorize.ts` |
| 站点按钮改造（src 标注 + 中转） | `src/config/site.ts` + SiteHeader / index×2 / CtaBanner / buy 五处 |
| 隐私政策（en/ko，2026-09-29 版） | `src/content/legal/{en,ko}/privacy.md` |
| Caddy 访问日志（JSON + 30 天轮转） | `deploy/Caddyfile` |
| 测试与闸门同步 | `tests/unit/site.test.ts`、`tests/build/{home,pages}.test.mjs`、`scripts/verify-build.mjs` |
| 部署手册 | `deploy/README.md` §3c、`shop-api/README.md`「漏斗统计」 |

### 关键决定与偏差

- **数据汇**：按 §3 方案 A 落地——`funnel_events` 表是事实源，PostHog 是
  env 门控的可选镜像（`POSTHOG_API_KEY` 不设则零第三方）。
- **`PUBLIC_BUY_CTA_URL` 语义**：默认（未设）按钮走 `/api/checkout/start`
  中转；显式设为 URL = 直链演练（绕过漏斗）；空串 = /buy 兜底（不变）。
- **checkout link 两处登记**：`src/config/site.ts`（构建侧）+
  `shop-api/src/config.ts`（运行时侧 `CHECKOUT_URL` 默认值），换链接两处同改。
- **success URL 需在 Polar 后台改**为 `/api/checkout/return?checkout_id={CHECKOUT_ID}`
  （记第⑤步后 302 到原静态成功页；不改则该步缺数据，其余步骤不受影响）。
- **checkout_open 去重**：不进 `webhook_events` 存档表，靠 funnel_events 里
  checkout_id 的 NOT EXISTS 去重——Polar 重投不会重复计数第③步。
- **第①步含首页 `/` 与 302**：根路径是 302 壳，不计入；`/en`、`/ko` 与全部
  内容页计入（GET + 200 + 页面路径形态）。

### §7 清单的实施态更新

- 第 1–3 项（各家免费额度）仍未核验——但已实现为 env 门控可选项，核验与否
  不阻塞上线；自建报表即完整可用。
- 第 4 项（checkout.created 触发时机）：代码已按「link 打开即触发」实现并
  去重；若实测不触发，第③步启用 Polar API 建会话路径自然补齐（会话创建即
  第③步信号）。
- 新增待验证：`polar-session.ts` 的请求字段（照公开文档所写）；启用前先在
  sandbox 走一遍，失败会自动回退静态链接，不影响购买。

## 9. 部署与线上验证记录（2026-09-29 当日上线）

全链路已部署到生产并验证：迁移执行、五步事件入库、报表端到端返回正确
（含真实 UA 流量的 ①→② 转化率）、摄取定时器每 5 分钟运行。PostHog 已接入
（US 区），镜像送达验证通过。过程中踩到两个只有线上才会现形的坑，都已修复
并写入对应文件的注释：

1. **`caddy validate` 以 root 运行时会预创建 root 属主 0600 的 access.log**，
   caddy 进程随后打不开，reload 失败、restart 起不来。修复：validate 后删掉
   该文件再 reload（Caddyfile 与 deploy/README §3c 均有注记）。
2. **PostHog v1 `/batch/` 只认 snake_case 的 `distinct_id`**，镜像初版发了
   `distinctId`，整批 400。已修复并有线上格式单测锁住
   （`shop-api/test/posthog.test.ts`）。

摄取器以 `caddy` 用户运行（日志文件固定 0600 caddy 属主）；连库走
DATABASE_URL 密码认证，与 OS 用户无关。Polar 后台的 Success URL 切换为
`/api/checkout/return?checkout_id={CHECKOUT_ID}` 仍待人工执行。
