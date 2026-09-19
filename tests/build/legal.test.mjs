import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = (p) => resolve(process.cwd(), 'dist', p);
const read = (p) => readFileSync(dist(p), 'utf8');

const SLUGS = ['terms', 'privacy', 'refund', 'delivery'];
const LEGAL_PAGES = ['en', 'ko'].flatMap((lang) =>
  SLUGS.map((slug) => `${lang}/legal/${slug}/index.html`),
);

/**
 * 切出某个 h2 小节的正文。用于断言"这一节里不准出现什么"——
 * 整页断言做不到这件事，因为同一个数字在别的小节是合法的
 * （直销 14 天是我们自己的承诺，Agensi 那一节则一个天数都不能写）。
 */
const section = (html, heading) => {
  const start = html.indexOf(heading);
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const end = html.indexOf('<h2', start);
  return html.slice(start, end < 0 ? html.length : end);
};

describe('/legal pages', () => {
  it('exists in both locales', () => {
    for (const lang of ['en', 'ko']) {
      for (const slug of SLUGS) {
        expect(existsSync(dist(`${lang}/legal/${slug}/index.html`)), `${lang}/${slug}`)
          .toBe(true);
      }
    }
  });

  it('never claims a security certification we do not hold', () => {
    // Stripe 与 Agensi 都会核验这类声明；写了就是虚假陈述。
    for (const page of LEGAL_PAGES) {
      expect(read(page), page).not.toMatch(
        /SOC\s?2|ISO\s?27001|penetration test|pen[- ]tested|third[- ]party audit|security certif/i,
      );
    }
  });

  it('never writes a price literal — PriceBlock is the single source', () => {
    for (const page of LEGAL_PAGES) {
      expect(read(page), page).not.toMatch(/19\.90|USD\s?19|\$\s?19/);
    }
  });

  it('never leaks the placeholder domain', () => {
    for (const page of LEGAL_PAGES) {
      const html = read(page);
      const body = html.slice(html.indexOf('<body'));
      expect(body, page).not.toContain('teachflow-kr.example');
    }
  });

  it('renders real Korean, not the English body under a ko/ path', () => {
    for (const slug of SLUGS) {
      const html = read(`ko/legal/${slug}/index.html`);
      const body = html.slice(html.indexOf('<article'));
      const hangul = (body.match(/[가-힣]/g) ?? []).length;
      expect(hangul, `ko/${slug} has too little Hangul`).toBeGreaterThan(400);
    }
  });
});

describe('/legal/refund', () => {
  it('links to Agensi terms rather than restating their day count', () => {
    // Agensi 自家 /terms 与 /stripe-terms 互相矛盾（30 天 vs 14 天），
    // 复述等于把别人的错误抄进我们的法律页。
    const html = read('en/legal/refund/index.html');
    expect(html).toContain('https://www.agensi.io/terms');
    expect(html).not.toMatch(/30[- ]day/i);
  });

  it('states no day count at all inside the Agensi section, in either locale', () => {
    expect(section(read('en/legal/refund/index.html'), 'If you bought on Agensi'))
      .not.toMatch(/\d+\s*(?:-|&#8209;|\s)?\s*(?:day|business day)/i);
    expect(section(read('ko/legal/refund/index.html'), 'Agensi에서 구매하신 경우'))
      .not.toMatch(/\d+\s*일/);
  });

  it('names Agensi as the merchant of record on both refund and terms', () => {
    expect(read('en/legal/refund/index.html')).toMatch(/merchant of record/i);
    expect(read('en/legal/terms/index.html')).toMatch(/merchant of record/i);
  });

  it('states our own 14-day term for the direct-purchase path', () => {
    expect(read('en/legal/refund/index.html')).toMatch(/14 days/i);
  });

  it('covers the EU/UK statutory right of withdrawal', () => {
    const html = read('en/legal/refund/index.html');
    expect(html).toMatch(/Consumer Contracts Regulations 2013/);
    expect(html).toMatch(/withdraw/i);
  });

  it('keeps the statute names in English on the Korean page too', () => {
    const html = read('ko/legal/refund/index.html');
    expect(html).toContain('UK Consumer Contracts Regulations 2013');
    expect(html).toContain('EU Directive 2011/83/EU');
  });

  it('says there is no subscription to cancel', () => {
    expect(read('en/legal/refund/index.html')).toMatch(/no subscription/i);
  });

  it('does not claim a checkout consent step this display-only site never performs', () => {
    // 本站无结算流程。"下载前请您确认同意立即交付"描述的是不存在的 UI。
    const html = read('en/legal/refund/index.html');
    expect(html).not.toMatch(/before you download,?\s*we ask you to confirm/i);
    // 直销路径的确认发生在发票邮件里——必须写成邮件行为。
    expect(html).toMatch(/invoice email|in the invoice/i);
  });
});

describe('/legal/delivery', () => {
  it('explains both delivery paths', () => {
    const html = read('en/legal/delivery/index.html');
    expect(html).toMatch(/24 hours/i);        // Agensi 签名链接有效期
    expect(html).toMatch(/2 business days/i); // 直销路径承诺
    expect(html).toMatch(/no physical/i);     // 无实体配送
  });

  it('describes six zip packages, one per skill — not one archive of six', () => {
    // 事实核验：`ls TeachFlow-KR/dist/*.zip` 得到 6 个文件。
    const html = read('en/legal/delivery/index.html');
    expect(html).toMatch(/six zip packages/i);
    expect(html).toMatch(/one per skill/i);
    expect(html).not.toMatch(/a zip archive containing six skills/i);
  });

  it('lists every agent that runs the SKILL.md format, not Claude alone', () => {
    const html = read('en/legal/delivery/index.html');
    for (const agent of ['Claude Code', 'Codex CLI', 'Cursor', 'Gemini CLI']) {
      expect(html, `delivery omits ${agent}`).toContain(agent);
    }
    expect(html).not.toMatch(/Claude, with skill support enabled/i);
  });

  it('scopes the no-executable-code claim to the zips the buyer downloads', () => {
    // README §2.2 列出的 verify.py 在包根目录，不在任何 zip 内（Task 5 已核验）。
    const html = read('en/legal/delivery/index.html');
    expect(html).toMatch(/no executable code/i);
    expect(html).toMatch(/zip/i);
  });
});

describe('/legal/terms', () => {
  it('identifies the contracting company and the governing law', () => {
    for (const lang of ['en', 'ko']) {
      const html = read(`${lang}/legal/terms/index.html`);
      const body = html.slice(html.indexOf('<article'));
      expect(body, lang).toContain('CROSSXTOP LTD');
      expect(body, lang).toContain('16339041');
      expect(body, lang).toContain('England and Wales');
    }
  });

  it('grants a personal, non-transferable licence and forbids redistribution', () => {
    const html = read('en/legal/terms/index.html');
    expect(html).toMatch(/resell|redistribut/i);
  });

  it('leaves teacher-created output with the teacher and third-party textbooks with their publisher', () => {
    const html = read('en/legal/terms/index.html');
    expect(html).toMatch(/you own/i);
    expect(html).toMatch(/publisher/i);
  });

  it('carries a warranty disclaimer', () => {
    expect(read('en/legal/terms/index.html')).toMatch(/without warrant|no warrant|as is/i);
  });
});

describe('/legal/privacy', () => {
  it('names the data controller with its registered details', () => {
    const html = read('en/legal/privacy/index.html');
    const body = html.slice(html.indexOf('<article'));
    expect(body).toContain('CROSSXTOP LTD');
    expect(body).toContain('16339041');
    expect(body).toContain('Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ');
  });

  it('states the site runs no analytics, no cookies and no third-party requests', () => {
    const html = read('en/legal/privacy/index.html');
    expect(html).toMatch(/no analytics/i);
    expect(html).toMatch(/no cookies/i);
    expect(html).toMatch(/self-hosted/i);
  });

  it('agrees with /security that nothing leaves the teacher machine', () => {
    const html = read('en/legal/privacy/index.html');
    expect(html).toMatch(/your own (?:machine|computer)|stay on your/i);
    expect(html).not.toMatch(/we (?:collect|receive|store) (?:your )?(?:usage|telemetry|analytics)/i);
  });

  it('lists the GDPR rights and the ICO complaint route', () => {
    const html = read('en/legal/privacy/index.html');
    for (const right of ['access', 'rectif', 'eras', 'portab']) {
      expect(html.toLowerCase(), `privacy omits ${right}`).toContain(right);
    }
    expect(html).toMatch(/Information Commissioner|ICO/);
  });
});
