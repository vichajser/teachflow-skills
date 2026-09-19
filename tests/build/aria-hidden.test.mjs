import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { parse } from 'node-html-parser';

/**
 * 全站静态可聚焦性：`aria-hidden="true"` 的子树里不得有可聚焦元素。
 *
 * 这是 Task 14 附录本就要求的一条（"静态可查的两条扣分项"之一），提前落地。
 * 它守的是 WCAG 2.1 SC 4.1.2（Name, Role, Value）与 axe 的
 * `aria-hidden-focus` 规则：元素被移出无障碍树，却仍停在 tab 序里，键盘用户
 * 会 Tab 进一个读屏器念不出名字的停靠点。
 *
 * Task 13 修复轮 1 的起因正是这条：`FlowDiagram` 的 `<svg aria-hidden="true">`
 * 里六个 `<g>` 被运行时写上 `tabindex="0"` + `role="button"`。修复把可聚焦性
 * 整个撤掉、结构交给 `<ol data-flow-list>`。`HeroFan` 是另一个风险点（它的
 * 装饰性 SVG 同样整体 aria-hidden，日后若有人往里塞链接就会被这里挡住）。
 *
 * 判据覆盖**宿主本身**与其**整棵子树**：只查子孙的话，`<div aria-hidden
 * tabindex="0">` 这种自己就可聚焦的形态会漏掉；只查宿主的话，子树里的锚点
 * 又会漏掉。两边都查。
 */

/** 会被浏览器放进 tab 序、或被 AT 当成可操作控件的判据 */
const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex], [role="button"]';

/** dist 下每个 html（含 404 这类非 index.html 的页面） */
const parsePage = (file) => parse(readFileSync(resolve(process.cwd(), file), 'utf8'));

describe('no focusable content inside aria-hidden subtrees (site-wide)', () => {
  it('finds no focusable element inside any aria-hidden host, on any page', () => {
    const files = fg.sync('dist/**/*.html');
    expect(files.length, 'dist looks empty — did the build run?').toBeGreaterThan(10);

    let hosts = 0;
    for (const file of files) {
      const root = parsePage(file);
      for (const host of root.querySelectorAll('[aria-hidden="true"]')) {
        hosts += 1;
        const where = `${file} <${host.tagName.toLowerCase()}>`;

        // 宿主自己不得可聚焦：`<svg aria-hidden="true" tabindex="0">` 是合法的
        // HTML，却是纯粹的冲突——这条只有查宿主本身才抓得到。
        expect(
          host.getAttribute('tabindex'),
          `${where}: the aria-hidden host is itself a tab stop`,
        ).toBeUndefined();
        expect(
          host.getAttribute('role'),
          `${where}: the aria-hidden host claims role="button"`,
        ).not.toBe('button');

        // 子树里不得有可聚焦/可操作元素。
        const hits = host.querySelectorAll(FOCUSABLE);
        expect(
          hits.map((el) => `<${el.tagName.toLowerCase()}>`),
          `${where}: focusable content sits inside an aria-hidden subtree — ` +
            'keyboard users land on a stop the screen reader cannot name ' +
            '(WCAG 2.1 SC 4.1.2, axe aria-hidden-focus)',
        ).toEqual([]);
      }
    }

    // 判据本身要真的跑过：若选择器写错、一个宿主都没匹配到，上面的循环体
    // 一次都不执行，整条测试空转通过。
    expect(hosts, 'no aria-hidden hosts matched — the assertion never ran').toBeGreaterThan(0);
  });
});
