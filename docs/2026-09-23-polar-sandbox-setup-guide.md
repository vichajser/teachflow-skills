# Polar Sandbox 配置教程（全链路测试用）

**日期** 2026-09-23 · **配套** `2026-09-20-manual-setup-runbook.md` §1.3 / §2 / §3
**目的** 在 sandbox.polar.sh 建出一套与正式环境完全同构的商品 + checkout link + webhook，供全链路测试（手册 §9 第 1–5 条）

> ⚠️ **sandbox 与正式环境是两套独立账户，所有 ID、链接、密钥都不通用。** 本教程产出的每一个值都要标注 "sandbox" 存进密码管理器，与正式环境条目分开。

---

## 0. 材料清单（开始前全部备在手边）

| # | 材料 | 位置 / 取值 |
|---|---|---|
| 1 | 产品主图（横版） | `workspace/teachflow-bundle-cover-16x9.png`（1920×1088） |
| 2 | 产品主图（方形） | `workspace/teachflow-bundle-cover.png`（1088×1088） |
| 3 | 商品描述 | 本文档 §2.3，直接复制 |
| 4 | Checkout Description | 本文档 §3.2，直接复制 |
| 5 | webhook secret | 本文档 §4.1，现场用命令生成 |
| 6 | 密码管理器打开 | 全程产出即存 |
| 7 | 测试邮箱 | 一个你能收信的邮箱（假结账用，建议 Gmail） |

---

## 1. 注册 sandbox 账户 + 建组织

1. 打开 <https://sandbox.polar.sh>（注意域名，**不是** polar.sh）
2. 用**同一个 GitHub/Google 账号**注册——与正式环境同账号便于切换，但两套数据完全独立
3. 创建组织：
   - **Organization Name**：`TeachFlow (CROSSXTOP LTD)`（与正式环境保持一致）
   - **Slug**：建议与正式环境相同（如 `teachflow-crossx`，被占用就加 `-sandbox`，反正只用于测试）
4. 组织 Settings 里填：
   - **Website**：`https://tryteachflow.com`
   - **Support Email**：`crossxtop@gmail.com`
5. **不需要连 payout account、不需要 KYB**——sandbox 没有真钱，也就没有审核

---

## 2. 建商品

**Products → New Product**，按下表填：

| 字段 | 值 |
|---|---|
| Name | `TeachFlow — 6-skill bundle` |
| Pricing type | **One-time payment**（一次性付款，固定价） |
| Price | `29.90` USD |
| Description | 见 §2.3 |
| Product images | 上传材料 1（横版）+ 材料 2（方形） |

### 2.1 两条红线（手册 §2.2，sandbox 里也照守，养成肌肉记忆）

- ❌ **不要选任何订阅 / 周期性定价**
- ❌ **不要挂任何 Benefit**（File Download、License Key 等一律不挂）——交付只走 shop-api

### 2.2 Metadata（键值对，逐对添加）

| Key | Value |
|---|---|
| `product_kind` | `skill_bundle` |
| `bundle_skill_ids` | `lesson-workflow,ppt-workflow,audio-workflow,word-workflow,worksheet-workflow,report-workflow` |
| `delivery_channel` | `shop-api` |
| `content_version` | `v1.0.0` |

> ✅ `bundle_skill_ids` 已与 `shop-api/src/config.ts` 的 `DEFAULT_BUNDLE_SKILL_IDS` 逐字核对（2026-09-23），直接照抄即可。

### 2.3 商品 Description（直接复制）

```
The complete TeachFlow 6-skill bundle — six separate ZIP files, one per skill:

- Lesson framework generator
- Full lesson plan builder
- Tiered worksheet creator
- Listening audio material maker
- Vocabulary sheet builder
- Parent report designer

Plain-text files only. No executables, no installers, no binaries — open and edit them in any compatible tool.

Delivery: download links are emailed within minutes of payment. Links stay valid for 30 days and can be resent anytime. Free re-downloads of all future version updates.

One-time purchase. No subscription, no auto-renewal.
Refund policy: https://tryteachflow.com/en/legal/refund
```

建好后**记录 Product ID**（页面 URL 或详情里有）→ 密码管理器，标注 `POLAR_SANDBOX_PRODUCT_ID`。

---

## 3. 建 Checkout Link

**Checkout Links → New Link**：

| 字段 | 值 |
|---|---|
| Label | `site-buy-cta-sandbox` |
| Products | 只勾 `TeachFlow — 6-skill bundle` 一个 |
| Success URL | `https://tryteachflow.com/en/buy/success?checkout_id={CHECKOUT_ID}` |
| Return URL | `https://tryteachflow.com/en/pricing` |
| Preset discount | 不选 |
| Allow discount codes | 关闭 |
| Require billing address | 关闭（只需国家） |
| Metadata | `source` = `site_buy_cta` |

### 3.1 说明

- Success URL 指向的页面**现在不存在**（手册 §2.4 记录的缺口：`buy.astro` 未实现），属已知项，测试期先容忍跳转 404
- Return URL 指向已存在的 `/en/pricing`，保证结账页返回按钮可用

### 3.2 Checkout Description（如 link 层面有描述字段，填这段）

```
## What you get

The complete **TeachFlow 6-skill bundle** — six separate ZIP files, one per skill. Plain-text files only: no executables, no installers.

## How you receive it

- Download links are **emailed to you within minutes** of payment
- Links valid for **30 days**, self-serve resend anytime
- **Free re-downloads of all future version updates**

## Good to know

- **One-time purchase.** No subscription, no auto-renewal.
- Refund policy: https://tryteachflow.com/en/legal/refund
- Questions? crossxtop@gmail.com
```

建好后**复制 checkout link URL**（形如 `https://sandbox.polar.sh/...` 或 `buy.polars.sh/...`）→ 密码管理器，标注 `POLAR_SANDBOX_CHECKOUT_LINK`。**绝不要与正式链接混存。**

---

## 4. 建 Webhook 端点

### 4.1 关于 secret：Polar 生成，不是自设

**2026-09-23 实测订正**：新版界面创建端点时**没有 Secret 输入框**。正确流程是：

1. 先创建端点（只填 URL / Format / Events）
2. 创建后点进端点详情页，找到 **Signing secret**（`whsec_` 开头，**只显示一次**）立刻复制
3. 存入密码管理器，标注 `POLAR_SANDBOX_WEBHOOK_SECRET`
4. 错过了就用详情页的 **Rotate secret** 重新生成一个（旧值立即失效）

**验签实现注意**：Polar 生成的 secret 带 `whsec_` 前缀（Standard Webhooks 规范）。验签时**先剥掉 `whsec_` 前缀，再对剩余部分做 base64 解码**，解码后的字节作为 HMAC-SHA256 的密钥。shop-api 的验签代码按此实现（2026-09-23 实测确认）。

> 手册 §3.1 的"自设 secret"是旧版行为，作废。此前预生成的 `CX4M7r00…` 值不再使用。

### 4.2 创建端点

**Settings → Webhooks → Add Endpoint**：

| 字段 | 值 |
|---|---|
| URL | `https://tryteachflow.com/api/webhooks/polar` |
| Format | **Raw**（不要 Discord/Slack 格式） |
| Secret | 上一步生成的值 |
| Events | 勾选 `order.paid`、`order.refunded`、`order.updated`，以及列表里一切 dispute / chargeback 相关事件 |

> ⚠️ 此时 shop-api 还没部署，Polar 会显示端点投递失败——**正常现象**，等 B 线（服务器部署）完成后自动恢复。

### 4.3 验签实现提醒（给开发侧，手册 §3.3 的三个坑）

1. secret 先 base64 解码再做 HMAC-SHA256
2. 必须用**原始 body** 验签，不能 JSON 往返
3. 签名基串 `{webhook-id}.{webhook-timestamp}.{raw body}`，结果 base64

---

## 5. 产出物登记（建完逐项存入密码管理器）

| 条目名 | 内容 | 状态 |
|---|---|---|
| `POLAR_SANDBOX_ORG` | 组织 slug | ☐ |
| `POLAR_SANDBOX_PRODUCT_ID` | 商品 ID | ☐ |
| `POLAR_SANDBOX_CHECKOUT_LINK` | checkout link URL | ☐ |
| `POLAR_SANDBOX_WEBHOOK_SECRET` | openssl 生成的 secret | ☐ |

正式环境对应条目等上线当天另建，命名去掉 `SANDBOX`，**两套绝不写进同一个条目**。

## 6. 验收（本教程完成后应全部勾上）

- [ ] sandbox 组织已建，Website / Support Email 已填
- [ ] 商品已建：一次性付款、USD 29.90、无订阅、无 Benefit、Metadata 四对齐全
- [ ] checkout link 已建，Label = `site-buy-cta-sandbox`，Success URL 含 `{CHECKOUT_ID}`
- [ ] webhook 端点已建：Raw 格式、secret 已入密码管理器、事件四选齐全
- [ ] 四项产出已全部入密码管理器并标注 sandbox

## 7. 下一步（依赖 B 线）

shop-api 部署上线（`curl https://tryteachflow.com/api/health` 返回 `{"ok":true}`）后，按手册 §9 跑：

1. sandbox 下一单（Stripe 测试卡 `4242 4242 4242 4242`）→ 收交付邮件
2. 下载 zip → 含 `LICENSE-HOLDER.txt`，邮箱与订单号正确
3. Polar 后台重放同一事件 → 不产生重复订单/邮件
4. 后台退款 → 下载立即 403
5. 发新版本 → 老 token 直接取到新版本
