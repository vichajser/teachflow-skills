import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';

const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');

describe('home page', () => {
  it('leads with the product, not with a coming-soon notice', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      const html = read(page);
      expect(html).not.toMatch(/coming soon/i);
      expect(html).not.toMatch(/under construction/i);
    }
  });

  it('shows a card for all six skills', () => {
    // 断言 SkillCard 的 `data-skill`，不是裸 id：挂上 FlowDiagram 后图里自带
    // 六个 `data-flow-node="<id>"`，用 toContain(id) 的话六张卡一张不渲染也能绿。
    const html = read('en/index.html');
    for (const id of [
      'lesson-workflow',
      'ppt-workflow',
      'audio-workflow',
      'word-workflow',
      'worksheet-workflow',
      'report-workflow',
    ]) {
      expect(html, `home page omits the ${id} card`).toContain(
        `data-skill="${id}"`,
      );
    }
  });

  it('reaches price, refund policy and support within one click', () => {
    // 必须限定在 <main> 内。全页查的话 SiteHeader 与页脚在每一页都给出这三个
    // 链接，连当前这个只有一个 <h1> 的占位首页都能通过——那是在测 BaseLayout。
    const main = parse(read('en/index.html')).querySelector('main');
    expect(main, 'no <main> on the home page').not.toBeNull();
    const hrefs = main.querySelectorAll('a').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/en/pricing');
    expect(hrefs).toContain('/en/legal/refund');
    expect(hrefs).toContain('mailto:vichajser@gmail.com');
  });

  it('states the price on the home page itself', () => {
    expect(read('en/index.html')).toContain('USD 19.90');
  });
});
