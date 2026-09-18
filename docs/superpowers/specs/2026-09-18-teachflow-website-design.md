# TeachFlow-KR 官方网站设计文档

- 日期：2026-09-18
- 状态：已通过设计评审，待实现计划
- 代码仓库：`workspace/`（remote `git@github.com:vichajser/teachflow-skills.git`）
- Astro 项目置于仓库根目录，不再嵌套子目录

## 1. 背景与目标

TeachFlow-KR 是面向韩国英语教师的 6 个 Claude Skill 组成的套件。本项目为其构建国际化营销官网。

网站承担两个目标：

1. **说明产品** —— 讲清 6 个 skill 各做什么、彼此如何协作、产出长什么样。
2. **支撑支付资质** —— 作为 Stripe 账户激活审核的商户网站，并配合在 Agensi.io 上架。

内容主源为 `TeachFlow-KR/docs/README.md`；安全声明的事实依据为 `TeachFlow-KR/_SPEC.md` §3。

**注意**：上述两份源文件与 `sources/` 教材素材位于本仓库之外（父目录 `TeachFlowSkills/`，未纳入版本管理）。实现时需要读取它们，但不复制进本仓库——教材 PDF 有版权，skill 源码有独立发布路径。本仓库只存网站代码、spec 与经脱敏的样例产物。

### 1.1 商业模式（本期范围）

本期**仅做展示**，站内不实现结算。购买入口指向 Agensi 商品页或邮件联系。目的是先拿到 Stripe 账户激活。后端与结算能力在目录结构上预留，不实现。

### 1.2 定价

单一 SKU：**TeachFlow-KR Complete Bundle，USD 19.90，一次性买断**，包含全部 6 个 skill。

全站价格一律写作 `USD 19.90`（含币种代码），不写 `$19.9`。Stripe 要求购买币种无歧义。

### 1.3 非目标

- 不做站内支付、购物车、账户体系
- 不做浅色模式
- 不做博客、CMS
- 不做 SSR；纯静态输出

## 2. 技术选型与部署

- **框架**：Astro（目录式官方 i18n、内容集合、默认零 JS）
- **样式**：Tailwind CSS
- **输出**：纯静态，`dist/` 直接由 Caddy/Nginx 托管
- **部署目标**：Hetzner 服务器，无 Node 运行时
- **字体**：自托管 woff2，不使用 Google Fonts CDN（欧洲部署更快，且省去一条 GDPR 第三方请求说明）

## 3. 信息架构与路由

三语言均为一等公民，英语为默认语言。

```
/en （默认，/ 重定向到 /en）   /ko   /zh
├── /                首页 —— 叙事 + 六 skill 关系主动画 + 成品预览 + CTA
├── /skills          六个 skill 详情（输入 / 产出 / 教师检查项，源自 README 第 4 章）
├── /samples         真实产出画廊 —— 可下载的韩语成品
├── /pricing         USD 单一套件价，含币种代码、包含什么、交付方式
├── /security        安全与隐私（Agensi 8 点扫描逐条对照 + 无网络 / 无外传）
├── /docs            安装与快速上手（README 第 2 章浓缩）
├── /faq             常见问题
└── /legal
    ├── /terms       服务条款
    ├── /privacy     隐私政策（GDPR，英国主体）
    ├── /refund      退款与取消政策
    └── /delivery    数字商品交付说明
```

### 3.1 i18n 机制

- Astro 目录式路由：`src/pages/[lang]/...`
- UI 文案集中于 `src/i18n/{en,ko,zh}.json`，不散落在组件中
- 长文内容用 Astro 内容集合，按语言分目录
- 每页输出 `hreflang`（en / ko / zh + `x-default` 指向 en）与 `canonical`
- 语言切换保持当前路径，不回首页

### 3.2 `/security` 独立成页的理由

安全是本产品最强的差异化信号。Agensi 的 8 点自动扫描与 Stripe 的人工复审都会查看这一层；同时公开市场上已出现含凭据窃取与后门的 skill，教师用户对此有实际顾虑。合并进 FAQ 会稀释这一信号。

### 3.3 全站页脚

```
CROSSXTOP LTD · Registered in England and Wales · Company No. 16339041
Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ
```

一处同时满足 Companies Act 2006 的网站披露义务与 Stripe 的主体一致性要求。

地址已由用户确认为 Kington（原始记录中的 "Kingdom" 为笔误）。此地址须与 Companies House 公开记录及提交给 Stripe 的主体信息**逐字一致**——Stripe 人工复审会比对，不一致即驳回。

客服邮箱：**vichajser@gmail.com**

**待处理**：Gmail 地址可用于 Stripe 激活审核，但商用可信度低于自有域名邮箱。域名确定后建议改为 `support@<域名>`，并在此处同步更新。

## 4. 主动画：六 skill 依赖关系图

首页核心。内联 SVG + CSS transform，`IntersectionObserver` 滚动触发，不引入动画库。

### 4.1 四拍演出

1. **输入落下** —— 教材 PDF 图标 + 学习者信息卡从顶部落入，轻微弹跳停住
2. **一级节点点亮** —— `lesson-workflow` 亮起，内部四个子产物依次浮现：`단원 차시 분할 → 차시 수업 설계안 → 수업 지도안 → PPT 개요`；连线用 `stroke-dashoffset` 自绘
3. **分叉到四个独立节点** —— 四条线同时向下生长，`ppt / audio / word / worksheet` **同时**亮起（视觉上表达"互相独立、按需选用"），各自飞出产物徽章 `.pptx` `.mp3` `.xlsx` `.docx ×3`
4. **课后节点** —— 四线收拢汇入 `report-workflow`，产出 `.png` 안내문

### 4.2 约束向下流动（点睛）

README §3.3 的"上位阶段约束向下流动、下位不得推翻上位"，做成沿连线向下滑动的发光胶囊，带 `핵심 흐름`、`단계 순서` 字样，流经下游节点时该节点边框同步亮一下。

这一处可视化了竞品说不清的机制，是全站信息密度最高的动效。

### 4.3 交互

悬停任一节点：其余节点降透明度，该节点输入边高亮、输出边换色，侧边浮出小卡（需要什么 / 产出什么 / 对应哪个样例，可点击跳 `/samples`）。移动端改为点击展开。

### 4.4 技术约束

- 单独一个 Astro island，仅首页加载此段 JS；其余页面保持零 JS
- `prefers-reduced-motion: reduce` 时直接渲染终态静态图，无任何位移
- 移动端自动切竖排布局
- 所有标签走 i18n 变量，不烧进 SVG；节点宽度用 `textLength` 自适应，避免韩/中文标签溢出

### 4.5 其余动效（仅此三处）

1. Hero：教材图标扇形展开为 6 个产物缩略图，循环一次即停
2. 成品画廊：卡片 hover 轻微升起 + 阴影加深，点击开灯箱
3. "节省时间"计数器：数字滚动到位后停住，不循环。**所用数字必须有依据** —— 取自实际运行 6 个 skill 的耗时记录（见第 7 章样例生成），不得使用未经测量的宣传数字

除此之外全站不做动效。

## 5. 视觉与品牌

基调：深空底 + 电光蓝青 + 几何网格。质感取向为开发者工具而非教育机构，以传达"为专业人士打造"。

### 5.1 色板

```
背景层
  --bg-void      #070B16   最底层
  --bg-surface   #0E1626   卡片 / 区块
  --bg-raised    #16203A   悬浮态、代码块
  --border       #1F2C4A   1px 描边

主色
  --accent       #2E7DFF   电光蓝 —— 主 CTA、链接、焦点环
  --accent-glow  #22D3EE   冰青   —— 辉光、连线、数据流
  --accent-warm  #A855F7   电紫   —— 仅用于第三阶段 / 强调点

文字
  --text-hi      #F2F6FF   标题
  --text-body    #C3CFE4   正文
  --text-mute    #7C8AA6   辅助信息、页脚法务
```

**约束**：霓虹色仅用于描边、连线、辉光与小面积图标，不用于正文。深底上的 `#22D3EE` 正文既刺眼又无法通过 WCAG AA。

### 5.2 配色即信息编码

第 4 章动画的三个阶段映射到色板，全站复用：

| 阶段 | 颜色 | 含义 |
|---|---|---|
| 1 级 `lesson-workflow` | 冰青 `#22D3EE` | 流程源头 |
| 2 级 ppt / audio / word / worksheet | 电光蓝 `#2E7DFF`（四档明度） | 并列、独立 |
| 3 级 `report-workflow` | 电紫 `#A855F7` | 课后、终点 |

产物徽章、`/skills` 卡片、`/samples` 标签一律沿用，无需额外图例。

### 5.3 质感手法（仅此四项）

1. **网格底纹** —— `radial-gradient` 点阵，opacity 0.04，向下渐隐，纯 CSS
2. **辉光** —— 关键节点与主 CTA `box-shadow: 0 0 40px rgba(46,125,255,.35)`
3. **渐变描边** —— 重点卡片 1px 蓝→青渐变边框
4. **等宽字标注** —— 产物文件名一律 JetBrains Mono

毛玻璃仅用于吸顶导航一处。

### 5.4 字体

| 语言 | 字体 |
|---|---|
| EN | Inter |
| KO | Pretendard |
| ZH | Noto Sans SC |
| Mono | JetBrains Mono（三语共用） |

通过 `:lang()` 自动切换，自托管 woff2 + `font-display: swap`。

韩语与中文在同字号下视觉重量大于英文，标题字号按语言下调一档。

### 5.5 合规区静音

`/pricing` 与 `/legal/*` 沿用同一色板，但正文区改用 `--bg-surface` 高对比阅读版式，**取消所有辉光与动效**，价格 `USD 19.90` 以大号高对比呈现。

理由：Stripe 审核员需在两分钟内看清"卖什么、多少钱、怎么退款、找谁"。营销区可炫，合规区必须静。

## 6. 合规内容

### 6.1 Stripe 审核清单映射

| 要求 | 位置 | 内容 |
|---|---|---|
| 全部在售商品 + 价格 | `/pricing` | TeachFlow-KR Complete Bundle — USD 19.90，一次性买断，列全 6 个 skill |
| 具体商品描述 | `/pricing` + `/skills` | 6 个 Claude Skill 文件包（SKILL.md + references），zip 下载 |
| 数字商品交付说明 | `/legal/delivery` | 经 Agensi 购买：付款后获签名下载链接（24 小时有效，可在 dashboard 重新生成），zip 内含 SKILL.md + references；版本更新免费重下。无实体配送。另列明运行环境要求 |
| 退款政策 | `/legal/refund` | 见 6.2 |
| 取消政策 | `/legal/refund` 同页 | 一次性买断、无订阅、无自动续费 |
| 客服联系方式 | 全站页脚 + `/pricing` 页内"联系与支持"区块 | `vichajser@gmail.com` 直达 + 响应时限承诺（建议"2 个工作日内"）；不得仅提供表单。不单独开 `/support` 页 |
| 主体信息一致 | 全站页脚 | 见 3.3 |
| 站点公开可访问 | 部署配置 | 无 Basic Auth、无 `noindex`、无 "Coming Soon" |

最后一项是 Stripe 预发布站点最常见的驳回原因，列为部署前必查项。

### 6.2 退款政策写法

已于 2026-09-18 经浏览器核实（见 10.2）：**Agensi 为 merchant of record，退款与拒付均由 Agensi 执行**，卖家的 Stripe Connect 账户仅为收款目的地。

页面需分两条路径说明，并单列消费者法定权利：

- **通过 Agensi 购买** → 适用 Agensi 退款政策，由 Agensi 受理，附 `https://www.agensi.io/terms` 链接
- **直接联系我们购买** → 14 天内未下载可全额退款
- **EU/UK 消费者** → 享 14 天无理由撤回权；数字商品一经下载，依 UK Consumer Contracts Regulations 2013 撤回权终止，购买前明确提示并取得同意

第三条为英国主体向 EU/UK 消费者销售数字商品的法定要求，不可省略。

**写法纪律**：第一条**只给链接、不复述 Agensi 的具体退款天数**。Agensi 自家两份文件互相矛盾（`/terms` §5.5 称 30 天无理由，`/stripe-terms` 称 14 天且需"materially defective"），且其条款可随时变更。复述等于把别人的错误抄进我们的法律页。

### 6.3 `/security` 页结构

表格式，逐条对应 Agensi 8 点扫描：**扫描项 → 我们的做法 → 可验证方式**。表格行顺序与 Agensi 扫描项名称一一对应：

| Agensi 扫描项 | 我们的做法（依据 `_SPEC.md` §3） |
|---|---|
| Prompt injection | 上传教材内容仅作数据处理，不作为指令执行 |
| Data exfiltration | 文件读写限定于当前工作目录，产物写入 `outputs/`，不触碰 `~`、`/etc`、`/usr` |
| Secret detection | 无硬编码密钥；如需凭据只出现环境变量名 |
| Dangerous commands | 仅白名单命令：python-pptx、python-docx、openpyxl、soffice/LibreOffice、headless Chrome（仅本地 HTML 渲染） |
| Obfuscation | 无 base64 串、无转义技巧、无不可见 Unicode |
| External fetch | **无网络访问** —— 不请求外部 URL、不下载远程脚本、不调用外部 API |
| Credential access | 不读取 keychain、`.ssh`、`.aws`、浏览器凭据等任何凭据存储 |
| Privilege escalation | 无 `sudo`、`chmod 777`、`rm -rf`、`curl \| sh`、`eval` |

"可验证方式"一列填写用户自查路径（如 skill 源码为纯文本 Markdown，可直接通读；zip 内无二进制可执行文件）。

配面向教师的结论句：**学生姓名与教材扫描件不会离开你的电脑。**

**措辞纪律**：只陈述 `_SPEC.md` 中确有约束的条目。不得出现"通过第三方安全审计"等无依据表述——Stripe 与 Agensi 均会核查。

## 7. 韩语样例生成

独立工作流，**与建站并行**。站点先用占位卡片开发，样例产出后替换，不阻塞主线。

### 7.1 输入

`sources/Think1_Unit07.pdf` + `sources/T1_U07_TG.pdf`（Teaching Guide）。教材本身为英语教材，符合韩国英语课实际；skill 产出的教师面向文字用韩语，学生面向内容保持英语。

### 7.2 产出范围

覆盖一个完整单元课时，贯穿三个阶段：

| Skill | 产物 | 语言 |
|---|---|---|
| lesson-workflow | 차시 분할 + 수업 지도안 | 韩语 |
| ppt-workflow | `.pptx` + 预览 PNG | 幻灯片英语，备注韩语 |
| audio-workflow | 听力 `.mp3` | 英语音频 + 韩语说明 |
| word-workflow | 词汇 `.xlsx` | 英韩对照 |
| worksheet-workflow | 学生单 + 答案页 `.docx` | 学生单英语，教师答案页韩语注 |
| report-workflow | 학부모 안내문 PNG | 韩语 |

### 7.3 站上呈现

`/samples` 每个产物一张卡：缩略图 + 生成它的 skill 名（配 5.2 的阶段色）+ 生成耗时 + 真文件下载。家长通知单 PNG 视觉完成度最高，用作首屏英雄图。

### 7.4 隐私约束

样例文件中**不得出现任何真实学生姓名或学校名**，统一使用 `Class 1-3`、`김민준(예시)` 等明示虚构标识。真实姓名进入公开站点既违反 GDPR，也会瓦解 `/security` 页的可信度。

## 8. 错误处理与降级

| 场景 | 处理 |
|---|---|
| 用户关闭 JS | 动画区渲染终态静态 SVG；全站导航与内容不依赖 JS |
| `prefers-reduced-motion` | 同上，无位移动效 |
| 字体加载失败 | `font-display: swap` + 系统字体栈兜底（韩语回落 Apple SD Gothic Neo / Malgun Gothic） |
| 样例文件尚未生成 | 卡片显示占位态，标注"样例准备中"，不显示坏链 |
| 未知语言前缀 | 重定向至 `/en` |
| 404 | 各语言独立 404 页，保持语言上下文 |

## 9. 测试与验收

### 9.1 自动检查

- 构建产物中三语页面数量一致，无缺页
- 每页 `hreflang` 与 `canonical` 存在且互指正确
- 无死链（含样例下载链接）
- Lighthouse：性能 ≥ 90，可访问性 ≥ 95
- 对比度检查：所有文字组合通过 WCAG AA

### 9.2 人工验收

- 三语切换保持当前路径
- 韩语 / 中文长标签在动画节点内不溢出
- 动画在 `prefers-reduced-motion` 下完全静止
- 移动端动画竖排布局可读
- **Stripe 审核模拟**：以两分钟为限，从首页能否找到商品、价格、退款政策、客服邮箱、公司主体信息

### 9.3 部署前必查

- [ ] 站点公开可访问，无 Basic Auth、无 `noindex`、无 "Coming Soon"
- [ ] 页脚公司信息与提交给 Stripe 的法律主体逐字一致
- [ ] 客服邮箱真实可达并已测试收信
- [ ] 价格全站写作 `USD 19.90`

## 10. 待确认事项（实现前必须坐实）

### 10.1 已确定

- **注册办公地址** —— `Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ`（已确认）
- **客服邮箱** —— `vichajser@gmail.com`（域名确定后建议迁移至自有域名）

### 10.2 Agensi 平台事实（2026-09-18 经浏览器核实，已结）

| 事项 | 结论 | 出处 |
|---|---|---|
| Merchant of record | **Agensi**。以自己名义向买家销售，负责计税、开票，**并处理退款与拒付** | `/terms` §7.5、§5.1；`/stripe-terms`；`/sell` |
| 卖家 Stripe 账户角色 | **仅为收款目的地**（Stripe Connect payout destination），买家扣款不经过卖家账户 | `/terms` §7.2 |
| 交付方式 | 付款后获**签名下载链接，24 小时有效**，可在 dashboard 重新生成；每次下载带买家指纹；版本更新免费重下。无邮件交付 | `/terms` §5.2、§5.3、§8.3 |
| 分成 | **70/30**（卖家 70%）。正文全部一致；80/20 仅出现在两篇 blog 的标题与 meta 中，而该两篇正文自身写的是 70/30，属过期文案残留 | `/terms` §6.4、§7.1；首页；`/sell`；`/about` |
| 退款条款 | **两页互相矛盾**：`/terms` §5.5（2026-09-02 更新）称 30 天无理由全额退；`/stripe-terms`（2026-06-24 更新）称 14 天且"refunds are not guaranteed"、需"materially defective"。商品页徽章显示"30-day refund guarantee" | 同左 |
| 退款清算 | 买家退款时按 70/30 反向从卖家 Stripe 余额扣回，卖家仅承担自己那份 | `/learn/how-agensi-payouts-work-stripe-connect` |

按 70% 计，USD 19.90 的单笔实收约 **USD 13.93**。

**未能确定**：Agensi 无独立退款政策页（`/refund`、`/refunds`、`/legal`、`/seller-terms` 等均 404）；30 天与 14 天哪个实际生效未见其官方澄清；结账流程中 EU 撤回权同意的实际措辞需登录后才能验证。上述不确定性正是 6.2 规定"只给链接、不复述天数"的原因。

### 10.3 本站申请 Stripe 的定位（因上述发现需重新确认）

原始需求假设"官网为上架 Agensi 申请支付所需"。核实结果表明该前提不成立：**Agensi 上架只需连接 Stripe Connect（Express）账户，不需要独立的 Stripe 商户激活审核**，且 Agensi 销售的资金流完全不经过本站的 Stripe 账户。

因此本站申请 Stripe 商户账户的真实理由只剩：**为将来从本站直接销售铺路**。

由此产生一项审核风险：审核员访问站点时若发现购买按钮跳转至第三方、站内无任何结算能力，可能质疑该 Stripe 账户的用途。

应对（本期采用）：`/pricing` 明确区分两条购买路径——经 Agensi 购买，或直接联系 `vichajser@gmail.com` 购买；`/legal/refund` 对直销路径给出本站自己的 14 天条款。本站 Stripe 账户对应的即为直销收款。此方案不扩大本期"仅做展示"的范围。

**需用户确认**：是否接受该定位，或改为本期即实现站内直销结算（超出当前范围），或推迟 Stripe 申请。

### 10.4 待定：域名

域名尚未购买，开发期使用占位域名。`canonical` 与 `hreflang` 的域名部分通过单一配置项注入，确定后一处改动即可。
