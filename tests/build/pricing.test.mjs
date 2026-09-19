import { describe, it, expect } from 'vitest';
import fg from 'fast-glob';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');
const PAGES = ['en/pricing/index.html', 'ko/pricing/index.html'];

describe('/pricing', () => {
  it('states the price with an explicit currency code', () => {
    for (const page of PAGES) {
      expect(read(page)).toContain('USD 19.90');
    }
  });

  it('lists all six skills so the product description is concrete', () => {
    for (const page of PAGES) {
      const html = read(page);
      for (const id of [
        'lesson-workflow',
        'ppt-workflow',
        'audio-workflow',
        'word-workflow',
        'worksheet-workflow',
        'report-workflow',
      ]) {
        expect(html, `${page} omits ${id}`).toContain(id);
      }
    }
  });

  it('gives a direct-purchase path, not only the marketplace', () => {
    // spec §10.3：站内无结算时，若只有跳第三方的按钮，审核员会质疑账户用途
    for (const page of PAGES) {
      expect(read(page)).toContain('mailto:vichajser@gmail.com');
    }
  });

  it('links the refund and delivery policies from the pricing page', () => {
    expect(read('en/pricing/index.html')).toContain('/en/legal/refund');
    expect(read('en/pricing/index.html')).toContain('/en/legal/delivery');
    expect(read('ko/pricing/index.html')).toContain('/ko/legal/refund');
  });
});

describe('price notation across the whole build', () => {
  it('never writes the price with a bare dollar sign', async () => {
    const files = await fg('dist/**/*.html');
    const offenders = files.filter((file) =>
      /\$\s?19(\.9\d?)?\b/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
