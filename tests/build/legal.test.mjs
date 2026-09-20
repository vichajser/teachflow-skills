import { describe, it, expect } from 'vitest';
// `fs.globSync` 要 Node 22，而 package.json 声明的下限是 20.3.0 ——
// 在 20.x 上这个具名导入直接抛 SyntaxError，整个文件一条都跑不了。
// fast-glob 已是声明依赖，tests/build/pricing.test.mjs 也走的它。
import fg from 'fast-glob';
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

  it('renders every bold run — no literal ** survives into the article', () => {
    // CommonMark 的 right-flanking 规则：结尾的 `**` 若左邻标点、右邻文字，
    // 就不构成闭合定界符，于是星号原样渲染。韩文里 `**제한(restriction)**과`
    // 正是这个形状——`)` 是标点，`과` 是文字——粗体永不闭合。
    // 英文极少踩到，因为闭合 `**` 后面通常是空格或句号。
    // 只扫 <article> 内部：<head> 的 JSON-LD 与脚本里出现星号是正常的。
    for (const page of LEGAL_PAGES) {
      const html = read(page);
      const article = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
      const leaked = article.match(/\*\*/g) ?? [];
      expect(leaked, `${page} ships unrendered ** (bold never closed)`).toHaveLength(0);
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
    expect(html).toMatch(/download link/i);   // Agensi 路径：签名链接
    expect(html).toMatch(/2 business days/i); // 直销路径承诺
    expect(html).toMatch(/no physical/i);     // 无实体配送
  });

  it('does not restate Agensi’s link validity window, only points at their terms', () => {
    // 这一条**取代**了原先的 `expect(html).toMatch(/24 hours/i)`，不是放宽它。
    //
    // 原断言钉的是"页面上写着 24 hours"。那个数字本身有依据
    // （`PUBLISHING.md:21`），不是编造——但它复述的是**第三方的条款**，
    // 而 `/legal/refund` 自己立过纪律："We do not restate their refund window
    // here: their terms can change, and the version on their site is always the
    // one that governs your purchase." 同一个理由对链接有效期同样成立，
    // 而这写在**合同性页面**上：Agensi 哪天把 24 小时改成 1 小时，我们的
    // 合同页就在对买家陈述一个不成立的事实。
    //
    // 所以断言方向反了过来：不再要求某个具体数字在场，而是要求**任何**
    // 挂在 Agensi 链接上的时长数字**不在场**，同时必须给出他们条款的出处。
    // 这比原断言更严——原断言只要有 "24 hours" 就绿，改成 "48 hours" 才红；
    // 现在写任何时长都红。
    //
    // 韩文页一并守：合规纪律不分语言。
    for (const page of ['en/legal/delivery/index.html', 'ko/legal/delivery/index.html']) {
      const html = read(page);
      expect(
        html,
        `${page} restates Agensi’s link validity window — their terms can change`,
      ).not.toMatch(/\d+\s*(?:hours?|시간)/i);
      expect(html, `${page} does not point at Agensi’s terms`).toContain(
        'https://www.agensi.io/terms',
      );
    }
  });

  it('still never restates Agensi’s refund day count, on any page', () => {
    // 既有的全站纪律：退款天数只说我们自己的 14 天（直销路径），
    // Agensi 的窗口一个字都不复述。上面那条新纪律不得把这条挤掉。
    for (const page of ['en/legal/delivery/index.html', 'ko/legal/delivery/index.html']) {
      const html = read(page);
      expect(html, `${page} mentions a refund window it should not`).not.toMatch(
        /\d+\s*(?:days?|일)[^.!?<]{0,40}(?:refund|환불)/i,
      );
    }
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
  it('invents no volume-licensing rule we do not operate', () => {
    // "每位教师一份许可"在项目任何文档中都没有依据，且与六个 zip 内的
    // MIT LICENSE 直接冲突。宁可不说，也不编造一个我们answer不了的销售规则。
    for (const lang of ['en', 'ko']) {
      const html = read(`${lang}/legal/terms/index.html`);
      const article = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
      expect(article, `${lang} terms invents a per-teacher licence rule`)
        .not.toMatch(/one licence per teacher|per[- ]teacher licence|선생님 한 분당 라이선스/i);
    }
  });

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
    expect(html).toMatch(/no third-party requests/i);
  });

  it('keeps the font claim aligned with whether font files actually ship', () => {
    // 站点当前一个 woff 都没有，`--font-sans` 退化到系统字体，
    // 所以"字体自托管"描述的是不存在的文件。Task 12 会加 woff2。
    //
    // 这里不能写成"有字体就跳过检查"——那样 Task 12 一落地，本断言
    // 就永久失效，日后任何虚假的自托管声明都无人把关。真正的不变量是
    // **声明与事实一致**，两个方向都要断言：
    //   零字体 → 不得声称自托管
    //   有字体 → 必须全部来自本站，不得出现任何跨域字体引用
    const fontFiles = fg.sync('dist/**/*.{woff,woff2,ttf,otf}');

    for (const lang of ['en', 'ko']) {
      const html = read(`${lang}/legal/privacy/index.html`);
      const article = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
      if (fontFiles.length === 0) {
        expect(article, `${lang} claims self-hosting that does not happen yet`)
          .not.toMatch(/self-hosted|자체 호스팅/i);
      }
    }

    // 隐私页承诺"字体不从 CDN 取"。字体一旦存在，这条承诺就必须被构建产物证实。
    const css = fg.sync('dist/**/*.css').map((p) => readFileSync(p, 'utf8')).join('\n');
    const remoteFontSrc = css.match(/src:[^;}]*https?:\/\/[^;}]*/g) ?? [];
    expect(remoteFontSrc, 'privacy page promises no CDN-hosted fonts').toEqual([]);
  });

  it('does not miscount its own outbound links', () => {
    // 该页自身就带 Agensi 与 ICO 两个站外链接。写"唯一的站外链接是 Agensi"
    // 会被下面一段当场证伪。可辩护的说法是区分「链接」与「请求」：
    // 页面不向任何第三方发请求，链接则要点了才走。
    for (const lang of ['en', 'ko']) {
      const html = read(`${lang}/legal/privacy/index.html`);
      const article = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
      // 韩文那一支原先写成 `링크는[^.]{0,20}하나뿐`，但被删掉的原句里两者
       // 相隔 24 字，正则永不命中——韩文侧等于没有把关。改为直接抓"하나뿐"
       // 这个数量断言本身：韩文文案里再没有第二处合法用到它的地方。
      expect(article, `${lang} claims a single outbound link`)
        .not.toMatch(/only outbound link|outbound link[^.]{0,40}is the text link|하나뿐|유일한 (?:외부|바깥)/i);
      // 真正该说的那件事必须在场
      expect(article, `${lang} drops the no-third-party-request claim`)
        .toMatch(/no third-party requests|제3자 요청이 없습니다/i);
    }
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
