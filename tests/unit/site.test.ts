import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SITE } from '@/config/site';

describe('SITE constants', () => {
  it('renders the price with an explicit currency code', () => {
    expect(SITE.price.display).toBe('USD 19.90');
    expect(SITE.price.display).not.toContain('$');
  });

  it('carries the company details verbatim as filed', () => {
    expect(SITE.companyName).toBe('CROSSXTOP LTD');
    expect(SITE.companyNumber).toBe('16339041');
    expect(SITE.registeredIn).toBe('England and Wales');
    expect(SITE.address).toBe(
      'Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ',
    );
  });

  it('exposes a reachable support email', () => {
    expect(SITE.supportEmail).toBe('vichajser@gmail.com');
  });

  it('keeps the domain in one place, with no trailing slash', () => {
    expect(SITE.domain.startsWith('https://')).toBe(true);
    expect(SITE.domain.endsWith('/')).toBe(false);
  });
});

/**
 * The placeholder domain is allowed in exactly two files: `astro.config.mjs`
 * and `src/config/site.ts`. Anywhere else it is a latent bug — when the real
 * domain is bought, those copies would silently keep pointing at a dead host.
 * R-7 exists because `public/robots.txt` was a third copy.
 */
describe('placeholder domain discipline', () => {
  const root = process.cwd();
  const allowed = new Set(['astro.config.mjs', 'src/config/site.ts']);

  // 不吞异常：若 src/ 或 public/ 读不到，测试必须响亮地失败，
  // 而不是返回空数组让断言"通过"——那正是这条路要防的假绿。
  function listFiles(dir: string): string[] {
    return readdirSync(dir, { recursive: true })
      .map((entry) => join(dir, String(entry)))
      .filter((abs) => statSync(abs).isFile());
  }

  it('appears in the shipped source only inside site.ts', () => {
    const files = [
      resolve(root, 'astro.config.mjs'),
      ...listFiles(resolve(root, 'src')),
      ...listFiles(resolve(root, 'public')),
    ];

    // 若扫描没读到任何 src 文件，说明查找逻辑坏了，而不是"干净"。
    expect(files.length).toBeGreaterThan(3);

    const offenders = files
      .filter((abs) => readFileSync(abs, 'utf8').includes('teachflow-kr.example'))
      .map((abs) => abs.slice(root.length + 1))
      .filter((rel) => !allowed.has(rel));

    expect(offenders).toEqual([]);
  });
});
