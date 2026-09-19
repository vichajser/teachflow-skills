import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
    const link = html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/i);

    const css = link
      ? readFileSync(dist(link[0].match(/href=["']([^"']+)["']/i)[1].replace(/^\//, '')), 'utf8')
      : html;

    // .text-text-hi 只有在扫描器读到 index.astro 且 @theme 定义了
    // --color-text-hi 时才会生成，所以它同时覆盖"插件没接上"与"@theme 丢了"。
    expect(css, 'compiled Tailwind theme reached neither a stylesheet nor the inline <style>').toContain(
      '.text-text-hi',
    );
  });
});
