import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { scanAriaHiddenFocus } from '../../scripts/aria-hidden-scan.mjs';

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
 * **能力边界**：这是纯静态扫描，只看构建产物里写死的标记。任何在浏览器里由
 * JavaScript 运行时写进 DOM 的 `tabindex` / `role` / 可聚焦节点都**看不见**——
 * 那正是 Task 13 修复轮 1 的真实起因（`<g>` 的 `tabindex` 是运行时加的），
 * 静态守卫当时全程是绿的。运行时的对应物在这里：
 * `tests/unit/flow-diagram.test.ts` 的
 * `never makes the nodes focusable, from script or markup (fix round 1)`，
 * 它直接跑 island 脚本、断言 DOM 上永不出现 tabindex/role。
 *
 * 判据覆盖**宿主本身**与其**整棵子树**（见 `scripts/aria-hidden-scan.mjs`，与
 * `scripts/verify-build.mjs` 共用同一份实现——部署闸门在生产依赖环境下单独跑，
 * 与这里分叉就会长回"测试绿、闸门红"的假绿）。
 */

/** dist 下每个 html（含 404 这类非 index.html 的页面） */
const parsePage = (file) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('no focusable content inside aria-hidden subtrees (site-wide)', () => {
  it('finds no focusable element inside any aria-hidden host, on any page', () => {
    const files = fg.sync('dist/**/*.html');
    expect(files.length, 'dist looks empty — did the build run?').toBeGreaterThan(10);

    let hosts = 0;
    for (const file of files) {
      const { hosts: found, violations } = scanAriaHiddenFocus(parsePage(file));
      hosts += found;
      expect(
        violations,
        `${file}: focusable content sits inside an aria-hidden subtree — ` +
          'keyboard users land on a stop the screen reader cannot name ' +
          '(WCAG 2.1 SC 4.1.2, axe aria-hidden-focus)',
      ).toEqual([]);
    }

    // 判据本身要真的跑过：若选择器写错、一个宿主都没匹配到，上面的循环体
    // 一次都不执行，整条测试空转通过。
    expect(hosts, 'no aria-hidden hosts matched — the assertion never ran').toBeGreaterThan(0);
  });
});
