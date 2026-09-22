# Wise Business 开户教程（CROSSXTOP LTD · 非英国居民董事）

**日期** 2026-09-22 · **配套** `2026-09-20-manual-setup-runbook.md` §1.4「银行账户」警告的落地执行
**目的** 为 CROSSXTOP LTD 开通带 GBP sort code + account number 的商业账户，作为 Polar → Stripe Connect 的 payout 收款账户

> Wise 的界面文案可能随版本微调，本教程以 2026-09 的流程为准。核心原则不变：**所有公司信息逐字照抄注册证书，所有个人信息逐字照抄护照**。

---

## 0. 开始前备齐的六样东西

| # | 材料 | 具体要求 |
|---|---|---|
| 1 | 护照 | 有效期 6 个月以上；拍照/扫描需四角完整、无反光、文字清晰 |
| 2 | 住址证明 | 3 个月内的中国住址证明：水电煤账单、银行对账单或信用卡账单（含姓名+地址+日期）。非英文的建议同时准备翻译件 |
| 3 | 公司注册证书 | `公司信息/` 目录下可抽文本的 PDF（Certificate of Incorporation） |
| 4 | 公司注册号 | `16339041` |
| 5 | 手机号 | 能收短信的本人手机号（+86 可以） |
| 6 | 邮箱 | **建议与 Stripe Connect 用同一个**（`vichajser@gmail.com`），少一处信息分裂，Wise 的补件通知也必须有人看 |

另外两件「非材料」的准备：

- **关掉 VPN 或固定用一个干净节点。** 申请全程的 IP 属地要稳定且与你的居住国一致，乱跳 IP 是触发人工复核的经典原因。
- **确认 tryteachflow.com 可以打开。** Wise 会看网站判断业务真实性，哪怕页面简单也要有真实内容。

---

## 1. 注册与选择账户类型

1. 打开 <https://wise.com> → 点 **Register** / **Open an account**。
2. 账户类型选 **Business**（不是 Personal）。
   > ⚠️ 如果你已有 Wise 个人账户，登录后在账户切换器里选 **"Add a business account"**。**绝不能用个人账户收货款**——户名是个人，和 Stripe 要求的 `CROSSXTOP LTD` 对不上。
3. 填邮箱、设密码、选国家。国家这里填的是**业务运营地/你的居住地**（China），如实填。

## 2. 填写公司信息

| 字段 | 填什么 | 注意 |
|---|---|---|
| Business type / Legal structure | **Private limited company (LTD)** | |
| Country of registration | **United Kingdom** | |
| Company registration number | `16339041` | 填完 Wise 会自动从 Companies House 拉取公司信息 |
| Registered business name | `CROSSXTOP LTD` | **从注册证书复制粘贴**，全大写、含 LTD、无句点。Wise 拉到的 Companies House 记录应与之一致，不一致先停下排查 |
| Registered address | `Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ` | 与 Companies House 记录一致即可，Wise 知道这是注册代理地址，不影响 |
| Trading name（如有） | `TeachFlow` | 选填；填了有助于让对方理解你的品牌 |

**「公司成立时间很短」不是问题**（2025-03-24 成立），但可能触发人工复核，属于正常流程，不是拒绝信号。

## 3. 填写业务信息（最关键的一页，决定风险评级）

| 字段 | 填什么 |
|---|---|
| Industry / Business category | **Software / Digital products** 或 **Education / E-learning**（以实际选项为准，选最贴近的） |
| Website | `https://tryteachflow.com` |
| What does your business do | 见下方模板 |
| Expected monthly volume | 如实填，初期建议选最低档（如 < £5,000/月）。吹大了反而触发更多审查 |
| Where are your customers | Worldwide / Online（如实：全球线上买家） |
| Source of funds | Sales revenue from digital product sales |

**业务描述模板（可直接用）：**

> CROSSXTOP LTD sells digital educational products under the TeachFlow brand. Our product is a bundle of six text-based teaching skills (lesson planning, worksheets, vocabulary sheets, etc.) for English teachers, sold as downloadable ZIP files through our website tryteachflow.com. Customers pay online via our payment partner (Polar, acting as merchant of record), and we receive payouts from sales revenue. There is no physical goods, no subscription, and no third-party funds involved.

**三条红线别踩：**

1. **不要出现** crypto、trading、gambling、adult、money transfer 等高风险词。
2. **不要写得太模糊**（如 "IT services"、"consulting"）——模糊描述是拒绝的首要原因。
3. 描述必须和网站内容**互相印证**。审核员真的会打开你的网站。

## 4. 填写董事 / 实控人信息

| 字段 | 填什么 |
|---|---|
| Role | Director（且你是 100% 股东的话同时是 beneficial owner / PSC） |
| Full legal name | **护照上的姓名，逐字**（姓和名顺序按护照机读区） |
| Date of birth | 护照一致 |
| Nationality | China |
| Residential address | **你的真实中国居住地址**（不是公司地址），与第 0 节住址证明上的地址一致 |
| Ownership % | 如实（100% 则 100%） |

> 若 Companies House 上还有其他董事或持股 ≥25% 的 PSC，每个人都要走一遍身份验证。单人公司只有你自己。

## 5. 身份验证

1. 选择证件类型 **Passport**。
2. 拍摄护照照片页：四角完整入镜、无反光、无手指遮挡。光线不足是重拍的第一原因。
3. **活体自拍**（live selfie / 短视频）：在光线均匀处按提示完成，摘掉眼镜更稳。
4. 上传**住址证明**（第 0 节第 2 项）。日期必须在 3 个月内，姓名地址与第 4 节填写的一致。

## 6. 支付开户费并等待审核

1. 一次性开户费约 **£45**（无月费），按页面指引支付（支持银行卡）。
2. 之后进入审核：**几小时到 2–3 个工作日**是常态；触发人工复核可能到 5–7 天。
3. **每天看邮箱（含垃圾邮件）**。Wise 补件只通过邮件通知，超过时限不回复申请会被关闭。

## 7. 批准后：取 GBP 账户详情

1. 登录 Wise → 你的 **Business 账户** → Balances → 添加/激活 **GBP balance**。
2. 点 GBP 余额 → **Account details**，你会看到：
   - **Account holder**：CROSSXTOP LTD（以页面实际显示为准——这个名字就是 Stripe 要逐字匹配的那个）
   - **Sort code**：6 位（xx-xx-xx）
   - **Account number**：8 位
   - IBAN（GB 开头，备用）
3. **截图 + 抄进密码管理器**（条目名建议 `Wise Business GBP - CROSSXTOP LTD`）。

## 8. 回填 Stripe Connect（衔接手册 §1.5）

回 Polar 后台 → Finance / Payout Accounts → 重新进入 Connect 流程（之前停下的进度可续）：

| Stripe 字段 | 填什么 |
|---|---|
| Currency | **GBP - British Pound** |
| Account holder name | **Wise GBP 详情页显示的户名，逐字** |
| Sort code | Wise 给的 6 位 |
| Account number / Confirm | Wise 给的 8 位，两遍一致 |

提交后 Polar 侧状态变 pending review，KYB 1–2 周计时开始。

## 9. 如果被拒绝

1. **读拒绝邮件里的原因**——Wise 通常会给类别（证件不清 / 业务描述不符 / 高风险国家或行业）。
2. 能修的（重拍证件、补地址证明、改写业务描述）修完**走申诉/重新提交**，不要无脑重开申请。
3. 修不了的，转备选：**WorldFirst Business** 或 **Airwallex**（同样接受非居民董事、给英国账户详情）。
4. 被拒记录不影响你换一家申请，不要因此填虚假信息——跨机构的信息矛盾才是真正的死穴。

## 10. 验收

- [ ] Wise Business 账户批准，主体为 CROSSXTOP LTD
- [ ] GBP balance 已激活，sort code + account number 已截图并存入密码管理器
- [ ] GBP 详情页 Account holder 显示为公司名（逐字记录）
- [ ] Stripe Connect 银行账户页已用这组信息提交
- [ ] Polar 侧 payout 状态 = pending review，提交日期已记日历（两周后没动静去催）
- [ ] Wise 邮箱通知已确认会进收件箱（补件不超时）

## 11. 日常纪律（账户活下来之后）

- **不要囤大额余额**：Wise 是 EMI（电子货币机构），资金走 FCA safeguard 而非 £85,000 FSCS 存款保险。收款→定期转走，保持低余额。
- 每笔 Polar payout 到账后留记录（日期、金额、GBP 换算），报税要用。
- 公司信息变更（地址、董事）先改 Companies House，再同步 Wise，最后同步 Stripe——顺序反了会触发三方信息不一致。
