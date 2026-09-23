/**
 * 站点唯一的常量源。
 *
 * 公司主体信息须与 Companies House 公开记录及提交给 Stripe 的资料逐字一致——
 * Stripe 人工复审会比对，不一致即驳回。
 */
export const SITE = {
  domain: 'https://tryteachflow.com',

  // 产品名的唯一出口。曾以字面量散落在十余个 `<title>` 里，改名时漏一处
  // 就是一页标题与全站不一致——那是支付服务商审核会看的地方。
  productName: 'TeachFlow',

  companyName: 'CROSSXTOP LTD',
  companyNumber: '16339041',
  registeredIn: 'England and Wales',
  address: 'Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ',

  supportEmail: 'crossxtop@gmail.com',
  supportResponseDays: 2,

  // 全站价格的唯一出口。写作 "USD 29.90"，不写 "$29.9"。
  //
  // 这个数是**六合一套装价**：六个 skill 只在官网成套出售，不单卖——
  // 所以官网出现的价格永远只有这一个数，不列单品阶梯。
  price: {
    currency: 'USD',
    amount: '29.90',
    display: 'USD 29.90',
  },

  /**
   * Polar 托管结账页。站内不出现任何支付表单——PCI 面与支付页审核
   * 因此完全消失——所以购买动作在站点侧的全部实现就是这一个链接。
   *
   * 构建时从 `PUBLIC_BUY_CTA_URL` 取，没设就是空串：商品还没在 Polar
   * 建起来之前链过去只会落到一个不存在的结账页，而一条死的结账链接
   * 比没有结账链接坏得多。空串时 `/buy` 渲染成「直接结账尚未开放」，
   * 把读者指向邮件这条已经能走通的路。
   */
  buyCtaUrl: import.meta.env.PUBLIC_BUY_CTA_URL ?? '',
} as const;
