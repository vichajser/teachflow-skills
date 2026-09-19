import { parse } from 'node-html-parser';

/**
 * `aria-hidden="true"` 子树内不得有可聚焦元素的判定，供两处共用：
 *
 *   - `tests/build/aria-hidden.test.mjs`（vite/vitest 环境的全站守卫）
 *   - `scripts/verify-build.mjs`（生产依赖环境下单独跑的部署闸门）
 *
 * 两处判据必须逐字一致，否则"测试绿了但闸门红了"这种假绿会重新长出来。
 * Task 14 控制者补注裁决 A 要求复用而非复制，这就是那条复用的产出。
 *
 * 判据覆盖**宿主本身**与其**整棵子树**：只查子孙会漏掉
 * `<div aria-hidden tabindex="0">` 这种自己就可聚焦的形态；只查宿主会漏掉
 * 子树里的锚点。两边都查。
 */

/** 会被浏览器放进 tab 序、或被 AT 当成可操作控件的判据 */
export const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex], [role="button"]';

/**
 * 扫一份 HTML 里的可聚焦冲突。
 *
 * @param {string} html
 * @returns {{ hosts: number, violations: string[] }}
 *   `hosts` 是匹配到的 `aria-hidden="true"` 宿主数——调用方用它做反空转守卫
 *   （选择器写错、一个宿主都没匹配到时，`violations` 会是空数组，看起来"全绿"）。
 *   `violations` 每条以 `<tag>` 开头，调用方负责补文件路径。
 */
export function scanAriaHiddenFocus(html) {
  const root = parse(html);
  let hosts = 0;
  const violations = [];

  for (const host of root.querySelectorAll('[aria-hidden="true"]')) {
    hosts += 1;
    const where = `<${host.tagName.toLowerCase()}>`;

    if (host.getAttribute('tabindex') !== undefined) {
      violations.push(`${where}: the aria-hidden host is itself a tab stop`);
    }
    if (host.getAttribute('role') === 'button') {
      violations.push(`${where}: the aria-hidden host claims role="button"`);
    }

    const hits = host.querySelectorAll(FOCUSABLE).map((el) => `<${el.tagName.toLowerCase()}>`);
    if (hits.length > 0) {
      violations.push(
        `${where}: focusable content sits inside an aria-hidden subtree (${hits.join(', ')}) — ` +
          'keyboard users land on a stop the screen reader cannot name ' +
          '(WCAG 2.1 SC 4.1.2, axe aria-hidden-focus)',
      );
    }
  }

  return { hosts, violations };
}
