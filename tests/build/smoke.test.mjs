import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = (p) => resolve(process.cwd(), 'dist', p);

describe('build output', () => {
  it('emits an English home page', () => {
    expect(existsSync(dist('en/index.html'))).toBe(true);
  });

  it('emits a Korean home page', () => {
    expect(existsSync(dist('ko/index.html'))).toBe(true);
  });

  it('sets the html lang attribute per locale', () => {
    expect(readFileSync(dist('en/index.html'), 'utf8')).toContain('lang="en"');
    expect(readFileSync(dist('ko/index.html'), 'utf8')).toContain('lang="ko"');
  });

  it('links a stylesheet that contains the compiled Tailwind theme', () => {
    const html = readFileSync(dist('en/index.html'), 'utf8');
    const link = html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/i);
    expect(link, 'dist/en/index.html has no <link rel="stylesheet">').not.toBeNull();

    const href = link[0].match(/href=["']([^"']+)["']/i)[1];
    const css = readFileSync(dist(href.replace(/^\//, '')), 'utf8');
    expect(css).toContain('.text-text-hi');
  });
});
