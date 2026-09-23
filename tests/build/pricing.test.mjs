import { describe, it, expect } from 'vitest';
import fg from 'fast-glob';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';

const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');
const PAGES = ['en/pricing/index.html', 'ko/pricing/index.html'];

describe('/pricing', () => {
  it('states the price with an explicit currency code', () => {
    for (const page of PAGES) {
      expect(read(page)).toContain('USD 29.90');
    }
  });

  it('lists all six skills so the product description is concrete', () => {
    for (const page of PAGES) {
      const html = read(page);
      for (const id of [
        'lesson-workflow',
        'ppt-workflow',
        'audio-workflow',
        'word-workflow',
        'worksheet-workflow',
        'report-workflow',
      ]) {
        expect(html, `${page} omits ${id}`).toContain(id);
      }
    }
  });

  it('gives a direct-purchase path with an email fallback', () => {
    for (const page of PAGES) {
      expect(read(page)).toContain('mailto:crossxtop@gmail.com');
    }
  });

  it('gives the single purchase card a checkout link and its own refund remedy', () => {
    // 购买路径只剩官网直售一条，市场卡已随该渠道下线移除。
    // 缺口背景：`/legal/delivery` 承诺发票路径"2 个工作日内发链接"，
    // `/legal/refund` 要求全额退款"14 天内且尚未下载"——最坏情况买家在等待中
    // 花掉 14 天里的 2 天。补救（回信可要求暂缓发链接）必须出现在买家做决定的
    // 地方，所以断言读的是**卡内**，不是整页：页面底部本来就有一组全页级政策
    // 链接，按整页扫会永真。
    for (const page of PAGES) {
      const lang = page.slice(0, 2);
      const root = parse(read(page));
      const cards = root.querySelectorAll('article');
      expect(cards.length, `${page} does not show exactly one purchase card`).toBe(1);
      const card = cards[0];

      expect(
        card.querySelector(`a[href="/${lang}/buy"]`),
        `${page}: the purchase card lost its checkout link`,
      ).not.toBeNull();
      expect(
        card.querySelector(`a[href="/${lang}/legal/refund"]`),
        `${page}: the purchase card offers no refund remedy`,
      ).not.toBeNull();
      expect(
        card.querySelector('a[href="mailto:crossxtop@gmail.com"]'),
        `${page}: the purchase card lost its invoice-by-email fallback`,
      ).not.toBeNull();
    }
  });

  it('links the refund and delivery policies from the pricing page', () => {
    expect(read('en/pricing/index.html')).toContain('/en/legal/refund');
    expect(read('en/pricing/index.html')).toContain('/en/legal/delivery');
    expect(read('ko/pricing/index.html')).toContain('/ko/legal/refund');
  });

  it('keeps the price coming from SITE.price.display (source guard)', () => {
    // 这一条是**源码结构**断言，不是行为断言——与 flow-hooks.test.mjs 的
    // `keeps the sample link wired into the card template (N2, source guard)`
    // 同一套理由与同一套诚实注释，写出来免得后来者误以为它在守行为。
    //
    // 它补的是一个实测漏网：把 `PriceBlock.astro` 里的 `{SITE.price.display}`
    // 换成硬编码 `USD 29.90`，**全套测试与部署闸门一条都不红**。上面那些断言
    // 以及 `scripts/verify-build.mjs` 全都只看产物字符串，而硬编码产出的字符串
    // 与 `SITE.price.display` 今天的值逐字节相同。于是"价格只有一个出口"这条
    // 约束事实上没有守卫：改了 `src/config/site.ts` 的人会以为全站跟着变，
    // 而 /pricing 上那个最显眼的数字纹丝不动。
    //
    // **它挡得住**：把这个插值换成任何字面量（硬编码价、拼接、另一个常量）。
    // **它挡不住**：`SITE.price.display` 自己被改错；模板里同时还存在第二处
    // 硬编码价格；插值被搬到别的文件。第一条由 `tests/unit/site.test.ts` 守，
    // 第二条由上面 `never writes the price with a bare dollar sign` 与
    // `states the price with an explicit currency code` 从产物侧守，
    // 第三条会让这里直接红（读不到那个插值）。
    //
    // 行为级的证明需要真渲染一次组件再比对渲染结果与 `SITE.price.display`。
    // 本沙箱做不到：Astro 的 `experimental_AstroContainer` 需要 Astro 自带的
    // Vite 6，而 vitest 2.1 解析到的是根上的 Vite 5，两者不兼容且禁止新增依赖。
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/PriceBlock.astro'),
      'utf8',
    );
    expect(src, 'PriceBlock no longer renders the price from SITE.price.display').toMatch(
      /\{SITE\.price\.display\}/,
    );
  });
});

describe('price notation across the whole build', () => {
  it('never writes the price with a bare dollar sign', async () => {
    const files = await fg('dist/**/*.html');
    const offenders = files.filter((file) =>
      /\$\s?19(\.9\d?)?\b/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
