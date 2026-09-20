import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');
const read = (p) => readFileSync(resolve(DIST, p), 'utf8');

const SCRIPT_TAG = /<script\b(?![^>]*\btype=["']application\/ld\+json["'])/i;

/** dist 下每一个 index.html，相对 dist 的 posix 路径 */
function allPages(dir = DIST) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allPages(full));
    else if (entry.name === 'index.html')
      out.push(relative(DIST, full).split(sep).join('/'));
  }
  return out.sort();
}

// 首页是唯一允许带 JS 的页面；dist/index.html 是 meta-refresh 跳转壳，不是首页。
const HOME = ['en/index.html', 'ko/index.html'];

describe('JS budget', () => {
  it('ships script on no page except the two home pages', () => {
    // 原先这里是一份手写的 6 页清单，而 dist 实际有 17 页 —— 把 <script>
    // 漏进 privacy.astro，英韩两份隐私页都带上脚本，这条测试照样绿。
    // 改成枚举 dist 下所有 index.html，清单才真的覆盖它声称的那条约束。
    const pages = allPages();
    expect(pages.length, 'dist looks empty — did the build run?').toBeGreaterThan(10);

    for (const page of pages) {
      if (HOME.includes(page)) continue;
      expect(read(page), `${page} should ship no script`).not.toMatch(SCRIPT_TAG);
    }
  });

  it('ships the diagram script on the home page', () => {
    // 只断言"别处没有"是单向的：把 FlowDiagram.astro 里的 <script> 挂载整段删掉，
    // 首页零脚本、动画彻底消失，而全套测试 111/111 全绿 —— 实测如此。
    // 必须同时钉住"首页有"，这道预算守卫才是双向的。
    const html = read('en/index.html');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
      .filter((m) => !/type=["']application\/ld\+json["']/i.test(m[0]));

    expect(scripts.length, 'home page ships no module script').toBeGreaterThan(0);
    expect(
      scripts.some((m) => m[1].includes('data-flow-diagram')),
      'no script on the home page drives the flow diagram',
    ).toBe(true);
  });

  it('renders the full diagram in HTML, not from script', () => {
    // JS 关闭时首页仍须显示完整关系图（spec §8）
    const html = read('en/index.html');
    for (const id of [
      'lesson-workflow',
      'ppt-workflow',
      'audio-workflow',
      'word-workflow',
      'worksheet-workflow',
      'report-workflow',
    ]) {
      expect(html, `diagram is missing node ${id}`).toContain(`data-flow-node="${id}"`);
    }
  });
});
