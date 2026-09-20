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
 * 只取 `<main>` 的文字，**不含站点母版**（header 导航、语言切换器、footer）。
 *
 * 这一步不是洁癖，是修一个实测漏网：母版在韩文页上本来就是韩文，用整页比率
 * 等于让母版替正文垫底。`ko/404` 整页 293 个非空白字符里正文只占 39 个、
 * 母版占 85 个，`FLOOR(0.25) × 293 = 73.3 < 85`——正文整段翻成英文后整页
 * 比率仍有 0.29，测试照绿。改用 `<main>` 后 `ko/404` 是 0.9512，离阈值极远。
 *
 * 同样的道理，整页比率也发现不了任何**局部**塌陷：一段 `<ol>`、一张卡标题、
 * 一条 FAQ 答案单独变语言都压不动整页数字。所以下面既有 `<main>` 级断言，
 * 也有逐个渲染单元（卡片标题 / 有序列表 / FAQ 条目）的断言。
 */
function mainText(relPath) {
  const root = parse(read(relPath));
  for (const el of root.querySelectorAll('script, style')) el.remove();
  const main = root.querySelector('main');
  if (!main) throw new Error(`no <main> on ${relPath}`);
  return main.structuredText;
}

/** 某个 CSS 选择器选中的每个渲染单元，各自的文字。 */
function unitTexts(relPath, selector) {
  const root = parse(read(relPath));
  for (const el of root.querySelectorAll('script, style')) el.remove();
  return root.querySelectorAll(selector).map((el) => el.structuredText);
}

/**
 * 谚文占非空白字符的比例。阈值不是拍的——2026-09-19 构建实测（`<main>` 范围）：
 *
 *   ko/faq  0.892   ko/docs  0.619   ko/samples 0.510   ko/404 0.951
 *   en/faq  0.003   en/docs  0.000   en/samples 0.000   en/404 0.000
 *
 * 逐单元的实测区间（同一批构建）：
 *
 *   /samples 每张卡标题 h3   ko 0.44–0.53   en 0.00
 *   /docs 每个 <ol>          ko 0.617,0.710 en 0.000,0.000
 *   /faq 每条 <details>      ko 0.82–0.94   en 0.00–0.02
 *
 * 两侧间隔极大：ko 侧最小 0.44，en 侧最大 0.028。FLOOR = 0.25 让"某个单元
 * 整段变英文"必红，而 `.pptx`、`Claude Code`、`outputs/` 这些必然英文的词
 * 掺进来也远够不着 0.25；CEIL = 0.05 反向守 `lang` 取反。
 */
const FLOOR = 0.25;
const CEIL = 0.05;

function hangulRatio(text) {
  const chars = [...text].filter((c) => !/\s/.test(c));
  const hangul = chars.filter((c) => /[가-힣]/.test(c)).length;
  return hangul / chars.length;
}

const LOCALIZED = ['faq', 'docs', 'samples', 'install', '404'].flatMap((slug) =>
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

  it('renders real Korean in the body of every ko/ page', () => {
    for (const { file } of KOREAN) {
      const ratio = hangulRatio(mainText(file));
      expect(
        ratio,
        `${file} <main> is not Korean enough (${ratio.toFixed(3)} ≤ ${FLOOR}) — did ` +
          `the page start reading the en side?`,
      ).toBeGreaterThan(FLOOR);
    }
  });

  it('keeps the body of every en/ page English', () => {
    for (const { file } of ENGLISH) {
      const ratio = hangulRatio(mainText(file));
      expect(
        ratio,
        `${file} <main> carries a Korean body (${ratio.toFixed(3)} ≥ ${CEIL}) — did ` +
          `the page stop reading the ${'{lang}'} side?`,
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
      // `main details`，不是全页 `details`：§9.1 给 `SiteHeader` 加了一个纯 CSS
      // 的移动端菜单，它也是 `<details>`，出现在**每一页**上。全页选择器因此
      // 数到 9 而不是 8。
      //
      // 这不是放宽——恰恰相反，限定到 `<main>` 之后这条断言变严格了：
      // 原先若有人在页面上多塞一个与 FAQ 无关的 `<details>`，计数会同时变化、
      // 需要有人去核对差值；现在它只数 FAQ 自己的那几条，母版怎么变都不影响。
      // 反过来，FAQ 少一条仍然立刻红。
      const details = root.querySelectorAll('main details');
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

  it('holds each answer to the reader’s language on its own', () => {
    // 八条答案各占全页一小部分。实测把 /ko/faq 的答案逐段换成英文，`<main>`
    // 比率随之为：5 段 0.282（仍 > FLOOR，绿）→ 6 段 0.217（才变红）。
    // 也就是说只坏一到五段时，`<main>` 级断言一声不吭。逐 `<details>` 才能在
    // 第一段开始渗英文时就报出来。
    for (const lang of ['en', 'ko']) {
      const entries = unitTexts(`${lang}/faq/index.html`, 'main details');
      expect(entries, `${lang}/faq ships the wrong number of answers`)
        .toHaveLength(faqRows(lang).length);
      entries.forEach((text, i) => {
        const ratio = hangulRatio(text);
        const ok = lang === 'ko' ? ratio > FLOOR : ratio < CEIL;
        expect(
          ok,
          `${lang}/faq answer ${i} has Hangul ratio ${ratio.toFixed(3)}, expected ` +
            `${lang === 'ko' ? '>' : '<'} ${lang === 'ko' ? FLOOR : CEIL}`,
        ).toBe(true);
      });
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
    const labels = {
      en: 'Preview only — file in preparation',
      ko: '미리보기만 제공 — 파일 준비 중',
    };
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

  it('writes each card title in the reader’s language', () => {
    // 五张卡的标题各占全页一小部分：把五张全换成英文，`ko/samples` 的
    // `<main>` 比率实测只从 0.510 塌到 0.306（仍 > FLOOR），`<main>` 级断言
    // 照样绿。逐标题才守得住。
    //
    // 选择器从 `article h3` 改成 `article :is(h2, h3)`：§9.5 给 `SampleCard`
    // 加了 `headingLevel` prop，`/samples` 传 2（这些卡是 h1 之下的第一层内容，
    // 中间没有 h2，写死 h3 就是 h1→h3 跳级，WCAG 1.3.1）。卡标题因此是 `<h2>`。
    // 两级都收，是因为这条断言要测的是"卡标题写的是哪国语言"，不是"标题是
    // 第几级"——后者由 §9.5 自己的结构负责，不该塞进语言断言里连坐。
    // 计数仍然钉死 `SAMPLES.length`，少一张卡照红。
    for (const lang of ['en', 'ko']) {
      const titles = unitTexts(`${lang}/samples/index.html`, 'article :is(h2, h3)');
      expect(titles, `${lang}/samples has the wrong number of card titles`)
        .toHaveLength(SAMPLES.length);
      titles.forEach((text, i) => {
        const ratio = hangulRatio(text);
        const ok = lang === 'ko' ? ratio > FLOOR : ratio < CEIL;
        expect(
          ok,
          `${lang}/samples card ${i} title has Hangul ratio ${ratio.toFixed(3)} ` +
            `(“${text.trim()}”)`,
        ).toBe(true);
      });
    }
  });
});

describe('/docs keeps its step lists in the reader’s language', () => {
  it('does not fall back to the English steps on /ko/docs', () => {
    // 变异：`{step[lang]}` → `{step.en}` 让某段有序列表整段变英文。
    // 下面两条具体串是"哪一段塌了"的定位器。
    const ko = visibleText('ko/docs/index.html');
    const en = visibleText('en/docs/index.html');

    // 两条定位串随 §3.1/§6.5 的安装步骤改写同步更新：那一步从"解压这个包"
    // 改成了"六个 zip 各自解压成一个同名文件夹"。断言的意图一字未变——
    // 指向安装步骤里那句只可能出现在本语言版本中的话——只是句子本身换了。
    // （旧串 `압축을 풉니다` / `Unzip the package` 今天在产物里已经不存在，
    // 留着就是一条永红的断言，不是一条守卫。）
    expect(
      ko,
      'ko/docs leans on the English install steps',
    ).toContain('각각 압축을 풀면');
    expect(en, 'en/docs lost its install steps').toContain('Unzip each of them');
  });

  it('holds each ordered list to the reader’s language on its own', () => {
    // 两个 `<ol>`（安装步骤、首个单元步骤）各自过阈值。整页或 `<main>` 级的
    // 一对多覆盖挡不住单点变异：只把 docs.astro:158 一处 `{step[lang]}` 改成
    // `{step.en}`（首个单元那段全英），`ko/docs` 的 `<main>` 比率实测仍有
    // 0.427（安装步骤那段还是韩文，两条定位串里 `압축을 풉니다` 也还在）。
    // 0.427 远高于 FLOOR，`<main>` 级断言绿。逐 `<ol>` 才守得住。
    const MIN = { ko: FLOOR, en: CEIL };
    for (const lang of ['en', 'ko']) {
      const lists = unitTexts(`${lang}/docs/index.html`, 'main ol');
      expect(lists.length, `${lang}/docs ships ${lists.length} ordered lists`).toBe(2);
      lists.forEach((text, i) => {
        const ratio = hangulRatio(text);
        const ok = lang === 'ko' ? ratio > MIN.ko : ratio < MIN.en;
        expect(
          ok,
          `${lang}/docs <ol>[${i}] has Hangul ratio ${ratio.toFixed(3)}, expected ` +
            `${lang === 'ko' ? '>' : '<'} ${lang === 'ko' ? MIN.ko : MIN.en}`,
        ).toBe(true);
      });
    }
  });
});
