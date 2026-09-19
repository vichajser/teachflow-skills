import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';
import { FLOW_NODES } from '@/components/FlowDiagram/nodes';
import { sampleHref } from '@/components/FlowDiagram/nodes';
import { SAMPLES, isReady } from '@/data/samples';
import en from '@/i18n/en.json';
import ko from '@/i18n/ko.json';

/**
 * 首页关系图的 Task 13 行为：约束胶囊与六张悬停侧卡。
 *
 * 这份文件里有两类断言，区别很重要：
 *
 *   1. **构建产物断言**（读 `dist/{en,ko}/index.html`）——卡片数量、默认
 *      `hidden`、静态标记里零 `role="button"`、胶囊文案本地化。这些只有在
 *      真实 Astro 产物上才有意义。
 *
 *   2. **数据与规则断言**（读 `nodes.ts` / `samples.ts` / 两份字典）——当构建
 *      产物**证明不了**某条规则时，只能直接测那条规则本身。今天的两个例子：
 *      · 五个样例的 `file` 全是 null，页面上一条样例链接都不会出现，"删掉
 *        链接渲染"这个变异在产物里完全不可见；
 *      · 今天六个节点都配齐了键，产物里看不出"漏配就没标题"这条防御。
 *      这两条都靠直接调用 `sampleHref` / 遍历 `FLOW_NODES` 来守。
 *
 * Task 12 刚栽在"断言守的是源码的存在，不是行为的发生"上（motion-budget 的
 * 11 条断言里 8 条变异存活），所以这里刻意把能测行为的都测成行为。
 */

const DIST = resolve(process.cwd(), 'dist');
const read = (p) => readFileSync(resolve(DIST, p), 'utf8');
const home = (lang) => parse(read(`${lang}/index.html`));

const NODE_IDS = [
  'lesson-workflow',
  'ppt-workflow',
  'audio-workflow',
  'word-workflow',
  'worksheet-workflow',
  'report-workflow',
];

describe('flow hooks in the built pages', () => {
  it('ships one card per node and exactly one capsule, in both locales', () => {
    for (const lang of ['en', 'ko']) {
      const root = home(lang);
      expect(root.querySelectorAll('[data-flow-card]').length, `${lang} cards`).toBe(6);
      expect(root.querySelectorAll('[data-flow-capsule]').length, `${lang} capsule`).toBe(1);

      const ids = root
        .querySelectorAll('[data-flow-card]')
        .map((c) => c.getAttribute('data-flow-card'))
        .sort();
      expect(ids, `${lang} card ids`).toEqual([...NODE_IDS].sort());
    }
  });

  it('hides every card without JS (N4)', () => {
    // 变异 N4：去掉 `hidden` 初始属性 → 六张卡在无 JS 时全部显形，堆在图的
    // 右侧。这不是"少了点效果"，是页面上多出六块没人要的文字。
    for (const lang of ['en', 'ko']) {
      const cards = home(lang).querySelectorAll('[data-flow-card]');
      expect(cards.length, 'no cards to check').toBe(6);
      for (const card of cards) {
        expect(
          card.hasAttribute('hidden'),
          `${lang}: card ${card.getAttribute('data-flow-card')} is visible without JS`,
        ).toBe(true);
      }
    }
  });

  it('hides the capsule without JS', () => {
    // 胶囊初始 opacity 0：它表达的是过程，静态帧里不该出现（其余元素是终态）。
    // 去掉这个属性会让人以为图上本来就飘着一个胶囊。
    for (const lang of ['en', 'ko']) {
      const capsule = home(lang).querySelector('[data-flow-capsule]');
      expect(capsule, `${lang} has no capsule`).not.toBeNull();
      expect(capsule.getAttribute('opacity'), `${lang} capsule starts visible`).toBe('0');
    }
  });

  it('promises no button role before JS can deliver it (N5)', () => {
    // tabindex 与 role="button" 在 JS 里加：无 JS 时节点不可交互，静态标成
    // role="button" 是向屏幕阅读器承诺一个不存在的行为。变异 N5 把它们写进
    // SVG 标记，这条即红。
    for (const lang of ['en', 'ko']) {
      const root = home(lang);
      expect(
        root.querySelectorAll('[data-flow-node][role="button"]').length,
        `${lang}: a node claims a button role in the static markup`,
      ).toBe(0);
      expect(
        root.querySelectorAll('[data-flow-node][tabindex]').length,
        `${lang}: a node is focusable in the static markup`,
      ).toBe(0);
    }
  });

  it('localizes the capsule label', () => {
    expect(home('ko').toString()).toContain('핵심 흐름');
    expect(home('en').toString()).toContain('core flow');
    // 反向：英文页不得混进韩文胶囊文案（lang 取反时会同时命中两条）。
    expect(home('en').toString()).not.toContain('핵심 흐름');
  });
});

describe('card content is populated, never a bare heading', () => {
  it('gives every node both a needs and a makes line', () => {
    // 裁决 1 的修复对象：照 brief 原样渲染 `node.needs.join()` / `node.outputs.join()`，
    // 六个节点里五个的 needs 是空数组、一个的 outputs 是空数组，于是五张卡挂着
    // 空标题。改用 `needsKey`/`makesKey` 之后，每个节点两条都必须非空。
    for (const lang of ['en', 'ko']) {
      for (const card of home(lang).querySelectorAll('[data-flow-card]')) {
        const id = card.getAttribute('data-flow-card');
        const text = card.structuredText.replace(/\s+/g, ' ').trim();
        expect(text.length, `${lang}: card ${id} is empty`).toBeGreaterThan(0);
        // 标题下面必须还有内容，不能只有一行 h3。
        const paragraphs = card.querySelectorAll('p');
        expect(paragraphs.length, `${lang}: card ${id} has no needs/makes lines`)
          .toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('points every card key at a key that exists in both dictionaries (N1)', () => {
    // 变异 N1：把某个 needsKey 指向不存在的键。`t()` 对缺失键会回落到英文，
    // 两边都缺时给出 undefined——卡片那一行就成了空白，而"卡片数量 = 6"
    // 的计数断言照绿。这条直接核对 12 个键在**两份**字典里都真实存在。
    for (const node of FLOW_NODES) {
      for (const key of [node.needsKey, node.makesKey]) {
        expect(
          Object.prototype.hasOwnProperty.call(en, key),
          `${node.id}: ${key} is missing from en.json`,
        ).toBe(true);
        expect(
          Object.prototype.hasOwnProperty.call(ko, key),
          `${node.id}: ${key} is missing from ko.json`,
        ).toBe(true);
        // 非空：`t()` 返回空串与返回裸键同样是坏结果。
        expect(en[key].trim().length, `en.${key} is blank`).toBeGreaterThan(0);
        expect(ko[key].trim().length, `ko.${key} is blank`).toBeGreaterThan(0);
      }
    }
  });

  it('never renders a raw key or an empty line in the built cards', () => {
    // 上一条在源码侧守，这条在产物侧守：万一某个键虽然存在于字典，却没走到
    // 卡片上（比如模板读错了字段），产物里会露出 `flow.needs.*` 或 `undefined`。
    for (const lang of ['en', 'ko']) {
      for (const card of home(lang).querySelectorAll('[data-flow-card]')) {
        const text = card.structuredText;
        const id = card.getAttribute('data-flow-card');
        expect(text, `${lang}: card ${id} shows a raw key`).not.toMatch(/flow\.(needs|makes)\./);
        expect(text, `${lang}: card ${id} shows undefined`).not.toContain('undefined');
      }
    }
  });

  it('writes the Korean card content in Korean, not English', () => {
    // 韩文侧不得比英文弱，也不得干脆回落成英文（`t()` 的回落规则会让缺键
    // 静默显示英文，页面上完全看不出问题）。
    const koHangul = /[가-힣]/;
    for (const card of home('ko').querySelectorAll('[data-flow-card]')) {
      const text = card.structuredText;
      const id = card.getAttribute('data-flow-card');
      expect(koHangul.test(text), `ko: card ${id} carries no Hangul`).toBe(true);
    }
  });
});

describe('the sample link follows the samples that actually exist (N2)', () => {
  it('links a ready sample to its anchor on /samples', () => {
    // 变异 N2：删掉侧卡里 `flow.card.sample` 链接的渲染。今天五个样例的
    // `file` 全是 null，构建产物里一条样例链接都没有——"删掉渲染"和"没有
    // 可渲染的样例"在 dist 上逐字节相同，所以这条只能在规则层测：
    // 造一个已就绪的样例，断言它确实产出带锚点的链接。
    const ready = {
      id: 'unit07-slides',
      skillId: 'ppt-workflow',
      file: '/samples/unit07-slides.pptx',
      previewImage: null,
      durationSeconds: null,
      title: { en: 'x', ko: 'y' },
    };
    expect(sampleHref('ppt-workflow', 'en', [ready])).toBe('/en/samples#unit07-slides');
    expect(sampleHref('ppt-workflow', 'ko', [ready])).toBe('/ko/samples#unit07-slides');
  });

  it('gives no link when the matching sample is not ready', () => {
    // 未生成 = 不给入口，与 /samples 同一条纪律：宁可少一个链接，也不给坏链。
    const pending = {
      id: 'unit07-slides',
      skillId: 'ppt-workflow',
      file: null,
      previewImage: null,
      durationSeconds: null,
      title: { en: 'x', ko: 'y' },
    };
    expect(sampleHref('ppt-workflow', 'en', [pending])).toBeNull();
    // 样例存在但属于别的 skill 时同样不给。
    expect(sampleHref('audio-workflow', 'en', [pending])).toBeNull();
  });

  it('gives lesson-workflow no sample, in the real data', () => {
    // lesson-workflow 不在 SAMPLES 里（产物是 Markdown 文本不是可下载文件），
    // 所以它永远没有样例链接。这是对的，不为它伪造一个。
    expect(sampleHref('lesson-workflow', 'en', SAMPLES)).toBeNull();
  });

  it('keeps the sample link wired into the card template (N2, source guard)', () => {
    // 这一条是**源码结构**断言，不是行为断言，理由如下——写出来免得后来者
    // 误以为它在守行为。
    //
    // N2 是"删掉侧卡里 flow.card.sample 链接的渲染"。今天五个样例的 `file`
    // 全是 null，产物里一条卡内链接都没有，于是**删掉模板里那段 `<a>` 与
    // 今天构建出的 HTML 逐字节相同**（实测：dist 里 `[data-flow-card] a` 计数
    // 为 0）。上面两条测到了 `sampleHref` 这个**规则**，但规则对了、模板
    // 不调用它的话，产物仍然没有链接，而规则测试照绿。
    //
    // 行为级的证明需要用一个已就绪的样例真渲染一次组件。本沙箱做不到：
    // Astro 的 `experimental_AstroContainer` 需要 Astro 自带的 Vite 6，而
    // vitest 2.1 解析到的是根上的 Vite 5，两者不兼容且禁止新增依赖。
    // 所以这里退到源码层：断言卡片模板里存在一个由样例链接把关、并渲染
    // `flow.card.sample` 文案的 `<a>`。删掉那段即红。
    //
    // 样例一旦就绪，下面那条 `renders no dead link...` 会自动转为行为断言，
    // 届时这条就只是双保险。
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/FlowDiagram/FlowDiagram.astro'),
      'utf8',
    );
    expect(src, 'the card no longer resolves a sample href').toContain('sampleHrefFor(');
    expect(src, 'the card no longer renders the sample link').toContain("t('flow.card.sample')");
    // 链接必须留在 `sampleHrefFor(...)` 的守卫里，不能无条件渲染——无条件
    // 渲染会让没有样例的节点得到一个 href=undefined 的死链。
    expect(
      src,
      'the sample link is rendered unconditionally — a node without a sample gets a dead link',
    ).toMatch(/\{sampleHref && \(/);
  });

  it('renders no dead link in the built cards, whatever the data says', () => {
    // 与上一条互补：今天所有样例都未就绪，于是产物里一条卡内链接都不该有；
    // 样例一旦就绪，这条会随着数据自动放宽，而"链接指向 undefined"永远不许出现。
    const DEAD = [undefined, null, '', 'null', 'undefined'];
    const ready = SAMPLES.filter(isReady);
    for (const lang of ['en', 'ko']) {
      for (const card of home(lang).querySelectorAll('[data-flow-card]')) {
        const id = card.getAttribute('data-flow-card');
        const links = card.querySelectorAll('a');
        if (ready.some((s) => s.skillId === id)) continue;
        expect(links.length, `${lang}: card ${id} links to a sample that does not exist`)
          .toBe(0);
        for (const a of links) {
          expect(DEAD.includes(a.getAttribute('href'))).toBe(false);
        }
      }
    }
  });
});
