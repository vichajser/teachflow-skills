import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';
import fg from 'fast-glob';

/**
 * 横向滚动区必须是键盘可达且有名字的（§9.4 / axe `scrollable-region-focusable`,
 * WCAG 2.1.1 + 4.1.2）。
 *
 * 起因是两处实测缺陷：
 * - `/en|ko/security/` 的矩阵包裹层真的在滚（390px 下分别溢出 30px / 8px），
 *   内部**零个可聚焦元素**、无 `tabindex` —— 鼠标能拖，键盘用户永远看不到
 *   被截掉的列。
 * - `/en|ko/skills/` 的两张 Markdown 表格在 320px 下把**整份文档**撑宽 29px。
 *   修法是给表格套滚动容器；若只套 `overflow-x` 而忘了 `tabindex`，等于把
 *   上面那个缺陷原样复制到 `/skills`。这条断言就是防这个复制。
 *
 * 判据取「构建产物里所有横向滚动容器」：`.overflow-x-auto`（Tailwind 工具类，
 * 手写标记用）与 `.table-scroll`（astro.config.mjs 的 rehype 插件给 Markdown
 * 表格生成的容器）。两个来源都必须满足同一组属性，不分出身。
 *
 * **能力边界**：静态扫描只能看见写死在 HTML 里的类名与属性，判断不了元素
 * 在真实视口下**是否真的溢出**（那需要浏览器布局）。所以这条断言的语义是
 * 「凡是声明了自己可横滚的容器，都得能被 Tab 到并被读屏器念出名字」——
 * 它不保证「所有溢出的地方都声明了 overflow」。后者只能靠浏览器评审。
 */

const SCROLLERS = ['.overflow-x-auto', '.table-scroll'];

describe('horizontally scrollable regions are keyboard-reachable', () => {
  it('gives every scroll container a tab stop, a role and a name, on any page', () => {
    const files = fg.sync('dist/**/*.html');
    expect(files.length, 'dist looks empty — did the build run?').toBeGreaterThan(10);

    let seen = 0;
    for (const file of files) {
      const root = parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
      for (const el of root.querySelectorAll(SCROLLERS.join(', '))) {
        seen++;
        expect(el.getAttribute('tabindex'), `${file}: scroll container is not a tab stop`).toBe(
          '0',
        );
        expect(el.getAttribute('role'), `${file}: scroll container has no role`).toBe('region');
        const label = el.getAttribute('aria-label');
        expect(label, `${file}: scroll container has no accessible name`).toBeTruthy();
      }
    }

    // 两个 security 页各 1 个 + 两个 skills 页各 4 个 = 10。写成下界而不是
    // 等值：将来多一张表不该让这条变红，少到 0 才是真问题（选择器写错、
    // 或者修复被整个撤掉，两种情况都会让循环空转、断言假绿）。
    expect(seen, 'found no scroll container at all — did the selector drift?').toBeGreaterThanOrEqual(
      10,
    );
  });

  it('names the scroll container in the reader’s own language', () => {
    // aria-label 走 i18n 的反向对照：英文页不该出现韩文名字，反之亦然。
    // 变异：把 rehype 插件里的语言判定写死成 'en'，这条立刻红。
    const cases = [
      ['dist/ko/skills/index.html', 'ko'],
      ['dist/en/skills/index.html', 'en'],
      ['dist/ko/security/index.html', 'ko'],
      ['dist/en/security/index.html', 'en'],
    ];
    const hangul = /[가-힣]/;

    for (const [file, lang] of cases) {
      const root = parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
      const labels = root
        .querySelectorAll(SCROLLERS.join(', '))
        .map((el) => el.getAttribute('aria-label'));
      expect(labels.length, `${file} ships no scroll container`).toBeGreaterThan(0);
      for (const label of labels) {
        expect(
          hangul.test(label),
          `${file}: scroll container labelled “${label}”, wrong language`,
        ).toBe(lang === 'ko');
      }
    }
  });
});
