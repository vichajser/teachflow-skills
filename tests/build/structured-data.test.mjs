import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';
import { SITE } from '@/config/site';
import en from '@/i18n/en.json';
import ko from '@/i18n/ko.json';

/**
 * JSON-LD 结构化数据守卫（2026-09-30，SEO 富摘要 + GEO 实体抽取）。
 *
 * 节点由 `src/lib/schema.ts` 构建、BaseLayout 渲染成
 * `<script type="application/ld+json">`。这里守三件事：
 *   1. 该有的节点在（首页三件套、FAQ 问答、子页面包屑）；
 *   2. 字段对得上单一真相（价格来自 SITE.price，问答来自源 markdown，
 *      面包屑名字来自 i18n 字典）；
 *   3. ko 页的节点装 ko 文案——schema 里的英文串台，读者看不见，
 *      但 AI 引擎看得见，且照样会被当成页面语言的一部分。
 *
 * JSON.parse 能直接吃 `\u003c`（ldJson 的 `<` 转义），不需要先还原。
 */

const DOMAIN = SITE.domain;
const read = (p) => parse(readFileSync(resolve(process.cwd(), 'dist', p), 'utf8'));

function ldNodes(page) {
  return read(page)
    .querySelectorAll('script[type="application/ld+json"]')
    .map((s) => JSON.parse(s.textContent));
}

const byType = (nodes, type) => nodes.filter((n) => n['@type'] === type);

function hangulRatio(text) {
  const chars = [...text].filter((c) => !/\s/.test(c));
  const hangul = chars.filter((c) => /[가-힣]/.test(c)).length;
  return hangul / chars.length;
}

/** FAQ 源条目（问题按 order 排序），与 pages.test.mjs 同款读法。 */
function faqRows(lang) {
  const dir = resolve(process.cwd(), 'src/content/faq', lang);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const src = readFileSync(resolve(dir, f), 'utf8');
      return {
        order: Number(src.match(/^order:\s*(\d+)/m)[1]),
        question: src.match(/^question:\s*(.+)$/m)[1].trim(),
      };
    })
    .sort((a, b) => a.order - b.order);
}

const LOCALES = ['en', 'ko'];

describe('home page entity triple', () => {
  const HOME = { en: 'en/index.html', ko: 'ko/index.html' };

  it('ships Organization, WebSite and SoftwareApplication on both home pages', () => {
    for (const lang of LOCALES) {
      const nodes = ldNodes(HOME[lang]);
      expect(byType(nodes, 'Organization'), `${lang} home has no Organization`).toHaveLength(1);
      expect(byType(nodes, 'WebSite'), `${lang} home has no WebSite`).toHaveLength(1);
      const apps = byType(nodes, 'SoftwareApplication');
      expect(apps, `${lang} home has no SoftwareApplication`).toHaveLength(1);
      expect(apps[0].name).toBe(SITE.productName);
      expect(apps[0].inLanguage).toBe(lang);
    }
  });

  it('prices the offer from SITE.price, never a handwritten figure', () => {
    for (const lang of LOCALES) {
      const [app] = byType(ldNodes(HOME[lang]), 'SoftwareApplication');
      expect(app.offers.price).toBe(SITE.price.amount);
      expect(app.offers.priceCurrency).toBe(SITE.price.currency);
      expect(app.offers.availability).toBe('https://schema.org/InStock');
      // 不变量：JSON-LD 里绝不允许出现 "USD 29.90" 形态的连续字面量——
      // verify-build.mjs 按 `USD\s*\d+` 扫原始 HTML，这条在这里更早红。
      // 只扫 ld+json 脚本本体：页面按钮上的 `— USD 29.90` 是合法写法
      // （PRICE_PAGES 清单内的展示价），不在本断言的职责里。
      const scripts = read(HOME[lang]).querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        expect(s.textContent.includes(`${SITE.price.currency} ${SITE.price.amount}`)).toBe(false);
      }
    }
  });

  it('lists the six skill feature names in the page language', () => {
    const [app] = byType(ldNodes(HOME.ko), 'SoftwareApplication');
    expect(app.featureList).toHaveLength(6);
    for (const name of app.featureList) {
      expect(hangulRatio(name), `ko home featureList leaks English: ${name}`).toBeGreaterThan(0.25);
    }
    const [appEn] = byType(ldNodes(HOME.en), 'SoftwareApplication');
    for (const name of appEn.featureList) {
      expect(hangulRatio(name)).toBeLessThan(0.05);
    }
  });
});

describe('/buy carries the product and its breadcrumb', () => {
  it('ships SoftwareApplication whose offer points at this locale buy page', () => {
    for (const lang of LOCALES) {
      const [app] = byType(ldNodes(`${lang}/buy/index.html`), 'SoftwareApplication');
      expect(app.offers.url).toBe(`${DOMAIN}/${lang}/buy`);
    }
  });
});

describe('/faq mirrors its source markdown as FAQPage', () => {
  it('ships one Question per source file, in order, with clean answer text', () => {
    for (const lang of LOCALES) {
      const rows = faqRows(lang);
      const [page] = byType(ldNodes(`${lang}/faq/index.html`), 'FAQPage');
      expect(page.mainEntity).toHaveLength(rows.length);

      rows.forEach(({ question }, i) => {
        expect(page.mainEntity[i].name).toBe(question);
        const text = page.mainEntity[i].acceptedAnswer.text;
        expect(text.length, `${lang}/faq answer ${i} is empty`).toBeGreaterThan(10);
        // mdToText 的职责：答案进入 schema 时必须已剥掉 markdown 装饰——
        // AI 引擎摘录的是这句话本身，不是它的语法。
        for (const artifact of ['**', '](', '```', '`']) {
          expect(text, `${lang}/faq answer ${i} still carries markdown`).not.toContain(artifact);
        }
      });
    }
  });

  it('keeps every question in the page language', () => {
    for (const lang of LOCALES) {
      const [page] = byType(ldNodes(`${lang}/faq/index.html`), 'FAQPage');
      for (const q of page.mainEntity) {
        const ratio = hangulRatio(q.name);
        const ok = lang === 'ko' ? ratio > 0.25 : ratio < 0.05;
        expect(ok, `${lang}/faq schema question is the wrong language: ${q.name}`).toBe(true);
      }
    }
  });
});

describe('content subpages carry a breadcrumb in the page language', () => {
  const PAGES = [
    ['buy', 'buy.title'],
    ['docs', 'nav.docs'],
    ['faq', 'nav.faq'],
    ['install', 'nav.install'],
    ['samples', 'nav.samples'],
    ['security', 'nav.security'],
    ['skills', 'nav.skills'],
  ];

  it('links home → page with names from the i18n dictionaries', () => {
    for (const lang of LOCALES) {
      const dict = lang === 'ko' ? ko : en;
      for (const [slug, key] of PAGES) {
        const crumbs = byType(ldNodes(`${lang}/${slug}/index.html`), 'BreadcrumbList');
        expect(crumbs, `${lang}/${slug} has no BreadcrumbList`).toHaveLength(1);
        const [home, page] = crumbs[0].itemListElement;
        expect(home.item).toBe(`${DOMAIN}/${lang}`);
        expect(home.name).toBe(dict['nav.home']);
        expect(page.item).toBe(`${DOMAIN}/${lang}/${slug}`);
        expect(page.name).toBe(dict[key]);
      }
    }
  });
});

describe('schema hygiene', () => {
  it('points every http(s) URL at the site or schema.org', () => {
    const pages = [
      'en/index.html',
      'ko/index.html',
      'en/buy/index.html',
      'en/faq/index.html',
      'ko/skills/index.html',
    ];
    const urlsOf = (value, out) => {
      if (typeof value === 'string') {
        if (/^https?:\/\//.test(value)) out.push(value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => urlsOf(v, out));
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach((v) => urlsOf(v, out));
      }
    };
    for (const page of pages) {
      const urls = [];
      urlsOf(ldNodes(page), urls);
      expect(urls.length, `${page} carries no URLs at all`).toBeGreaterThan(0);
      for (const u of urls) {
        expect(
          u.startsWith(DOMAIN) || u.startsWith('https://schema.org'),
          `${page} schema points off-site: ${u}`,
        ).toBe(true);
      }
    }
  });

  it('never writes a URL with a trailing slash', () => {
    // canonical/hreflang 的全站形态是无尾斜杠（verify-build.mjs 守 HTML 里
    // 的那批）；schema 里的 URL 是第三处同形态声明，这里补上同一纪律。
    for (const page of ['en/index.html', 'ko/buy/index.html', 'en/faq/index.html']) {
      const urls = [];
      const urlsOf = (value) => {
        if (typeof value === 'string') {
          if (value.startsWith(DOMAIN)) urls.push(value);
        } else if (Array.isArray(value)) value.forEach(urlsOf);
        else if (value && typeof value === 'object') Object.values(value).forEach(urlsOf);
      };
      urlsOf(ldNodes(page));
      for (const u of urls) {
        expect(u.endsWith('/'), `${page} schema URL has a trailing slash: ${u}`).toBe(false);
      }
    }
  });
});
