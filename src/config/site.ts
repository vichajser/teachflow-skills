/**
 * 站点唯一的常量源。
 *
 * 公司主体信息须与 Companies House 公开记录及提交给 Stripe 的资料逐字一致——
 * Stripe 人工复审会比对，不一致即驳回。
 */
export const SITE = {
  domain: 'https://tryteachflow.com',

  // 产品名的唯一出口。曾以字面量散落在十余个 `<title>` 里，改名时漏一处
  // 就是一页标题与全站不一致——那是 Stripe 与 Agensi 审核会看的地方。
  productName: 'TeachFlow',

  companyName: 'CROSSXTOP LTD',
  companyNumber: '16339041',
  registeredIn: 'England and Wales',
  address: 'Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ',

  supportEmail: 'vichajser@gmail.com',
  supportResponseDays: 2,

  // 全站价格的唯一出口。写作 "USD 19.90"，不写 "$19.9"。
  price: {
    currency: 'USD',
    amount: '19.90',
    display: 'USD 19.90',
  },

  agensiListingUrl: 'https://www.agensi.io',
  // 只链接，不复述其退款天数：Agensi 自家 /terms 与 /stripe-terms 互相矛盾。
  agensiTermsUrl: 'https://www.agensi.io/terms',
} as const;
