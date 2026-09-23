import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';
import { SITE } from '@/config/site';

const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');

/**
 * 两个语言版本都要查。
 *
 * 原先除第一条外全都只读 `en/index.html`，于是三个变异在 131/131 全绿下存活：
 * 退款链接写死 `'en'`（韩语用户被送去英文退款政策）、`lang === 'ko'` 时整段
 * 购买区块不渲染（韩语页没有价格、没有退款链接、没有客服邮箱）、韩语页零张
 * SkillCard 零个 PriceBlock。韩语页是韩国教师唯一会看的那一版，也是
 * 支付服务商审核会看的那一版——它不能靠"英文版过了"来间接保证。
 */
const LOCALES = [
  { lang: 'en', page: 'en/index.html' },
  { lang: 'ko', page: 'ko/index.html' },
];

const SKILL_IDS = [
  'lesson-workflow',
  'ppt-workflow',
  'audio-workflow',
  'word-workflow',
  'worksheet-workflow',
  'report-workflow',
];

describe('home page', () => {
  it('leads with the product, not with a coming-soon notice', () => {
    for (const { page } of LOCALES) {
      const html = read(page);
      expect(html).not.toMatch(/coming soon/i);
      expect(html).not.toMatch(/under construction/i);
    }
  });

  it('shows a card for all six skills, in both locales', () => {
    // 断言 SkillCard 的 `data-skill`，不是裸 id：挂上 FlowDiagram 后图里自带
    // 六个 `data-flow-node="<id>"`，用 toContain(id) 的话六张卡一张不渲染也能绿。
    for (const { page } of LOCALES) {
      const html = read(page);
      for (const id of SKILL_IDS) {
        expect(html, `${page} omits the ${id} card`).toContain(
          `data-skill="${id}"`,
        );
      }
    }
  });

  it('reaches checkout, refund policy and support within one click, in the reader’s own language', () => {
    // 必须限定在 <main> 内。全页查的话 SiteHeader 与页脚在每一页都给出这三个
    // 链接，连当前这个只有一个 <h1> 的占位首页都能通过——那是在测 BaseLayout。
    //
    // 购买按钮直达结账：配了 PUBLIC_BUY_CTA_URL 时是 Polar 链接，否则回落
    // /buy（两种形态都可能出现在产物里，断言跟着 SITE 分叉）。退款与客服链接
    // 的前缀必须跟着 lang 走：写死 `/en/...` 的话韩语读者点退款政策会跳到
    // 英文页，而这正是"合规页必须可读"这条要求最容易破的方式。
    for (const { lang, page } of LOCALES) {
      const main = parse(read(page)).querySelector('main');
      expect(main, `no <main> on ${page}`).not.toBeNull();
      const hrefs = main.querySelectorAll('a').map((a) => a.getAttribute('href'));
      expect(hrefs.some((h) => h === `/${lang}/buy` || (SITE.buyCtaUrl !== '' && h === SITE.buyCtaUrl)),
        `${page} buries the buy action`,
      ).toBe(true);
      expect(hrefs, `${page} buries the refund policy`).toContain(
        `/${lang}/legal/refund`,
      );
      expect(hrefs, `${page} offers no support address`).toContain(
        'mailto:crossxtop@gmail.com',
      );
    }
  });

  it('states the price on the home page itself, in both locales', () => {
    for (const { page } of LOCALES) {
      expect(read(page), `${page} never names the price`).toContain('USD 29.90');
    }
  });
});
