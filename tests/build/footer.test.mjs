import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');

// 逐字的公司披露行。Companies Act 2006 s.82 要求注册名称、注册号、
// 注册地、注册办公地址四项；Stripe 人工复审会与提交资料比对。
// 这四项**不随语言变化**——翻译其中任何一段都会让这行与 Companies House 记录不符。
const DISCLOSURE =
  'CROSSXTOP LTD · Registered in England and Wales · Company No. 16339041';
const ADDRESS =
  'Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ';

const REQUIRED = [
  'CROSSXTOP LTD',
  'Company No. 16339041',
  ADDRESS,
  'mailto:crossxtop@gmail.com',
];

describe('site footer', () => {
  it('discloses the legal entity in both locales', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      const html = read(page);
      for (const fragment of REQUIRED) {
        expect(html, `${page} is missing "${fragment}"`).toContain(fragment);
      }
    }
  });

  // 比上面更强的断言：整行逐字，而非拆开的片段。
  // 片段断言会放过 `CROSSXTOP LTD · <任意插入语> · Company No. 16339041`，
  // 而那恰恰是法律披露不允许的形态。
  it('renders the disclosure line byte-identically in both locales', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      expect(read(page), `${page} mangles the disclosure line`).toContain(DISCLOSURE);
    }
  });

  it('keeps the company address untranslated', () => {
    // 地址是法律记录，不随语言变化——翻译它会导致与 Companies House 不一致。
    expect(read('ko/index.html')).toContain(ADDRESS);
  });
});
