import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');

const SCRIPT_TAG = /<script\b(?![^>]*\btype=["']application\/ld\+json["'])/i;

describe('JS budget', () => {
  it('ships script only on the home page', () => {
    for (const page of [
      'en/skills/index.html',
      'en/pricing/index.html',
      'en/security/index.html',
      'en/legal/refund/index.html',
      'ko/skills/index.html',
      'ko/pricing/index.html',
    ]) {
      expect(read(page), `${page} should ship no script`).not.toMatch(SCRIPT_TAG);
    }
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
