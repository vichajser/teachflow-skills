import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { SITE } from '@/config/site';
import en from '@/i18n/en.json';

/**
 * GEO（生成式引擎优化）三件套的守卫：llms.txt、robots.txt 的 AI 爬虫段、
 * favicon.ico。三者都服务于"AI 引擎与传统爬虫能取到干净的机器可读入口"。
 */

const DOMAIN = SITE.domain;
const dist = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');

describe('llms.txt', () => {
  it('exists and opens with the product name and tagline', () => {
    const body = dist('llms.txt');
    expect(body.startsWith('# TeachFlow\n')).toBe(true);
    expect(body).toContain(`> ${en['site.tagline']}`);
  });

  it('links every public page with absolute URLs', () => {
    const body = dist('llms.txt');
    for (const path of [
      '/en/skills',
      '/en/samples',
      '/en/install',
      '/en/docs',
      '/en/faq',
      '/en/security',
      '/en/buy',
      '/en/legal/terms',
      '/en/legal/privacy',
      '/en/legal/refund',
      '/en/legal/delivery',
      '/ko',
      '/ko/skills',
      '/ko/buy',
    ]) {
      expect(body, `llms.txt omits ${path}`).toContain(`${DOMAIN}${path}`);
    }
  });

  it('carries the real support identity, not a placeholder', () => {
    const body = dist('llms.txt');
    expect(body).toContain(SITE.supportEmail);
    expect(body).toContain(SITE.companyName);
  });
});

describe('robots.txt AI crawler policy', () => {
  const robots = () => dist('robots.txt');

  it('welcomes the documented generative-engine crawlers by name', () => {
    // 通配符组已经允许一切；这个名单的存在是**表态**——将来任何人想挡其中
    // 一个，必须动手改这组，而不是被通配符收紧顺带误伤。删掉任何一个 UA
    // 行本用例即红，提醒删除者那是一个 conscious 的决定。
    for (const ua of [
      'GPTBot',
      'OAI-SearchBot',
      'ChatGPT-User',
      'ClaudeBot',
      'Claude-Web',
      'Claude-SearchBot',
      'PerplexityBot',
      'Perplexity-User',
      'Google-Extended',
      'Amazonbot',
      'Applebot-Extended',
      'meta-externalagent',
      'CCBot',
    ]) {
      expect(robots(), `robots.txt drops the AI crawler ${ua}`).toContain(
        `User-agent: ${ua}`,
      );
    }
  });

  it('keeps the AI group as permissive as the wildcard group', () => {
    // AI 组必须整组 Allow: /、没有任何 Disallow——它若比通配符组更严，
    // "显式欢迎"就名存实亡。verify-build.mjs 守全站 Disallow 为空，
    // 这里守这一组的语义。
    const body = robots();
    expect(body).toContain('Allow: /\n\nSitemap:');
    for (const m of body.matchAll(/^\s*Disallow:\s*(.*)$/gim)) {
      expect(m[1].trim()).toBe('');
    }
  });
});

describe('favicon.ico', () => {
  it('exists as a real ICO container in dist', () => {
    // 浏览器与部分爬虫仍会自动请求 /favicon.ico。它必须是真文件——
    // 缺了它，Caddy 会把该请求 302 到 /en（见下一条的清单断言）。
    const file = resolve(process.cwd(), 'dist/favicon.ico');
    expect(existsSync(file), 'dist/favicon.ico is missing').toBe(true);
    const head = readFileSync(file).subarray(0, 4);
    // ICONDIR：reserved=0, type=1(icon), count=1
    expect([...head]).toEqual([0x00, 0x00, 0x01, 0x00]);
  });

  it('is served by Caddy instead of being 302-ed to /en', () => {
    // @unknown_locale 的排除清单是真实行为的一部分：漏登记的顶层文件
    // 会被 302 到 /en，爬虫拿到 HTML 而不是图标。llms.txt 同理。
    const caddy = readFileSync(resolve(process.cwd(), 'deploy/Caddyfile'), 'utf8');
    const listLine = caddy
      .split('\n')
      .find((l) => l.includes('@unknown_locale not path'));
    expect(listLine, 'cannot find the @unknown_locale exclusion list').toBeTruthy();
    for (const entry of ['/favicon.ico', '/llms.txt']) {
      expect(listLine, `Caddyfile does not exempt ${entry}`).toContain(entry);
    }
  });
});
