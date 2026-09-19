import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { parse } from 'node-html-parser';

// spec §4.5 pins the whole site's motion budget at four items. This file guards
// the two that ship here plus the quiet-zone rule; the counter (item 4) is not
// built yet, and the diagram animation is guarded by no-js.test.mjs.

const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');

const COMPLIANCE = [
  'dist/*/pricing/index.html',
  'dist/*/legal/**/index.html',
];

describe('motion budget', () => {
  it('runs no animation on the compliance pages', async () => {
    const files = await fg(COMPLIANCE);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const html = readFileSync(resolve(file), 'utf8');
      expect(html, `${file} should be quiet`).toContain('data-quiet');
    }
  });

  it('fans out six leaves on each home page', async () => {
    // 断言渲染出的 DOM 元素个数，不是 CSS bundle 里的选择器次数：Astro 会把
    // 小于阈值的组件 `<style>` 内联进页面的 `<style>`，大于阈值才抽进 bundle。
    // 数 DOM 元素对两种产物形态都成立，删掉扇形或改小 SKILLS 都会变红。
    for (const file of ['dist/en/index.html', 'dist/ko/index.html']) {
      const root = parse(readFileSync(resolve(file), 'utf8'));
      const leaves = root.querySelectorAll('.hero-fan__leaf');
      expect(leaves, `${file} fans out ${leaves.length} leaves, expected 6`).toHaveLength(6);
    }
  });

  it('keeps the fan off the compliance pages', async () => {
    const files = await fg(COMPLIANCE);
    for (const file of files) {
      expect(readFileSync(resolve(file), 'utf8'), `${file} ships the hero fan`)
        .not.toContain('hero-fan');
    }
  });
});
