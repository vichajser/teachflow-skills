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

/**
 * 每张卡的内容必须绑定到**它自己那个节点**（B 组，评审发现 3）。
 *
 * 这组是本轮最要紧的补强。上面那些断言（卡数 = 6、键存在于两份字典、卡里
 * ≥4 个 `<p>`、韩文卡含谚文）**合起来也绑不住"哪张卡渲染了哪个节点的哪条
 * 内容"**——评审实测三条变异 194/194 全绿存活：
 *
 *   · 把某节点的 needsKey / makesKey 互换；
 *   · 让六个节点全指向 FLOW_NODES[0] 的键；
 *   · 让韩文卡渲染英文内容。
 *
 * 解法是逐卡逐语言取到该节点的字典值做**逐字等值**比较。谚文那条自然被
 * "ko 卡等于 ko 字典值"一并杀掉：英文值里没有谚文，对不上。
 */
describe('every card is bound to its own node, in its own language', () => {
  const DICTS = { en, ko };
  /** 取该节点在该语言下两条真实文案；节点数据是唯一真相源 */
  const expected = (node, lang) => ({
    needs: DICTS[lang][node.needsKey],
    makes: DICTS[lang][node.makesKey],
  });
  /** 卡片里那一行的文本，压掉模板缩进带来的空白 */
  const textOfAttr = (card, attr) => {
    const el = card.querySelector(`[${attr}]`);
    expect(el, `card has no [${attr}] anchor`).not.toBeNull();
    return el.structuredText.replace(/\s+/g, ' ').trim();
  };

  it('renders each card needs line exactly equal to that node dictionary value', () => {
    for (const lang of ['en', 'ko']) {
      const root = home(lang);
      for (const node of FLOW_NODES) {
        const card = root.querySelector(`[data-flow-card="${node.id}"]`);
        expect(card, `${lang}: no card for ${node.id}`).not.toBeNull();
        expect(
          textOfAttr(card, 'data-flow-card-needs'),
          `${lang}: card ${node.id} needs line is not its own ${node.needsKey}`,
        ).toBe(expected(node, lang).needs);
      }
    }
  });

  it('renders each card makes line exactly equal to that node dictionary value', () => {
    for (const lang of ['en', 'ko']) {
      const root = home(lang);
      for (const node of FLOW_NODES) {
        const card = root.querySelector(`[data-flow-card="${node.id}"]`);
        expect(card, `${lang}: no card for ${node.id}`).not.toBeNull();
        expect(
          textOfAttr(card, 'data-flow-card-makes'),
          `${lang}: card ${node.id} makes line is not its own ${node.makesKey}`,
        ).toBe(expected(node, lang).makes);
      }
    }
  });

  it('does not let one language dictionary serve the other', () => {
    // 上面两条已经隐含语言正确性（ko 卡必须等于 ko 字典值）。这里再把两种语言
    // 的值本身对立起来：若某节点的两条文案在两语言中恰好相同，语言维度就塌了，
    // 上面那两条也就同时失去鉴别力。今天没有这种节点，留一条防将来。
    for (const node of FLOW_NODES) {
      expect(
        en[node.needsKey] === ko[node.needsKey] && en[node.makesKey] === ko[node.makesKey],
        `${node.id} reads identically in both languages — the language assertion is vacuous`,
      ).toBe(false);
    }
  });

  it('renders each node id against the dictionary key that id names (closure)', () => {
    // 上一条有个盲点，这条专门补它：期望值取的是 `DICTS[lang][node.needsKey]`，
    // **指针与渲染同源**。于是"把某节点的 needsKey/makesKey 互换"或"让六个节点
    // 全指向 FLOW_NODES[0] 的键"这两种数据层错绑，会让渲染与期望一起移动、
    // 永远相等——产物上完全隐形（评审发现 3 点的正是这类存活变异）。
    // 这里把期望的键**由节点 id 推出**（`flow.needs.<id>` / `flow.makes.<id>`），
    // 不再经过 `node.needsKey`，指针指错时渲染内容就对不上 id 应有的内容。
    // 命名约定本就是 `flow.{needs,makes}.<id>`：`nodes.ts` 逐字写出而非拼接，
    // 只是为了 tsc 能挡下不存在的键，不是换了一套命名。
    const DICTS = { en, ko };
    const textOfAttr = (host, attr) => {
      const el = host.querySelector(`[${attr}]`);
      expect(el, `host has no [${attr}] anchor`).not.toBeNull();
      return el.structuredText.replace(/\s+/g, ' ').trim();
    };
    for (const lang of ['en', 'ko']) {
      const root = home(lang);
      for (const node of FLOW_NODES) {
        const card = root.querySelector(`[data-flow-card="${node.id}"]`);
        expect(
          textOfAttr(card, 'data-flow-card-needs'),
          `${lang}: card ${node.id} needs does not match flow.needs.${node.id}`,
        ).toBe(DICTS[lang][`flow.needs.${node.id}`]);
        expect(
          textOfAttr(card, 'data-flow-card-makes'),
          `${lang}: card ${node.id} makes does not match flow.makes.${node.id}`,
        ).toBe(DICTS[lang][`flow.makes.${node.id}`]);

        const row = root.querySelector(`[data-flow-list-item="${node.id}"]`);
        expect(
          textOfAttr(row, 'data-flow-list-needs'),
          `${lang}: list row ${node.id} needs does not match flow.needs.${node.id}`,
        ).toBe(DICTS[lang][`flow.needs.${node.id}`]);
        expect(
          textOfAttr(row, 'data-flow-list-makes'),
          `${lang}: list row ${node.id} makes does not match flow.makes.${node.id}`,
        ).toBe(DICTS[lang][`flow.makes.${node.id}`]);
      }
    }
  });
});

/**
 * A 组的 `<ol data-flow-list>` 现在是**无障碍树里唯一结构来源**（SVG 整体
 * aria-hidden），所以它同样要逐行绑定到自己那个节点——绑错了比侧卡绑错更严重，
 * 因为读屏用户只有这一处。断言形状与上面的侧卡组对称。
 */
describe('every list row is bound to its own node, in its own language', () => {
  const DICTS = { en, ko };
  const expected = (node, lang) => ({
    needs: DICTS[lang][node.needsKey],
    makes: DICTS[lang][node.makesKey],
  });
  const textOfAttr = (row, attr) => {
    const el = row.querySelector(`[${attr}]`);
    expect(el, `list row has no [${attr}] anchor`).not.toBeNull();
    return el.structuredText.replace(/\s+/g, ' ').trim();
  };

  it('carries the same needs/makes as the card for every node, both locales', () => {
    for (const lang of ['en', 'ko']) {
      const root = home(lang);
      expect(
        root.querySelectorAll('[data-flow-list]').length,
        `${lang} has no accessible list`,
      ).toBe(1);
      for (const node of FLOW_NODES) {
        const row = root.querySelector(`[data-flow-list-item="${node.id}"]`);
        expect(row, `${lang}: no list row for ${node.id}`).not.toBeNull();
        expect(
          textOfAttr(row, 'data-flow-list-needs'),
          `${lang}: list row ${node.id} needs is not its own ${node.needsKey}`,
        ).toBe(expected(node, lang).needs);
        expect(
          textOfAttr(row, 'data-flow-list-makes'),
          `${lang}: list row ${node.id} makes is not its own ${node.makesKey}`,
        ).toBe(expected(node, lang).makes);
      }
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
    //
    // 守卫里的局部变量在修复轮 1 从 `sampleHref` 改名为 `href`（评审发现 11：
    // 原名遮蔽了文件顶部 import 的 `sampleHref` 函数，两者类型不同）。正则同步
    // 改成 `{href && (`——不改的话它会永远匹配不上，变成一条**静默失效**的守卫，
    // 而它守的"链接不得无条件渲染"这个意图必须保住。
    expect(
      src,
      'the sample link is rendered unconditionally — a node without a sample gets a dead link',
    ).toMatch(/\{href && \(/);
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

/**
 * 空内容守卫只能靠**源码结构**断言（裁决 2 + 评审发现 13）。
 *
 * 和上面 N2 那条同一种形状，理由也一样：今天六个节点的 needsKey / makesKey
 * 两条都有值，产物里根本不出现"空行"分支——**把两处 `{needs.length > 0 && …}`
 * 整个删掉，构建出的 HTML 与保留守卫逐字节相同**，行为断言无从分辨。
 * 行为级的证明需要构造一个"某节点键取不到值"的渲染，本沙箱做不到
 * （见 N2 那条对 AstroContainer / Vite 版本冲突的说明）。
 *
 * 所以退到源码层：断言模板里存在"以 `textOf(...)` 的取值长度把关、并渲染对应
 * 标签键"的守卫。删掉包裹即红。两处都要守——侧卡（视觉）与 `<ol>`（无障碍树
 * 唯一来源，A 组之后更需要）。
 */
describe('empty needs/makes are skipped along with their label (source guard)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/components/FlowDiagram/FlowDiagram.astro'),
    'utf8',
  );

  it('guards the card needs and makes blocks on a non-empty value', () => {
    expect(src, 'the card needs block is not guarded on its value')
      .toMatch(/\{needs\.length > 0 && \(/);
    expect(src, 'the card makes block is not guarded on its value')
      .toMatch(/\{makes\.length > 0 && \(/);
  });

  it('guards the accessible list needs and makes blocks on a non-empty value', () => {
    // 列表行与侧卡用的是同一对守卫形状。两处都数一遍，避免"只给侧卡留守卫、
    // 列表那份被顺手删掉"——列表是无障碍树的唯一来源，它漏了更严重。
    const guarded = src.match(/\{(needs|makes)\.length > 0 && \(/g) ?? [];
    expect(
      guarded.length,
      `expected 4 guarded needs/makes blocks (card + list), found ${guarded.length}`,
    ).toBe(4);
  });

  it('keeps the empty-guard tied to the shared textOf lookups, not to output length', () => {
    // 守卫若从 `textOf(node.needsKey)` 退化成 `node.needs.length`（那是空的
    // 上游产物扩展名数组，五个节点全为空），今天所有卡会被整段跳过而产物里
    // 一张卡都没有 needs 行——但"卡数 = 6"依然绿。这里钉住取值来源。
    expect(src, 'the card no longer reads needs through textOf').toMatch(
      /const needs = textOf\(node\.needsKey\)/,
    );
    expect(src, 'the card no longer reads makes through textOf').toMatch(
      /const makes = textOf\(node\.makesKey\)/,
    );
  });
});
