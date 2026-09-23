/**
 * 站点唯一的常量源。
 *
 * 公司主体信息须与 Companies House 公开记录及提交给 Stripe 的资料逐字一致——
 * Stripe 人工复审会比对，不一致即驳回。
 */
import { localizePath, type Locale } from '@/i18n/config';

/**
 * 线上正式结账链接（Polar checkout link）。这不是机密：它会原样出现在
 * 每页的 HTML 里，所以直接作为默认值提交进仓库——构建、测试、校验三方
 * 因此永远读到同一个值，不会再有「构建带了链接、测试进程没读环境变量」
 * 的假红。`PUBLIC_BUY_CTA_URL` 只剩一个用途：**覆盖**，比如用 sandbox
 * 链接做支付演练，或显式设空串把全站打回「结账尚未开放」的兜底形态。
 */
export const POLAR_CHECKOUT_URL =
  'https://buy.polar.sh/polar_cl_sE7Dgs4mL2RhSttmxJ44TvRNIuTRnYDi2vylc18I4Kq';

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
   * 默认值是上面的 `POLAR_CHECKOUT_URL`（线上正式链接）；构建时可用
   * `PUBLIC_BUY_CTA_URL` 覆盖。显式设成空串时 `/buy` 渲染成
   * 「直接结账尚未开放」，把读者指向邮件这条已经能走通的路。
   */
  buyCtaUrl: import.meta.env.PUBLIC_BUY_CTA_URL ?? POLAR_CHECKOUT_URL,
} as const;

/**
 * 全站「购买」按钮的唯一去处：默认**直达 Polar 托管结账页**，不再经 /buy
 * 中转——买家少点一次，就少一次流失。只有显式把 `PUBLIC_BUY_CTA_URL`
 * 设成空串时才回落到 /buy，那一页自己渲染「结账尚未开放」的兜底。
 */
export function buyHref(lang: Locale): string {
  return SITE.buyCtaUrl !== '' ? SITE.buyCtaUrl : localizePath('/buy', lang);
}
