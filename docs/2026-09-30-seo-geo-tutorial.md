# SEO / GEO 站外操作完整教程（2026-09-30）

写给执行者的逐步教程。所有动作发生在站长账号、第三方平台与 DNS 里，
代码侧无需再改任何文件。速查版见 `2026-09-30-seo-geo-rollout.md`。

> 三家站长平台的界面常年改版。本教程的菜单名以 2026-09 为准；若对不上，
> 按每步给出的**关键词**找入口即可，流程本身多年未变。

---

## 0. 总览与准备

**你需要的账号 / 权限清单**

| 项目 | 用途 | 备注 |
|---|---|---|
| Google 账号 | GSC 验证与数据 | 建议用长期公司账号，不建议纯个人号（换人会丢所有权） |
| Microsoft 账号（或直接用 Google 登录） | Bing Webmaster | 支持第三方登录 |
| Naver 账号 | Search Advisor | 韩语市场必需；注册时可能要求手机验证 |
| 域名注册商控制台 | 第六步 Cloudflare 换 NS 时用 | 能改 NS 记录即可 |
| 服务器 SSH | 部署与 Caddy 重载 | 即 deploy/README.md 的既有通道 |
| Product Hunt / G2 账号 | 第五步 | 可用同一邮箱注册 |

**建议时间线**

| 时间 | 动作 | 耗时 |
|---|---|---|
| 第 1 天 | 第一步 部署 + 第二~四步三家平台注册验证 + 提交 sitemap | 1.5–2 小时 |
| 第 1 周 | 每天用"网址检查"催几条索引；准备 Product Hunt 素材 | 每天 10 分钟 |
| 第 2–3 周 | Product Hunt 发布；G2 词条；开始社区参与 | 各半天 |
| 收录稳定后（约 2–4 周） | 第六步 Cloudflare | 30–60 分钟 + DNS 生效等待 |

---

## 1. 第一步：把本次改动部署上线（必做，先于一切平台注册）

平台验证读的是**线上**页面的 meta，所以先部署。本次含 `deploy/Caddyfile`
变更（`/favicon.ico`、`/llms.txt` 放行），比平时部署多一步 Caddy 重载。

```bash
# —— 本地 ——
cd <仓库路径>
npm run verify:all            # build + 253 测试 + 部署闸门，必须全绿
rsync -avz --delete dist/ <user>@<host>:/srv/teachflow/dist/

# —— 服务器上 ——
# 1) 更新 Caddyfile（本次改了 @unknown_locale 清单与 @siteimg）
sudo cp <仓库>/deploy/Caddyfile /etc/caddy/Caddyfile
SITE_DOMAIN=tryteachflow.com sudo -E caddy validate --config /etc/caddy/Caddyfile

# ⚠️ validate 的坑（deploy/README.md §3 有完整说明）：validate 以 root 运行
#    会预创建 root 属主的 /var/log/caddy/access.log，caddy 进程随后打不开。
#    validate 之后若见到它，先删再 reload：
sudo rm -f /var/log/caddy/access.log

sudo systemctl reload caddy

# —— 验收（deploy/README.md §6 清单 + 本次新增两条）——
curl -sI https://tryteachflow.com/en          | head -1   # 200（不是 308）
curl -sI https://tryteachflow.com/llms.txt    | head -1   # 200 ← 新增
curl -sI https://tryteachflow.com/favicon.ico | head -1   # 200 ← 新增
curl -s  https://tryteachflow.com/robots.txt  | head -20  # 能看到 GPTBot 等段
curl -s  https://tryteachflow.com/sitemap-index.xml        # 200
```

任何一条不是预期结果，先回 deploy/README.md 排障，再继续往下。

---

## 2. 第二步：Google Search Console

### 2.1 注册与拿验证码

1. 打开 <https://search.google.com/search-console>，用 Google 账号登录。
2. 点 **"添加资源 / Add property"**。两个选项：
   - **"网域 / Domain"**（推荐，前提：你能改 DNS）：填 `tryteachflow.com`。
     验证方式是 DNS TXT 记录——去域名注册商加一条 TXT，值由 GSC 提供。
     它一次覆盖所有子域（含 www），且后面上 Cloudflare 也不受影响。
   - **"网址前缀 / URL prefix"**：填 `https://tryteachflow.com`，验证方式
     选 **"HTML 标记 / HTML tag"**。GSC 会显示一条完整的
     `<meta name="google-site-verification" content="XXXX" />`，
     **只复制 `content` 引号里的 XXXX**，这就是验证码。
3. 两种方式选其一即可；拿 DNS TXT 的话跳过 2.2，直接去注册商加记录，
   回来点"验证"。

### 2.2 注入验证码并部署（meta 方式）

在**仓库根目录**创建 `.env`（若已有则追加；此文件不是机密，验证码本来
就会出现在公开 HTML 里，且需要长期保留——Google 会定期复检，meta 消失
会最终丢掉已验证身份）：

```bash
# .env
PUBLIC_SITE_VERIFICATION_GOOGLE=XXXX     # ← 换成 2.1 拿到的码
```

Astro 构建时自动读取，不需要改任何代码：

```bash
npm run verify:all
rsync -avz --delete dist/ <user>@<host>:/srv/teachflow/dist/
```

抽查确认：`curl -s https://tryteachflow.com/en | grep google-site-verification`
应能看到 meta。回 GSC 点 **"验证 / Verify"**。

### 2.3 提交 sitemap 并催收录

1. 左侧菜单 **"站点地图 / Sitemaps"** → 输入 `sitemap-index.xml`
   （完整框里即 `https://tryteachflow.com/sitemap-index.xml`）→ 提交。
   状态应显示"成功"，"已发现的网址"约 25。
2. 顶部搜索框（**"网址检查 / URL Inspection"**）逐个粘贴关键页并点
   **"请求编入索引 / Request indexing"**（每天有人工配额，先做这几页）：
   - `https://tryteachflow.com/en`
   - `https://tryteachflow.com/ko`
   - `/en/skills`、`/en/buy`、`/en/faq`、`/ko/skills`、`/ko/buy`、`/ko/faq`
3. 三到七天后看 **"索引编制 / Indexing coverage"** 报告；`site:tryteachflow.com`
   在 Google 搜一下，出现页面即收录开始。

---

## 3. 第三步：Bing Webmaster Tools（同时服务 ChatGPT 检索）

ChatGPT 的网页检索建立在 Bing 索引上，这一步既是 SEO 也是 GEO。

1. 打开 <https://www.bing.com/webmasters>，可点 **"使用 Google 登录"**。
2. 首页选 **"导入 / Import" → "从 Google Search Console 导入"**——
   两三下点击，站点、验证、sitemap 一起带过来。**这是最省事的路径**，
   前提是第二步已完成。
3. 若走手动添加：填 `https://tryteachflow.com` → 验证方式选 Meta Tag →
   把 `content` 里的码写进 `.env` 的 `PUBLIC_SITE_VERIFICATION_BING=`，
   按 2.2 的流程构建部署后回来验证。
4. **"站点地图 / Sitemaps"** 确认 `https://tryteachflow.com/sitemap-index.xml`
   已提交。
5. （可选，进阶）Bing 支持 **IndexNow** 即时推送：在
   <https://www.bing.com/indexnow> 生成一个 key 文件放进 `public/`，
   发版后 curl 一下 API 即可让 Bing 立刻重抓。现阶段不必须。

---

## 4. 第四步：Naver Search Advisor（韩语市场，最重要的一家）

Google 在韩国不是第一搜索引擎；韩国教师找工具先搜 Naver。

### 4.1 注册与验证

1. 准备一个 Naver 账号（注册流程可能要求韩国手机号验证；若没有，
   这是本教程唯一可能卡住的地方，需要想办法借力完成注册）。
2. 打开 <https://searchadvisor.naver.com>，登录。
3. **"내 사이트(My Sites)" → "사이트 등록(Add Site)"** → 填
   `https://tryteachflow.com`。
4. 所有权验证（**"소유확인"**）方式里选 **"메타태그(meta tag)"**：
   Naver 给出 `<meta name="naver-site-verification" content="XXXX" />`，
   同样只取 `content` 里的码，追加到 `.env`：

   ```bash
   PUBLIC_SITE_VERIFICATION_NAVER=XXXX
   ```

5. `npm run verify:all` + rsync 部署 → 抽查
   `curl -s https://tryteachflow.com/ko | grep naver-site-verification` →
   回 Naver 点 **"소유확인"** 按钮，状态变绿即通过。

### 4.2 提交 sitemap 与收录请求

1. 左侧 **"요청(Request)" → "사이트맵 제출(Sitemap Submit)"** → 填
   `https://tryteachflow.com/sitemap-index.xml` → 提交。
2. **"요청 → 웹 문서 등록"**（或"수집 요청"）：把 `/ko`、`/ko/skills`、
   `/ko/buy`、`/ko/faq` 逐个提交，请求 Naver 机器人（Yeti）抓取。
3. Naver 对境外服务器（Hetzner 在德国）的抓取节奏偏保守，收录通常比
   Google 慢一至数周，属正常；每周回来看一次
   **"검색 현황(搜索表现)"**。

### 4.3 韩语侧的后续（与第五步配合）

Naver 生态里，官网收录只是入场券——韩国教师的购买决策重度依赖
네이버 카페 / 블로그 的第三方讨论（见第五步）。

---

## 5. 第五步：站外信号（GEO 的真正杠杆）

AI 引擎（Perplexity / ChatGPT / Claude）引用一个产品时，权重最大的是
**第三方来源**。新域名零外链时它们几乎不会提到 TeachFlow。按顺序做：

### 5.1 Product Hunt（一次发布 = 一个高权重第三方页面）

**准备（发布前一周）**

- 账号 + Maker 资料：用 `crossxtop@gmail.com` 注册，填 CROSSXTOP / TeachFlow。
- 素材：logo（`public/logo.png`，240×240 以内）、3–5 张 gallery 图
  （直接截 `/samples` 的成品图：slides / worksheets / parent notice）、
  tagline 用现成的 "Six agent skills that turn one textbook unit into a
  full week of lessons."、描述可复用 `/en` 首页 hero 文案。
- 写好 **Maker Comment**（发布后自己沙发）：讲"为什么做"——教师备课的
  真实流程 + 六个技能各产出什么。素材与站内文案纪律一致：不写无凭据
  的数字宣称。

**发布（选周二至周四，太平洋时间 0:01）**

- "Launch" 页排期发布；发布日全天守着回评论，每条都答。
- **不买票、不群发求赞**——PH 的算法会识别异常行为，降权是主惩罚。
- 发布结束页是永久页面，等于一个权重很高的第三方对 TeachFlow 的描述
  + 一条 dofollow 级别的入口。

### 5.2 G2 / Capterra 词条（采购检索入口）

1. <https://www.g2.com> → 底部 "List your software" / "Get listed" →
   用公司邮箱注册厂商账号。
2. 填产品页：分类选 Education / Course Creation / AI 一带；描述、截图、
   价格如实填 "USD 29.90 one-time, no subscription"；官网链接、支持邮箱
   与站内一致。
3. 审核通过后词条即上线；后续有真实用户再邀请写评论（G2 有免费的
   review request 链接，可放进购买确认邮件里）。
4. Capterra 流程几乎相同，二选一起步即可，有余力再做第二家。

### 5.3 Reddit（英文教师社区）

- 目标版块：`r/TEFL`、`r/EnglishTeachers`、`r/EdTech`、`r/Teachers`
  （每个版自订规则不同，发之前必读置顶）。
- **方式决定成败**：以参与者身份进社区（先回答别人的备课问题、分享
  免费的 samples 截图与工作流），相关讨论里顺带提产品；不发硬广、
  不刷链接。经验比例：90% 参与 / 10% 提及自家。
- AI 引擎对 Reddit 讨论的引用权重显著——哪怕帖子本身流量一般，
  "有真人在 Reddit 讨论 TeachFlow"这件事本身就是 GEO 信号。

### 5.4 韩国社区

- **네이버 카페**：搜"영어 교사", "중등영어", "인디교사"类教师 카페，
  同样的参与式打法；发帖用韩语、语气与 `/ko` 站点一致。
- **카카오톡 오픈채팅**：教师互助开放聊天室是韩国 B2C 的真实决策场
  （ux-review 目录里已有 KakaoTalk 客服频道的方案文档，可复用其定位）。
- **네이버 블로그 리뷰**：找几位早期韩国用户写真实使用记录（送一份
  license 即可），比任何广告可信。

### 5.5 外链纪律（与站内一致）

不买链接、不互链农场、不做无凭据宣称。`claims.test.mjs` 挡住的那些话
（审计认证、节省时长、用户数量）在站外同样不能说——AI 引擎摘录的句子
会被当成产品自己说过的话。

---

## 6. 第六步：Cloudflare CDN（收录稳定后再做）

目的：韩语教师到德国 Hetzner 的 TTFB 偏高；CDN 顺带提升爬虫抓取速度。

### 6.1 接入

1. <https://dash.cloudflare.com> 注册（Free 档够用）→ **"Add a site"** →
   `tryteachflow.com`。
2. CF 自动扫描现有 DNS 记录 → **逐条核对**与注册商现有记录一致
   （A 记录 → Hetzner IP；`www` 的 CNAME/URL 转发）。确认后继续。
3. CF 给出**两个 Nameserver**（如 `xxx.ns.cloudflare.com`）→ 去域名
   注册商把 NS 改成这两个。生效几分钟到 24 小时，CF 面板会显示
   "Active"。
4. **SSL/TLS** 模式设为 **Full (strict)**——源站 Caddy 已有有效证书，
   千万不要选 "Flexible"（会造成重定向环）。
5. 缓存不用改：HTML 已是 `must-revalidate`、`/_astro/*` 已是
   `immutable`，CF 默认行为照章办事。

### 6.2 接入当天必须跟的两件事（防排障地狱）

**a) 源站只信任 Cloudflare**：在 Hetzner 防火墙把 80/443 入站限制为
<https://www.cloudflare.com/ips/> 的 IP 段（SSH 规则另留）。不锁的话
任何人绕过 CF 直连源站 IP，CDN 与防护都形同虚设。

**b) 改 Caddy 的真实 IP 透传**：`deploy/Caddyfile` 里
`header_up X-Forwarded-For {remote_host}` 一行，接入 CF 后 remote_host
变成 CF 边缘节点——限流与漏斗日志将全部记成同一个 IP 段。改为读 CF
的可信头：

```caddyfile
# 原：header_up X-Forwarded-For {remote_host}
# 改（仅当源站防火墙已只放行 CF IP 段时才安全）：
header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}
```

改完 `caddy validate`（记得 access.log 的坑）→ `systemctl reload caddy`。

### 6.3 验收

```bash
curl -sI https://tryteachflow.com/en | grep -i cf-ray   # 有值 = 已过 CF
# 用 https://www.webpagetest.org 选 Seoul 节点测 /ko，对比接入前的 TTFB
# deploy/README.md §6 的全部 curl 清单重跑一遍
```

---

## 7. 上线后的维护节奏

| 频率 | 动作 |
|---|---|
| 每周一次 | GSC"索引编制"报告、Bing 与 Naver 站点地图状态；`site:tryteachflow.com` 抽查 |
| 每次发版 | 无需手动提交——sitemap 的 lastmod 由 git 自动更新，引擎会重抓；急单页可用"网址检查"催 |
| 每月一次 | 在 ChatGPT / Perplexity 里问 "AI lesson planning tools for English teachers"、"AI 교수법 도구" 看是否开始被提及；不被提 = 回到第五步加码站外 |
| 季度 | 复核 robots.txt AI 段与 Caddy 放行清单仍是预期形态（守卫测试已在每次构建兜底） |

**验收标准**（全部达成即本手册闭环）：

- [ ] GSC / Bing / Naver 三家属性已验证，sitemap 状态"成功"
- [ ] `site:tryteachflow.com` 在 Google 与 Bing 各返回 ≥ 10 页
- [ ] Naver 搜 "TeachFlow" 能看到官网
- [ ] Product Hunt 发布完成，G2 词条上线
- [ ] Cloudflare Active，首尔节点 TTFB 明显改善，源站仅收 CF 流量
