import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SITE } from '@/config/site';

const dist = (p) => resolve(process.cwd(), 'dist', p);

describe('build output', () => {
  it('emits an English home page', () => {
    expect(existsSync(dist('en/index.html'))).toBe(true);
  });

  it('emits a Korean home page', () => {
    expect(existsSync(dist('ko/index.html'))).toBe(true);
  });

  it('sets the html lang attribute per locale', () => {
    expect(readFileSync(dist('en/index.html'), 'utf8')).toContain('lang="en"');
    expect(readFileSync(dist('ko/index.html'), 'utf8')).toContain('lang="ko"');
  });

  // Astro 的 inlineStylesheets 默认是 'auto'：小于 4KB 内联，否则外链。
  // 我们的 CSS 正好在阈值附近，所以断言"编译后的主题到达了浏览器"，
  // 而不是断言 Astro 选了哪种机制——后者是实现细节，前者才是要求。
  it('delivers the compiled Tailwind theme to the page', () => {
    const html = readFileSync(dist('en/index.html'), 'utf8');
    const href = html.match(/<link[^>]+rel=["'][^"']*stylesheet[^"']*["'][^>]*href=["']([^"']+)["']/i)
      ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*stylesheet[^"']*["']/i);

    // 外链就读那个文件；否则只取 <style> 的内容——不是整份 HTML，
    // 否则标记里一个 `.text-text-hi` 字样就能让零 CSS 的构建通过。
    const css = href
      ? readFileSync(dist(href[1].replace(/^\//, '')), 'utf8')
      : [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');

    // .text-text-hi 只有在扫描器读到 index.astro 且 @theme 定义了
    // --color-text-hi 时才会生成，所以它同时覆盖"插件没接上"与"@theme 丢了"。
    expect(css, 'compiled Tailwind theme reached neither a stylesheet nor the inline <style>').toContain(
      '.text-text-hi',
    );
  });
});

// R-7：robots.txt 曾是硬编码占位域名的第三处静态文件。现在它是读取
// SITE.domain 的路由，必须仍落在 dist/robots.txt。
// 断言完整正文（而非"含 Sitemap 字样"）：少了尾换行、多一行 Disallow
// 之类的回归都会被抓到。这是构建产物的检查，故归 tests/build/。
// 域名的"只此两处"纪律另由 tests/unit/site.test.ts 在源码层面无需构建地钉死。
describe('robots.txt', () => {
  it('lands at dist/robots.txt with the exact body, domain taken from SITE', () => {
    const txt = readFileSync(dist('robots.txt'), 'utf8');
    expect(txt).toBe(
      `User-agent: *\nAllow: /\n\nSitemap: ${SITE.domain}/sitemap-index.xml\n`,
    );
  });

  it('stays publicly crawlable — no Disallow, no noindex', () => {
    const txt = readFileSync(dist('robots.txt'), 'utf8');
    expect(txt).not.toMatch(/disallow/i);
    expect(txt).not.toMatch(/noindex/i);
  });
});
