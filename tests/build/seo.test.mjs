import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';
import { SITE } from '@/config/site';

// 域名从 SITE 读，不写死：一个把被守卫的值硬编码进去的测试，
// 在换域名的当天会因为错误的原因失败，而不是在域名写错时失败。
const DOMAIN = SITE.domain;
const read = (p) => parse(readFileSync(resolve(process.cwd(), 'dist', p), 'utf8'));

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

  it('never ships a noindex directive', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      const robots = read(page).querySelector('meta[name="robots"]');
      expect(robots?.getAttribute('content') ?? '').not.toContain('noindex');
    }
  });

  it('gives each page a non-empty description', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      const desc = read(page).querySelector('meta[name="description"]');
      expect((desc?.getAttribute('content') ?? '').length).toBeGreaterThan(0);
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
