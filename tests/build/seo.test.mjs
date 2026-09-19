import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';
import { SITE } from '@/config/site';

// 域名从 SITE 读，不写死：一个把被守卫的值硬编码进去的测试，
// 在换域名的当天会因为错误的原因失败，而不是在域名写错时失败。
const DOMAIN = SITE.domain;
const read = (p) => parse(readFileSync(resolve(process.cwd(), 'dist', p), 'utf8'));

describe('SEO head', () => {
  it('points canonical at the page it sits on', () => {
    const en = read('en/index.html');
    expect(en.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${DOMAIN}/en`,
    );
    const ko = read('ko/index.html');
    expect(ko.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${DOMAIN}/ko`,
    );
  });

  it('cross-links both locales plus x-default on every page', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      const root = read(page);
      const alternates = root
        .querySelectorAll('link[rel="alternate"]')
        .map((el) => [el.getAttribute('hreflang'), el.getAttribute('href')]);
      expect(alternates).toEqual([
        ['en', `${DOMAIN}/en`],
        ['ko', `${DOMAIN}/ko`],
        ['x-default', `${DOMAIN}/en`],
      ]);
    }
  });

  it('never ships a noindex directive', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      const robots = read(page).querySelector('meta[name="robots"]');
      expect(robots?.getAttribute('content') ?? '').not.toContain('noindex');
    }
  });

  it('gives each page a non-empty description', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      const desc = read(page).querySelector('meta[name="description"]');
      expect((desc?.getAttribute('content') ?? '').length).toBeGreaterThan(0);
    }
  });
});
