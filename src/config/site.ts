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
 *
 * 运行时这份值镜像在 `shop-api/src/config.ts` 的 `DEFAULT_CHECKOUT_URL`
 * （/api/checkout/start 的 302 目标）——换 checkout link 时两处一起改，
 * 没有测试守这层同步。
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
 * 购买按钮的来源标注：随中转 URL 传给 shop-api，记进漏斗事件 checkout_click
 * 的 src 字段。shop-api 侧只认这份清单加 'other'——新增按钮位置时同步登记。
 */
export const BUY_SOURCES = ['header', 'hero', 'home-bottom', 'cta', 'buy-page'] as const;
export type BuySource = (typeof BUY_SOURCES)[number];

/**
 * 全站「购买」按钮的唯一去处。三种形态：
 *  - 默认（未覆盖）：站内一跳 `/api/checkout/start`——shop-api 记下
 *    checkout_click（漏斗第②步）后 302 去 Polar 结账页。买家多付的只是
 *    同域一次几十毫秒的重定向，换来的是站内第一次「看得见」购买意图，
 *    以及结账链接进运行时配置（换 sandbox 链接不再需要重新构建站点）；
 *  - `PUBLIC_BUY_CTA_URL` 显式设为第三方 URL（支付演练）：直链该 URL，
 *    绕过中转——演练流量不该混进生产漏斗；
 *  - 显式设空串：回落 /buy 兜底页（「结账尚未开放」）。
 */
export function buyHref(lang: Locale, src: BuySource = 'other'): string {
  if (SITE.buyCtaUrl === '') return localizePath('/buy', lang);
  if (SITE.buyCtaUrl !== POLAR_CHECKOUT_URL) return SITE.buyCtaUrl;
  return `/api/checkout/start?src=${src}&lang=${lang}`;
}
