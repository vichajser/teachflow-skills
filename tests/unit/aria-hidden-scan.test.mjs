import { describe, it, expect } from 'vitest';
import { FOCUSABLE, scanAriaHiddenFocus } from '../../scripts/aria-hidden-scan.mjs';

/**
 * `scripts/aria-hidden-scan.mjs` 的**契约测试**——固定 HTML fixture，不读 `dist/`。
 *
 * 为什么需要它（别把这条当作和 `tests/build/aria-hidden.test.mjs` 重复而删掉）：
 * 那个构建产物测试和 `scripts/verify-build.mjs` 现在**都**从这一个模块取判据
 * （Task 14 裁决 A 选了「提取共享模块」而非复制）。代价是单点故障——只要有人
 * 把模块里的 `FOCUSABLE` 选择器列表改小（例如删掉 `input`），闸门和那个测试会
 * **同时**变瞎，而且 `hosts === 0` 那条反空转守卫也抓不到：宿主数没变，只是不再
 * 认得某些可聚焦元素。本文件用不依赖 `dist/` 的固定 fixture 把 `FOCUSABLE` 的
 * 覆盖面钉死，任何人删减它，这里立刻红。
 *
 * 反面同样重要：契约测试只断言**模块导出的事**，不复制站点结构，所以它不会
 * 因为站点改版而红——它守的是判据本身，不是站点。
 */

/** 每个 fixture 都被断言「恰好产生 1 条 violation」——判据的最小可证伪单元。 */
const oneViolation = (html) => {
  const { violations } = scanAriaHiddenFocus(html);
  expect(violations).toHaveLength(1);
  return violations[0];
};

describe('scanAriaHiddenFocus contract', () => {
  it('flags a link inside an aria-hidden subtree', () => {
    const v = oneViolation('<div aria-hidden="true"><a href="/x">go</a></div>');
    expect(v).toContain('<a>');
  });

  it('flags a button inside an aria-hidden subtree', () => {
    oneViolation('<div aria-hidden="true"><button>press</button></div>');
  });

  it('flags an input inside an aria-hidden subtree', () => {
    oneViolation('<div aria-hidden="true"><input type="text"></div>');
  });

  it('flags a select inside an aria-hidden subtree', () => {
    oneViolation('<div aria-hidden="true"><select><option>a</option></select></div>');
  });

  it('flags a textarea inside an aria-hidden subtree', () => {
    oneViolation('<div aria-hidden="true"><textarea></textarea></div>');
  });

  it('flags a positive tabindex inside an aria-hidden subtree', () => {
    oneViolation('<div aria-hidden="true"><span tabindex="0">x</span></div>');
  });

  // tabindex="-1" 不在**自然** tab 序里，但仍是脚本可聚焦的程序化焦点目标，
  // axe 的 aria-hidden-focus 同样判定失败——所以 [tabindex] 选择器必须覆盖它，
  // 不能只认 tabindex="0"。
  it('flags a negative tabindex inside an aria-hidden subtree', () => {
    oneViolation('<div aria-hidden="true"><span tabindex="-1">x</span></div>');
  });

  it('flags a focusable element nested deeper than one level', () => {
    const v = oneViolation(
      '<div aria-hidden="true"><span><em><a href="/deep">deep</a></em></span></div>',
    );
    expect(v).toContain('<a>');
  });

  // 宿主**自己**就可聚焦是另一种形态：<div aria-hidden tabindex="0">。只查子孙
  // 会漏掉它，所以模块两边都查。这两条把「宿主本身」那一半钉住。
  it('flags an aria-hidden host that is itself a tab stop', () => {
    const { violations } = scanAriaHiddenFocus('<div aria-hidden="true" tabindex="0"></div>');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('itself a tab stop');
  });

  it('flags an aria-hidden host that claims role="button"', () => {
    const { violations } = scanAriaHiddenFocus('<div aria-hidden="true" role="button"></div>');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('role="button"');
  });

  it('counts hosts and stays silent when there is no aria-hidden host', () => {
    const { hosts, violations } = scanAriaHiddenFocus('<div><a href="/x">go</a></div>');
    expect(hosts).toBe(0);
    expect(violations).toEqual([]);
  });

  it('returns zero violations and a positive host count for a clean aria-hidden subtree', () => {
    const { hosts, violations } = scanAriaHiddenFocus(
      '<div aria-hidden="true"><span>decorative</span></div>',
    );
    expect(hosts).toBe(1);
    expect(violations).toEqual([]);
  });

  // FOCUSABLE 是模块对外的判据清单。断言其中每一项都在——删任何一项都红。
  // 只列**模块里实际有**的选择器，不凭空加未实现的。
  it('keeps every focusable selector in FOCUSABLE', () => {
    for (const selector of [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[tabindex]',
      '[role="button"]',
    ]) {
      expect(FOCUSABLE, `FOCUSABLE dropped "${selector}"`).toContain(selector);
    }
  });
});
