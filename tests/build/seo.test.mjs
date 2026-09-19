import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { parse } from 'node-html-parser';
import { SITE } from '@/config/site';

// 域名从 SITE 读，不写死：一个把被守卫的值硬编码进去的测试，
// 在换域名的当天会因为错误的原因失败，而不是在域名写错时失败。
const DOMAIN = SITE.domain;
const read = (p) => parse(readFileSync(resolve(process.cwd(), 'dist', p), 'utf8'));

/**
 * dist 下每一个 index.html，相对 dist 的 posix 路径。
 *
 * 下面两条守的是硬性合规要求（Stripe 与 Agensi 都要求站点不得被 noindex；
 * description 是 SEO 的基本盘），而构建产物是 26 页。原先它们只读两张首页，
 * 任何子页面被加上 noindex 都无人察觉。枚举全量之后，404.html 不是
 * index.html，自然落在枚举之外——它同样不该 noindex，但没有目录索引形态。
 *
 * 页面顺序排序，只用 fast-glob（已声明依赖），不引 fs.globSync（要 Node 22，
 * 而 package.json 的下限是 20.3.0）。
 */
const allPages = async () =>
  (
    await fg('dist/**/index.html')
  ).map((p) => p.replace(/^dist\//, '')).sort();

/**
 * `dist/index.html` 是根路径的 meta-refresh 跳转壳（`src/pages/index.astro`），
 * 不是内容页：它只有 refresh + canonical→/en + title + 一个 <a>，刻意保持最小。
 * 它没有 description 是设计使然，不是遗漏——所以 description 那条要把它排除，
 * noindex 那条**不排除**（跳转壳同样不该 noindex，而它本来也没有）。
 */
const REDIRECT_SHELL = 'index.html';

describe('SEO head', () => {
  it('points canonical at the page it sits on', () => {
    const en = read('en/index.html');
    expect(en.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${DOMAIN}/en`,
    );
    const ko = read('ko/index.html');
    expect(ko.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${DOMAIN}/ko`,
    );
  });

  it('cross-links both locales plus x-default on every page', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      const root = read(page);
      const alternates = root
        .querySelectorAll('link[rel="alternate"]')
        .map((el) => [el.getAttribute('hreflang'), el.getAttribute('href')]);
      expect(alternates).toEqual([
        ['en', `${DOMAIN}/en`],
        ['ko', `${DOMAIN}/ko`],
        ['x-default', `${DOMAIN}/en`],
      ]);
    }
  });

  it('never ships a noindex directive', async () => {
    const pages = await allPages();
    expect(pages.length, 'dist looks empty — did the build run?').toBeGreaterThan(10);
    for (const page of pages) {
      const robots = read(page).querySelector('meta[name="robots"]');
      expect(robots?.getAttribute('content') ?? '', `${page} ships noindex`).not.toContain(
        'noindex',
      );
    }
  });

  it('gives every content page a non-empty description', async () => {
    const pages = (await allPages()).filter((p) => p !== REDIRECT_SHELL);
    expect(pages.length, 'dist looks empty — did the build run?').toBeGreaterThan(10);
    for (const page of pages) {
      const desc = read(page).querySelector('meta[name="description"]');
      expect((desc?.getAttribute('content') ?? '').length, `${page} has no description`)
        .toBeGreaterThan(0);
    }
  });
});

describe('sitemap', () => {
  const locs = () =>
    [
      ...readFileSync(resolve(process.cwd(), 'dist/sitemap-0.xml'), 'utf8').matchAll(
        /<loc>([^<]*)<\/loc>/g,
      ),
    ].map((m) => m[1]);

  it('lists the real pages', () => {
    const urls = locs();
    expect(urls).toContain(`${DOMAIN}/en/pricing/`);
    expect(urls).toContain(`${DOMAIN}/ko/pricing/`);
  });

  it('omits every error page, in both locales', () => {
    // `@astrojs/sitemap` 的 `isStatusCodePage()` 从 `opts.i18n.locales` 推导
    // 排除名单（node_modules/@astrojs/sitemap/dist/index.js:14-27）。本项目
    // 刻意不启用 Astro 的 i18n 配置块（语言路由由 `[lang]/` 显式生成），
    // 于是那份名单塌成裸 `{"404","500"}`：根 `/404` 被排除，`/en/404`、
    // `/ko/404` 全部照收。提交 dc27028 的构建实测收录了两条。
    //
    // 后果不是构建错误而是 SEO 脏数据：向搜索引擎提交自己的 404 页。
    // 这一条守的是 `astro.config.mjs` 里那个 filter——删掉 filter 本用例即红。
    for (const url of locs()) {
      expect(url, `sitemap lists an error page: ${url}`).not.toMatch(
        /\/(404|500)\/?$/,
      );
    }
  });
});
