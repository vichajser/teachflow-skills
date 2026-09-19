import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';
import { SAMPLES, isReady } from '@/data/samples';

/**
 * Task 11 落了九个新页面（en/ko × faq / docs / samples / 404，加根 404），
 * 而当时唯一的 `tests/unit/samples.test.ts` 只读数据模块。实测：把
 * `faq.astro` 的 `e.data.lang === lang` 改成 `=== 'en'`、把 `docs.astro` 的
 * `{step[lang]}` 改成 `{step.en}`、把 `SampleCard` 的 pending 分支删掉，
 * 三处变异全部存活，142 个用例全绿。本文件把每一处钉死。
 *
 * 与 claims.test.mjs 同一套读法：解析 → 去掉 script/style → 取
 * `body.structuredText`，扫的是读者真正看到的文字，不是原始 HTML
 * （扫 HTML 会被 Tailwind 任意值与 data 属性打成误报）。
 */

const DIST = resolve(process.cwd(), 'dist');
const read = (p) => readFileSync(resolve(DIST, p), 'utf8');

function visibleText(relPath) {
  const root = parse(read(relPath));
  for (const el of root.querySelectorAll('script, style')) el.remove();
  return (root.querySelector('body') ?? root).structuredText;
}

/**
 * 谚文占非空白字符的比例。阈值不是拍的——2026-09-19 构建实测：
 *
 *   ko/faq     0.811    ko/docs  0.563    ko/samples 0.427    ko/404 0.423
 *   en/faq     0.003    en/docs  0.002    en/samples 0.004    en/404 0.008
 *
 * 韩文页最低 0.423，英文页最高 0.008，中间隔着五十个百分点。取
 * FLOOR = 0.25：整页变英文（比率塌到 0.005 上下）必红，而 `.pptx`、
 * `Claude Code`、`outputs/` 这些必然英文的词掺进来也远够不着 0.25。
 * CEIL = 0.05 反向守 `lang` 取反：英文页混进大段韩文（0.42+）必红。
 */
const FLOOR = 0.25;
const CEIL = 0.05;

function hangulRatio(text) {
  const chars = [...text].filter((c) => !/\s/.test(c));
  const hangul = chars.filter((c) => /[가-힣]/.test(c)).length;
  return hangul / chars.length;
}

const LOCALIZED = ['faq', 'docs', 'samples', '404'].flatMap((slug) =>
  ['en', 'ko'].map((lang) => ({ lang, slug, file: `${lang}/${slug}/index.html` })),
);

describe('the nine new pages exist in both locales', () => {
  it('builds every localized page plus the root 404', () => {
    // 枚举，不是抽样：删掉 samples.astro 会让 /samples 从全站导航 404，
    // 而任何只查"我想到的那几页"的清单都恰好看不到这一页。
    for (const { file } of LOCALIZED) {
      expect(existsSync(resolve(DIST, file)), `${file} is missing`).toBe(true);
    }
    expect(existsSync(resolve(DIST, '404.html')), 'root 404.html is missing').toBe(true);
  });
});

describe('localized pages render their own language', () => {
  const KOREAN = LOCALIZED.filter((p) => p.lang === 'ko');
  const ENGLISH = LOCALIZED.filter((p) => p.lang === 'en');

  it('renders real Korean on every ko/ page', () => {
    for (const { file } of KOREAN) {
      const ratio = hangulRatio(visibleText(file));
      expect(
        ratio,
        `${file} is not Korean enough (${ratio.toFixed(3)} ≤ ${FLOOR}) — did the ` +
          `page start reading the en side?`,
      ).toBeGreaterThan(FLOOR);
    }
  });

  it('keeps the en/ pages English, with no pasted Korean body', () => {
    for (const { file } of ENGLISH) {
      const ratio = hangulRatio(visibleText(file));
      expect(
        ratio,
        `${file} carries a Korean body (${ratio.toFixed(3)} ≥ ${CEIL}) — did the ` +
          `page stop reading the ${'{lang}'} side?`,
      ).toBeLessThan(CEIL);
    }
  });

  it('renders the root 404 in fixed English and sends the reader to /en', () => {
    const text = visibleText('404.html');
    expect(hangulRatio(text)).toBeLessThan(CEIL);
    const hrefs = parse(read('404.html'))
      .querySelectorAll('a')
      .map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/en');
    expect(hrefs).not.toContain('/ko');
  });

  it('keeps the localized 404 home link inside the reader’s language', () => {
    // 变异：`localizePath('/', lang)` → `'/en'`。韩语 404 会把韩国访客送回
    // 英文首页——`/ko/404` 的这条链接是唯一钉住它的地方。
    for (const lang of ['en', 'ko']) {
      const root = parse(read(`${lang}/404/index.html`));
      const hrefs = root
        .querySelector('main')
        .querySelectorAll('a')
        .map((a) => a.getAttribute('href'));
      expect(hrefs, `${lang}/404 does not return to /${lang}`).toContain(`/${lang}`);
      const others = ['en', 'ko'].filter((l) => l !== lang);
      for (const other of others) {
        expect(hrefs, `${lang}/404 links away to /${other}`).not.toContain(`/${other}`);
      }
    }
  });

  it('declares no language alternates on any 404 page', () => {
    // F-10：错误页没有语言备选。canonical 保留（自指），hreflang 全部去掉。
    for (const file of ['404.html', 'en/404/index.html', 'ko/404/index.html']) {
      const alts = parse(read(file)).querySelectorAll('link[rel="alternate"]');
      expect(alts, `${file} declares hreflang alternates`).toHaveLength(0);
      expect(
        parse(read(file)).querySelector('link[rel="canonical"]'),
        `${file} lost its canonical`,
      ).not.toBeNull();
    }
  });
});

/**
 * FAQ 的问题与顺序从**源 markdown** 读，不硬编码在测试里：条目顺序由
 * `order` frontmatter 决定，硬编码的期望值会在有人改 order 时静默失效。
 */
function faqRows(lang) {
  const dir = resolve(process.cwd(), 'src/content/faq', lang);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const src = readFileSync(resolve(dir, f), 'utf8');
      const order = Number(src.match(/^order:\s*(\d+)/m)[1]);
      const question = src.match(/^question:\s*(.+)$/m)[1].trim();
      return { order, question };
    })
    .sort((a, b) => a.order - b.order);
}

describe('/faq renders the right question set, in order, per locale', () => {
  it('shows exactly the eight questions of its own locale, in order', () => {
    // 变异：`e.data.lang === lang` → `=== 'en'` 让 /ko/faq 整页英文。
    // 这条按源 markdown 逐条比对韩文问题，比 Hangul 比率更早命中，也更明确。
    for (const lang of ['en', 'ko']) {
      const rows = faqRows(lang);
      const text = visibleText(`${lang}/faq/index.html`);
      const root = parse(read(`${lang}/faq/index.html`));
      const details = root.querySelectorAll('details');
      expect(details, `${lang}/faq does not ship one <details> per row`).toHaveLength(
        rows.length,
      );

      let cursor = -1;
      for (const { question } of rows) {
        const at = text.indexOf(question);
        expect(at, `${lang}/faq omits the question ${JSON.stringify(question)}`)
          .toBeGreaterThan(-1);
        expect(at, `${lang}/faq lists ${JSON.stringify(question)} out of order`)
          .toBeGreaterThan(cursor);
        cursor = at;
      }
    }
  });

  it('describes itself with a real lead, not its own title', () => {
    // F-11：`description={t('faq.title')}` 让两页都"用标题描述自己"。
    for (const lang of ['en', 'ko']) {
      const desc = parse(read(`${lang}/faq/index.html`))
        .querySelector('meta[name="description"]')
        .getAttribute('content');
      const title = parse(read(`${lang}/faq/index.html`))
        .querySelector('h1')
        .structuredText.trim();
      expect(desc, `${lang}/faq describes itself with its own title`).not.toBe(title);
      expect(desc.length, `${lang}/faq has an empty description`).toBeGreaterThan(40);
    }
  });
});

describe('/samples states each card honestly', () => {
  const READY = SAMPLES.filter(isReady).length;
  const PENDING = SAMPLES.length - READY;

  it('labels exactly the unready cards as pending, in both locales', () => {
    // 变异 A：删掉 `<p>{t('samples.pending')}</p>` 整个分支 → 计数 0，必红。
    const labels = { en: 'Sample in preparation', ko: '샘플 준비 중' };
    for (const lang of ['en', 'ko']) {
      const text = visibleText(`${lang}/samples/index.html`);
      const found = text.split(labels[lang]).length - 1;
      expect(
        found,
        `${lang}/samples labels ${found} cards pending, expected ${PENDING}`,
      ).toBe(PENDING);
    }
  });

  it('offers a real download link for exactly the ready cards', () => {
    for (const lang of ['en', 'ko']) {
      const root = parse(read(`${lang}/samples/index.html`));
      const downloads = root.querySelectorAll('a[download]');
      expect(downloads, `${lang}/samples ships the wrong number of downloads`)
        .toHaveLength(READY);
    }
  });

  it('never ships a dead download target', () => {
    // 变异 B：pending 分支换成 `<a href={sample.file}>` → 五张卡变成死链。
    // 实测 Astro 对 `href={null}` 是**整个省略 href 属性**（不是渲染成
    // `href=""`），于是 node-html-parser 的 getAttribute 返回 JS `undefined`。
    // 缺失（undefined）、空串、字符串 "null"/"undefined" 四种形态一并挡掉。
    const DEAD = [undefined, null, '', 'null', 'undefined'];
    for (const lang of ['en', 'ko']) {
      const root = parse(read(`${lang}/samples/index.html`));
      for (const a of root.querySelectorAll('a')) {
        const href = a.getAttribute('href');
        expect(
          DEAD.includes(href),
          `${lang}/samples ships a dead link: href=${JSON.stringify(href)}`,
        ).toBe(false);
      }
    }
  });

  it('renders one card per sample, in both locales', () => {
    for (const lang of ['en', 'ko']) {
      const root = parse(read(`${lang}/samples/index.html`));
      expect(root.querySelectorAll('article')).toHaveLength(SAMPLES.length);
    }
  });
});

describe('/docs keeps its step lists in the reader’s language', () => {
  it('does not fall back to the English steps on /ko/docs', () => {
    // 变异：`{step[lang]}` → `{step.en}` 让两段有序列表整段变英文。
    // 比率是主判据；下面两条具体串是"哪一段塌了"的定位器。
    const ko = visibleText('ko/docs/index.html');
    const en = visibleText('en/docs/index.html');

    expect(
      ko,
      'ko/docs leans on the English install steps',
    ).toContain('압축을 풉니다');
    expect(en, 'en/docs lost its install steps').toContain('Unzip the package');

    expect(hangulRatio(ko), 'ko/docs is not Korean enough').toBeGreaterThan(FLOOR);
  });
});
