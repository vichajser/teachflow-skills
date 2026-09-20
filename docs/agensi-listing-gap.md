# Agensi 上架差距分析（内部文档）

对象平台：https://www.agensi.io
对象包：`TeachFlow-KR/skills/` 六个 skill
唯一事实来源：`/Users/mac/workspace/TeachFlowSkills/TeachFlow-KR/PUBLISHING.md`（§0–§6）
核查日期：2026-09-20

> 本文档中所有会被粘贴进表单的字符串（韩文文案、法人信息、条款名）保持原文，不翻译。
> 本文档只写 PUBLISHING.md 能支撑的事实。任何未覆盖项标记为 `未知（PUBLISHING.md 未涵盖）`。

---

## 1. 已经就绪

### 1.1 六个 zip 已构建并通过校验

`ls -la /Users/mac/workspace/TeachFlowSkills/TeachFlow-KR/dist/` 实测（2026-09-19 10:40 构建）：

| zip | 实测字节 | PUBLISHING.md §2 记录 | 文件数（`unzip -l` 实测） | 一致 |
| --- | --- | --- | --- | --- |
| `lesson-workflow.zip` | 65,395 B（63.9 KB） | 63.9 KB / 17 개 | 17 | 是 |
| `worksheet-workflow.zip` | 35,857 B（35.0 KB） | 35.0 KB / 8 개 | 8 | 是 |
| `ppt-workflow.zip` | 31,790 B（31.0 KB） | 31.0 KB / 7 개 | 7 | 是 |
| `report-workflow.zip` | 24,445 B（23.9 KB） | 23.9 KB / 6 개 | 6 | 是 |
| `word-workflow.zip` | 23,862 B（23.3 KB） | 23.3 KB / 6 개 | 6 | 是 |
| `audio-workflow.zip` | 23,754 B（23.2 KB） | 23.2 KB / 6 개 | 6 | 是 |

验证方式：`ls -la` + `unzip -l` 逐个比对 PUBLISHING.md §2 的 `[OK]` 清单。六个全部吻合，无尺寸漂移，说明 dist 与文档记录的是同一次 `package.py` 构建产物。

`package.py` 已自动排除 `.DS_Store` / `.claude` / `__MACOSX` / 点开头文件（§2 第 4 条），并在生成后重新打开 zip 验证结构（§2 第 5 条）。zip 内部无二层嵌套。

**注意**：`dist/` 下存在一个 `.claude` 目录（`ls -la` 可见），它在 dist 目录里、不在 zip 内，不影响上传。

### 1.2 安全姿态：8 项扫描已逐项对应

PUBLISHING.md §3 给出 Agensi 自动扫描 8 项与本包的对应关系，`verify.py` 做机械检查：

| Agensi 扫描项 | 本包对应 | verify.py 检查 |
| --- | --- | --- |
| prompt injection | 모든 SKILL.md 말미의 "입력 자료 취급 원칙" 블록 | 블록 존재 여부 |
| data exfiltration | 네트워크 미사용 명시 | 외부 URL 0건 |
| secret detection | 키·토큰 미포함 | 시크릿 패턴 정규식 |
| dangerous commands | `rm -rf`/`sudo`/`chmod 777` 금지 서술만 존재 | 코드블록 내 출현 시 오류 |
| obfuscation | Base64·비가시 유니코드 없음 | 60자+ Base64, U+200B 계열 |
| external fetch | 외부 요청 없음 | URL 정규식 |
| credential access | 환경변수 미접근 | `os.environ`/`process.env` |
| privilege escalation | 권한 상승 없음 | `sudo`/`eval(` |

结构性优势（§3）：**실행 코드 없음, 순수 마크다운**。没有 `scripts/`、没有二进制、没有安装钩子；全部是纯 markdown（`find skills -name "*.md"` 实测 32 个文件，与 §3 所述"순수 마크다운 32개 파일"一致）。攻击面只剩"文档让 agent 做什么"这一条，而这一条已在 `SECURITY.md`（每个 zip 内 6,149 B）里明文公开。

§3 要求在 listing 说明里写一行 **"실행 코드 없음, 순수 마크다운"** —— 这行文案尚未写（见 §2.3）。

审核耗时：§3 给出 통상 24~48시간。

> 本包**没有任何第三方安全认证**（无 SOC 2、无 ISO 27001、无渗透测试、无外部审计），listing 文案里不要暗示有。可主张的只有"无可执行代码 + 安全说明公开"这一客观结构事实。

### 1.3 营销官网已上线

`/Users/mac/workspace/TeachFlowSkills/workspace/` 已有站点，`src/config/site.ts` 是常量唯一出口，含公司主体、价格、Agensi 链接，`src/content/legal/{ko,en}/` 下已有 terms / privacy / refund / delivery 四份法务页（中英韩双语目录结构）。

**但要说清楚**：PUBLISHING.md §0 明确写着 —— 공식 웹사이트는 **Agensi 상장에는 필요 없다**。自有官网只有在做**自家商城直销**时才是必需的。所以官网是一项独立资产，不是上架前置条件，不应计入"上架进度"。它当前对 Agensi 上架的唯一作用是：`/legal/terms` 的文本可作为替换 zip 内 MIT LICENSE 的蓝本（见 §3.2）。

---

## 2. 还缺什么（按阻塞顺序）

### 2.1 Agensi 账号 + 切换为 Creator / Seller 【阻塞一切】

- **是什么**：https://www.agensi.io → Sign up → 进入 `/sell` 切换为 Creator / Seller（§1.1）。
- **为什么**：没有 Creator 身份就看不到 Creator Dashboard，后面全部步骤无从谈起。
- **"完成"的样子**：能进入 Creator Dashboard，看到 Submit a Skill 入口。
- **性质**：纯执行，无需决策。

### 2.2 Stripe Connect 连接 【阻塞收款，不阻塞提交】

- **是什么**：Creator Dashboard → Payouts → Connect Stripe（§1.2）。即使只上免费 skill 也强制要求连接。
- **为什么**：§0 说明 Agensi 是 merchant of record，买家付款**不经过**你的 Stripe；你的 Stripe 只是 payout destination。因此**不需要**通过 Stripe 独立商户 activation 审核 —— 只要 Connect 连上即可。
- **§1.2 的硬警告**：这里填的法人信息必须与 CROSSXTOP 英国登记信息**逐字符一致**（含地址、法人名拼写）。不一致是结算被挂起最常见的原因。

正确信息（原文照抄，勿改大小写、勿改标点）：

| 字段 | 值 |
| --- | --- |
| Company | `CROSSXTOP LTD` |
| Registered in | `England and Wales` |
| Company No. | `16339041` |
| Address | `Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ` |

这组值与 `workspace/src/config/site.ts` 第 14–17 行完全一致，可直接复制。

- **"完成"的样子**：Payouts 页显示 Stripe 已连接，且法人信息四项逐字符核对过一遍。
- **性质**：纯执行。但务必用复制粘贴，不要手打。

### 2.3 六份 listing 文案 【阻塞提交】

- **是什么**：每个 skill 一份买家向说明，按 §4.2 模板写。
- **为什么**：§4.2 明确禁止把 SKILL.md 的 `description` 字段直接粘贴进来 —— 那是写给 agent 做触发匹配的关键词堆砌（实测六个 `description` 都是 200 字以上的韩英混排长句），人读起来很差。必须另写买家向文案。

§4.2 模板骨架（七个块）：

```
[1줄 요약]
무엇을 넣으면 무엇이 나오는지.

[입력 / 출력]
입력: 교재 페이지(PDF·이미지·HWP·DOCX), 확정된 수업 지도안
출력: (파일 형식까지 명시) 편집 가능한 .pptx 1개

[대상]
초등 3~6학년 / 중학교 / 고등학교 / 성인 영어 수업 교사.
설명 언어는 한국어, 교실 언어는 영어.

[의존 관계 — 필수 기재]
이 스킬은 lesson-workflow 가 만든 수업 지도안을 입력으로 받습니다.
지도안이 없으면 먼저 lesson-workflow 를 사용하세요.
(lesson-workflow 자체는 이 줄 대신 "단독 사용 가능"이라고 쓴다)

[동작 환경]
Claude Code, Codex CLI, Cursor, Gemini CLI 등 SKILL.md 표준을 지원하는 에이전트.
실행 코드 없음 — 순수 마크다운 지시문. 네트워크 접근 없음.

[포함 내용]
SKILL.md 1개 + 참조 문서 N개 + 한국어 사용 설명서 + 보안 고지

[가격]
USD N
```

**依赖关系行是强制的。** §4.2 原文：**"의존 관계 줄을 빼면 환불이 들어온다."** audio / word / worksheet / ppt / report 这五个都以"수업 지도안"为前提才能运行，漏写就会产生退款。lesson-workflow 这一行改写为 "단독 사용 가능"。

| skill | 依赖行 |
| --- | --- |
| lesson-workflow | 단독 사용 가능 |
| worksheet-workflow | 需写依赖行（依赖 lesson-workflow 的 수업 지도안） |
| ppt-workflow | 需写依赖行 |
| audio-workflow | 需写依赖行 |
| word-workflow | 需写依赖行 |
| report-workflow | 需写依赖行 |

另需在文案中补两处：
- §2.1 要求注明"이 스킬은 6종 세트 중 하나"，否则买了一个的人看到 41KB 全套 README 会困惑。
- §3 要求写入一行 "실행 코드 없음, 순수 마크다운"。

**退款措辞（逐字照抄，不得改写）**：

> 환불은 Agensi 플랫폼 환불 정책을 따릅니다.

**绝不写天数。** §0 记录 Agensi 自家不同页面给出的退款期限互相矛盾，§4.3 说明：自己复述其中任一个数字，一旦发生争议对自己不利。只放平台退款政策链接：https://www.agensi.io/terms （`site.ts` 第 31 行已按同一原则处理：只链接，不复述）。本文档同样不复述该数字。

- **"完成"的样子**：六份文案各自成文，六份都含依赖行、都含"실행 코드 없음"、都含上面那句退款原文、都不含任何天数数字。
- **性质**：纯执行工作量，但**价格那一栏取决于 §3.1 的决策**，所以文案不能在定价拍板前定稿。

### 2.4 标签（§4.1）

共通 6 个（六个 skill 全部都带）：

`education`, `teaching`, `english-language`, `korean`, `lesson-planning`, `document-generation`

每个 skill 额外追加 3 个：

| skill | 追加标签 |
| --- | --- |
| lesson-workflow | `lesson-plan`, `curriculum`, `k12` |
| ppt-workflow | `pptx`, `slides`, `presentation` |
| audio-workflow | `listening`, `tts`, `audio-script` |
| word-workflow | `vocabulary`, `xlsx`, `google-sheets` |
| worksheet-workflow | `worksheet`, `docx`, `differentiated-instruction` |
| report-workflow | `parent-communication`, `poster`, `png` |

- **性质**：纯执行，照抄即可。

### 2.5 上架前最终检查清单（§6，全 8 项）

- [ ] `python3 package.py` 가 오류 0건으로 끝났다
- [ ] 6개 zip 모두 `[OK]` 이고 이중 중첩·정크 파일이 없다
- [ ] Stripe Connect 법인 정보가 CROSSXTOP 등기 정보와 글자 단위로 일치한다
- [ ] 리스팅 설명 6개 각각에 **의존 관계 줄**이 들어갔다
- [ ] 가격을 `USD 19` 형식으로 적었다 (`$19` 아님)
- [ ] 환불 일수를 숫자로 쓰지 않았다
- [ ] "실행 코드 없음 / 네트워크 접근 없음" 을 명시했다
- [ ] lesson-workflow 1개를 먼저 올려 심사 통과를 확인했다

当前状态：第 1、2 项事实上已满足（dist 六个 zip 与 §2 记录吻合），但**若按 §3.2 / §3.3 改了 LICENSE 与 README，必须重跑 `package.py` 并重新勾选这两项**。其余 6 项全部未完成。

---

## 3. 需要你拍板的决定

### 3.1 定价与上架形态（已解决 · 2026-09-19）

> **结论先行。** 这一节原本记的是"六个独立上架"与"一个整包"之间的取舍，并把
> USD 76 与 USD 29.90 的 3.8 倍落差列为必须先解决的矛盾。实地核查 Agensi 平台后，
> 这个取舍是个伪二选一：Agensi 有**原生 bundle 商品**，六个独立上架是做 bundle 的
> **前提**，不是它的替代方案。落差也不再是矛盾，而是 bundle 卡片上本来就要显示的
> 那条划掉的"单品合计"。原文分析保留在下方，作为决定的由来。
>
> **平台事实**（实地核查，非推断）：
> - `/terms` §5.4 原文：*"Creators may offer bundles of multiple skills at a combined
>   price. Purchasing a bundle grants you ownership of all included skills under the
>   same license terms. If you already own one or more skills in a bundle, you may be
>   eligible for a reduced price."*
> - `/terms` §5.5：30 天退款保证对 *"direct one-time purchases and bundles alike"* 一
>   视同仁。
> - `/bundles` 已有 220 个在售 bundle，卡片显示组合价、划掉的单品合计、以及
>   `Save $X · Y%` 标记。
> - 付费 skill 最低价 USD 5.00；分成为 **创作者 70% / Agensi 30%**，bundle 同此比例。
>
> **由此得到的两条推论：**
> 1. 原表中"一个整包上架"那一列的技术风险（zip 内二层嵌套 → 安装失败）**根本不存在**。
>    bundle 是平台层面的商品组合，六个 zip 各自仍是标准单层结构，`package.py` 产出的
>    就是它们。§2 "绝不要二层嵌套"与卖套装之间没有冲突。
> 2. 买家做的算术现在有了官方出口：USD 76（19+15+15+9+9+9）就是 bundle 卡片上那条
>    划掉的合计，USD 29.90 是组合价，平台自己会把差额渲染成 `Save $46 · 61%`。不需要
>    额外写一句解释，平台的商品形态已经把它解释掉了。
>
> **据此拍板：**六个 skill 按 §1.3(b) 的阶梯各自独立上架（USD 19 / 15 / 15 / 9 / 9 / 9），
> **并且**在其上架一个含全部六个的 bundle，定价 **USD 29.90**，与官网口径完全一致。
> 官网只显示这一个数（`SITE.price.display`），不列单品阶梯 —— 单买的入口是 Agensi。
> 按 70% 计，一笔 bundle 成交实收约 **USD 20.93**。
>
> **代价（若这个判断错了）：**若 Agensi 审核时要求 bundle 与单品价差不得超过某个比例
> （其 `/terms` 未见此类条款），需要上调 bundle 价或下调单品阶梯。届时改的是 Agensi 侧
> 的两个数字和 `site.ts` 一行，不涉及 zip 重打包。
>
> 这一项连带解决了长期挂着的 **R-21**（官网价与 PUBLISHING.md 阶梯对不上）。

---

**以下为原始分析，保留备查。**

**冲突本身。** `PUBLISHING.md` §1.3(a) 推荐 **6 个独立上架**；§1.3(b) 给出的价格阶梯是：

| 스킬 | 역할 | 권장 가격 |
| --- | --- | --- |
| lesson-workflow | 진입 상품 (체인의 시작, 참조 문서 13개로 가장 무겁다) | USD 19 |
| worksheet-workflow | 단독 가치 높음 | USD 15 |
| ppt-workflow | 단독 가치 높음 | USD 15 |
| audio-workflow | 보조 | USD 9 |
| word-workflow | 보조 | USD 9 |
| report-workflow | 보조 | USD 9 |

而已上线的官网（`workspace/src/config/site.ts` 第 22–27 行）卖的是**一个 USD 29.90 的整包**，六个 skill 全含。

**两条路各自的代价：**

| | 六个独立上架（§1.3(a) 推荐） | 一个整包上架 |
| --- | --- | --- |
| 文案工作量 | 六套 §4.2 模板文案，六套标签，六次提交与审核 | 一套文案，一次审核 |
| 与官网的关系 | 价格阶梯（USD 19 / 15 / 15 / 9 / 9 / 9）官网完全没有体现，官网只有 USD 29.90 | 与官网价位口径接近，但仍需决定 Agensi 上写 USD 29.90 还是别的数 |
| 技术风险 | 无。每个 zip 都是标准单层 skill 结构 | §1.3(a) 的反对理由：Agensi 的销售单位是一个 skill 文件夹；打包成 bundle 会让 zip 内部变成二层嵌套结构，**安装失败率上升**。这与 §2 反复强调的"绝不要二层嵌套"直接冲突 |
| 产品逻辑 | §1.3(a)：教师需求不同（只要 PPT / 只要学习单），且 lesson-workflow 天然是入口商品，其余五个是 upsell | 买家拿到六个但只用一个，41KB 全套 README 的 upsell 作用失效 |

**两个渠道并不互斥**：Agensi 按单个 skill 卖、官网卖整包，在机制上完全可以并存。但**同时看到两边的买家会做算术**：Agensi 六个加起来是 USD 76（19+15+15+9+9+9），官网整包 USD 29.90。这个 3.8 倍的落差如果没有一句解释，会同时伤害两边 —— 在 Agensi 显得官网在倾销，在官网显得 Agensi 在宰客。

**建议**：采用 §1.3(a) 的六个独立上架（技术理由——避免二层嵌套导致安装失败——是硬的，不是偏好问题），但**必须同时把官网的 USD 29.90 重新定位成"六合一套装价"并在官网明写"单买请到 Agensi"**，让 USD 76 → USD 29.90 变成一个可解释的套装折扣，而不是一处矛盾。具体折扣叙述怎么写属于营销决策，不在 PUBLISHING.md 覆盖范围内。

**这是两个渠道任何一个上线之前必须先解决的事。** 一旦 Agensi 审核通过、listing 公开，价格就是公开可比的；那时再改官网价，等于在买家眼皮底下调价。

（原始分析到此为止。上方方框内的结论取代了这里的"建议"—— 两条路不必二选一，
bundle 是平台原生商品，六个独立上架是它的前提。表格中"一个整包上架"一列的技术风险
描述已被证伪，保留只为记录当时的判断依据。）

### 3.2 LICENSE 替换（已决定，尚未执行）

- **现状实测**：六个 zip 内的 `LICENSE` 均为 **1,069 B，MIT**。六个 `SKILL.md` 的 frontmatter `license:` 字段实测值全部是 **`MIT`** —— `audio-workflow`、`lesson-workflow`、`ppt-workflow`、`report-workflow`、`word-workflow`、`worksheet-workflow` 六个无一例外。
- **已决定的方向**：替换为与官网 `/legal/terms` 一致的专有许可，并同步六个 SKILL.md 的 `license:` 字段。
- **为什么要改**：官网 `src/content/legal/en/terms.md` 授予的是 perpetual, non-exclusive, non-transferable 使用许可，并明确禁止 resell / sublicense / rent / redistribute、禁止分享下载链接、禁止删改包内许可与署名声明。MIT 恰恰**允许**这一切 —— 买家拿到 MIT 文本后完全可以合法转售。两份文件目前互相打脸。
- **"完成"的样子**：新 LICENSE 文本写好 → 替换六份 → 六个 SKILL.md 的 `license:` 改成同一个新标识符 → 重跑 `python3 package.py` → §6 前两项重新勾选。
- **性质**：方向已定，剩纯执行。但新 LICENSE 的具体措辞需要与 `/legal/terms` 逐条对齐，别自己另写一套。`license:` 字段该填什么字符串（SPDX 标识符？自定义字符串？）属于 `未知（PUBLISHING.md 未涵盖）` —— PUBLISHING.md 完全没提 frontmatter 的 license 字段。能解决它的是：查 Agensi 对 SKILL.md frontmatter 的字段规范，或看已上架同类 skill 怎么填。

### 3.3 per-zip README（已决定，尚未执行）

- **现状实测**：六个 zip 内的 `README.md` 都是同一份 **41,106 B（41KB）** 全套说明，描述全部六个 skill。
- **已决定的方向**：改为每个 zip 配一份自己的 README。
- **§2.1 的相反意见（原文立场）**：这份全套 README 对只买了一个的买家起 **업셀 문서** 作用 —— 让他知道还有另外五个。§2.1 明确 "그대로 두는 것을 권장한다"，条件是在 listing 说明里注明"이 스킬은 6종 세트 중 하나"，买家就不会混淆。
- **反方（改成 per-zip 的理由）**：花 USD 9 买 audio-workflow 的人拿到 41KB 里 5/6 内容是他没买的东西，第一反应可能是"我是不是漏下载了"，而这正是 §5 所说"구매자 문의 1순위"之外最容易产生的第二类客服问题。文档体量也不成比例 —— audio-workflow.zip 解压后 README 是全部内容里最大的单个文件。
- **两边都成立**。折中方案（PUBLISHING.md 未涵盖，属于自行判断）：每个 zip 放一份精简的本 skill README，末尾附一节"나머지 5개 스킬" 保留 upsell 功能。这样 §2.1 的 upsell 目的和买家清晰度都能拿到。
- **性质**：方向已定，剩纯执行 + 六份文案。执行后同样要重跑 `package.py`。

---

## 4. 建议执行顺序

§1.3(b) 的建议贯穿全程：**첫 상장은 lesson-workflow 1개만 올려 심사 통과를 확인한 뒤 나머지 5개를 올린다.** 下面的顺序按这条组织 —— 第 6 步是一道闸门，没过就不要往下走。

| # | 步骤 | 依赖 | 粗略工作量 |
| --- | --- | --- | --- |
| 1 | ~~**拍板 §3.1 定价与上架形态**~~ **已完成（2026-09-19）**：六个独立上架（USD 19/15/15/9/9/9）+ 一个含全部六个的 Agensi 原生 bundle，定价 USD 29.90，与官网口径一致。官网只显示 bundle 价 | 无 | — |
| 2 | **写新 LICENSE**（对齐 `/legal/terms`），替换六份，同步六个 SKILL.md 的 `license:` 字段（现值均为 `MIT`）。顺带查清 `license:` 该填什么字符串 | 1（若定价影响许可措辞） | 2–3 小时 |
| 3 | **写 per-zip README**（建议保留末尾"나머지 5개" upsell 节） | 1 | 半天到一天，六份 |
| 4 | **重跑 `python3 package.py`**，确认六个 `[OK]`、无二层嵌套、无垃圾文件；勾掉 §6 前两项 | 2, 3 | 10 分钟 |
| 5 | **开 Agensi 账号 → `/sell` 转 Creator → 连 Stripe Connect**，四项法人信息复制粘贴自 `site.ts`，逐字符核对 | 无（可与 2–4 并行） | 1 小时 |
| 6 | **只提交 lesson-workflow 一个**：上传 zip、填 USD 19、贴 9 个标签、贴按 §4.2 写好的文案（依赖行写"단독 사용 가능"、含"실행 코드 없음"、含 `환불은 Agensi 플랫폼 환불 정책을 따릅니다.`、无天数） | 4, 5 | 文案 2–3 小时 + 提交 30 分钟 |
| 7 | **等审核**（§3：통상 24~48시간）。这一步什么都别做 | 6 | 1–2 天等待 |
| 8 | **审核通过后**，把剩下五个的文案写完并提交。五个**每一个**都必须含依赖行（§4.2：漏写会产生退款） | 7 通过 | 文案一天 + 提交 1–2 小时 |
| 9 | **审核不通过时**：拿到具体理由再改 —— 不要在没有理由的情况下批量猜测重做。改完只重交 lesson-workflow，回到第 7 步 | 7 未通过 | 视理由 |
| 9.5 | **建 bundle**：在 Agensi 把六个已通过审核的 skill 组成一个 bundle，组合价填 USD 29.90。单品合计与折扣标记由平台自动渲染，不必自己写 | 8 | 30 分钟 |
| 10 | **官网侧收尾**：官网 USD 29.90 已即为 bundle 价，无需改数字；仅需加"单买请到 Agensi"指向 `agensiListingUrl` | 9.5 | 1 小时 |
| 11 | **上架后常规**（§5）：准备好"链接 24 小时过期 → 대시보드에서 재발급 가능"的标准回复；错别字修订不要拖，版本更新对老买家是免费重新下载 | 8 | 持续 |

**为什么第 2、3 步排在提交之前**：`package.py` 每次重跑都会生成新 zip，审核通过后再换 LICENSE 就要走 §5 的 zip 替换流程，且老买家手上已经有一份 MIT 文本 —— MIT 是不可撤回的。这一项必须在第一次提交之前做完。

---

## 附：核查来源

| 结论 | 来源 |
| --- | --- |
| §0–§6 全部规则 | `/Users/mac/workspace/TeachFlowSkills/TeachFlow-KR/PUBLISHING.md` |
| 六个 zip 实测大小与文件数 | `ls -la` + `unzip -l` on `/Users/mac/workspace/TeachFlowSkills/TeachFlow-KR/dist/` |
| `license: MIT` ×6 | `head -20` on `/Users/mac/workspace/TeachFlowSkills/TeachFlow-KR/skills/*/SKILL.md` |
| LICENSE 1,069 B / README 41,106 B / SECURITY 6,149 B（六个 zip 内完全一致） | `unzip -l` |
| 纯 markdown 32 个文件 | `find skills -name "*.md" \| wc -l` |
| USD 29.90、CROSSXTOP 四项法人信息、Agensi 链接 | `/Users/mac/workspace/TeachFlowSkills/workspace/src/config/site.ts` |
| 官网许可条款与 MIT 冲突 | `/Users/mac/workspace/TeachFlowSkills/workspace/src/content/legal/en/terms.md` |
