import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { parse } from 'node-html-parser';

/**
 * spec §4.5 pins the whole site's motion budget at four items. This file guards
 * the pieces Task 12 shipped: the hero fan, the sample-card hover, the gradient
 * border, the Korean type scale and the grid texture, plus the quiet-zone rule
 * and the two permitted micro-animations' reduced-motion behaviour. The counter
 * (item 4) is not built yet; the flow diagram is guarded by no-js.test.mjs.
 *
 * Assertions read the *built artifact*, in the shape it actually takes:
 *   - HeroFan's `<style>` is inlined into a single `<style>` block on each home
 *     page (~940 bytes), selectors suffixed `[data-astro-cid-…]`. It is NOT in
 *     `_astro/*.css`, so it must be read from the page, not the bundle.
 *   - global.css rules (texture, edge-gradient, Korean tokens) are in the
 *     bundle, minified.
 * Component structure and class names were not altered to make anything easier
 * to select — where a selector is awkward, the reading happens in this file.
 */

/** Read a path relative to `dist/`. */
const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');

/** Read a cwd-relative path (what fast-glob returns). */
const readFromCwd = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

const COMPLIANCE = ['dist/*/pricing/index.html', 'dist/*/legal/**/index.html'];
const HOME = ['en/index.html', 'ko/index.html'];

/** All home-page inline `<style>` text, concatenated. */
function heroCss(file) {
  return parse(read(file))
    .querySelectorAll('style')
    .map((el) => el.textContent)
    .join('\n');
}

/** The site-wide stylesheet(s), concatenated and minified. */
const bundleCss = () =>
  fg
    .sync('dist/**/*.css')
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n');

/**
 * Inner text of the first `{…}` block opening at or after the end of `needle`,
 * with brace matching so a rule nested inside a media query / keyframes stays
 * intact. `needle` may or may not carry its own `{` — searching from its last
 * character handles both. Returns null when `needle` is absent, which is itself
 * the failure mode the M1/M3/M7/M8 mutations produce.
 */
function blockAfter(css, needle) {
  const at = css.indexOf(needle);
  if (at === -1) return null;
  const open = css.indexOf('{', at + needle.length - 1);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
}

/** Value of one declaration inside a declaration block, or null. */
function declaration(block, prop) {
  if (block === null) return null;
  const m = block.match(new RegExp(`(?:^|[;{])${prop}:([^;}]*)`));
  return m ? m[1].trim() : null;
}

/**
 * 页面里**含 `.hero-fan__leaf` 规则的那个** reduced-motion 块，找不到返回 null。
 *
 * 取代原先的 `blockAfter(css, '@media(prefers-reduced-motion:reduce)')`——那个写法
 * 取的是**第一个** RM 块。今天首页恰好只有 1 处（偏移 1160），**余量为零**：
 * 任何人在它之前再加一个 RM 块（另一个组件的内联样式、一条新的兜底），
 * 这条断言要么去校验错块、要么报出"HeroFan 没有 reduced-motion 块"这种
 * **误导性**失败信息，而真正的块好端端地在后面。按选择器定位没有这个问题。
 */
function heroLeafRmBlock(css) {
  const NEEDLE = '@media(prefers-reduced-motion:reduce)';
  let from = 0;
  for (;;) {
    const at = css.indexOf(NEEDLE, from);
    if (at === -1) return null;
    const media = blockAfter(css.slice(at), NEEDLE);
    if (media !== null && media.includes('.hero-fan__leaf')) return media;
    from = at + NEEDLE.length;
  }
}

const norm = (s) => (s ?? '').replace(/\s+/g, '');
const classTokens = (el) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

describe('motion budget', () => {
  it('runs no animation on the compliance pages', async () => {
    // 读 `<body>` 的**属性**，不是在 HTML 原文里找子串。原先的
    // `expect(html).toContain('data-quiet')` 是永真的：PriceBlock 的注释里就写着
    // "/pricing is a `data-quiet` page"，于是 /pricing 即便丢掉属性也照样绿，
    // 而 /legal/* 没有这个词，同一行断言对一个页面有效、对另一个完全失明。
    //
    // 断言的是**属性存在**，不是等于某个值：`BaseLayout.astro` 写的是
    // `data-quiet={variant === 'legal' ? '' : undefined}`，产物里是裸属性
    // `<body data-quiet class=…>`（实测 dist/en/pricing/index.html）。
    // 这与 global.css 的 `body[data-quiet]` 选择器同形——存在即生效，值无关。
    const files = await fg(COMPLIANCE);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const body = parse(readFromCwd(file)).querySelector('body');
      expect(body, `${file} has no <body>`).not.toBeNull();
      expect(body.hasAttribute('data-quiet'), `${file} should be quiet`).toBe(true);
    }

    // 反向对照：营销页**必须没有**这个属性。少了这一半，一个"给所有 <body>
    // 都加 data-quiet"的改动会让上面那组断言全绿却把静音区扩散到全站。
    for (const file of HOME) {
      const body = parse(read(file)).querySelector('body');
      expect(body.hasAttribute('data-quiet'), `${file} should not be quiet`).toBe(false);
    }
  });

  it('fans out six leaves on each home page', async () => {
    // 数渲染出的 DOM 元素，而不是 bundle 里的选择器次数——HeroFan 的样式是
    // 内联在页面里的。删掉扇形或改小 SKILLS 都会变红。
    for (const file of HOME) {
      const root = parse(read(file));
      const leaves = root.querySelectorAll('.hero-fan__leaf');
      expect(leaves, `${file} fans out ${leaves.length} leaves, expected 6`).toHaveLength(6);
    }
  });

  it('keeps the fan off the compliance pages', async () => {
    const files = await fg(COMPLIANCE);
    for (const file of files) {
      expect(readFileSync(resolve(file), 'utf8'), `${file} ships the hero fan`)
        .not.toContain('hero-fan');
    }
  });
});

describe('hero fan plays once (M1, M2)', () => {
  it('animates the leaves with fan-out, forwards, and never infinite', () => {
    // M1: `animation:` 整条删掉 → declaration() 得 null，首条断言红。
    // M2: `forwards` 改成 `infinite` → 第二条与第三条同时红。
    for (const file of HOME) {
      const css = heroCss(file);
      const leaf = blockAfter(css, '.hero-fan__leaf');
      const animation = declaration(leaf, 'animation');

      expect(animation, `${file}: .hero-fan__leaf declares no animation (M1)`).not.toBeNull();
      expect(animation, `${file}: the fan no longer names the fan-out keyframes`)
        .toContain('fan-out');
      expect(animation, `${file}: the fan does not use \`forwards\` — it may replay or reset`)
        .toContain('forwards');
      expect(css, `${file}: the fan loops (\`infinite\`) — spec §4.5 says play once`)
        .not.toContain('infinite');
    }
  });
});

describe('hero fan reduced-motion end state (M3)', () => {
  it('stops the animation and sits exactly at the keyframe end state', () => {
    // 全局兜底只是把时长压到 0.01ms（仍在动），组件自己这条 `animation:none`
    // 才是真正的"不动"。所以不能只断言页面里有 prefers-reduced-motion 字样：
    // 必须在**组件内联样式**里找到它自己的那条规则，并且终态 transform 与
    // keyframe 的 to 完全一致（零位移）。M3 删掉整块 → blockAfter 得 null，红。
    for (const file of HOME) {
      const css = heroCss(file);
      const media = heroLeafRmBlock(css);
      expect(media, `${file}: HeroFan has no prefers-reduced-motion block (M3)`).not.toBeNull();

      const rmRule = blockAfter(media, '.hero-fan__leaf');
      expect(rmRule, `${file}: the reduced-motion block does not target the leaves`).not.toBeNull();
      expect(declaration(rmRule, 'animation'), `${file}: reduced motion still animates`)
        .toBe('none');

      const keyframes = blockAfter(css, '@keyframes fan-out');
      const endTransform = declaration(blockAfter(keyframes, 'to'), 'transform');
      expect(endTransform, `${file}: the fan-out keyframes have no end transform`).not.toBeNull();
      expect(
        norm(declaration(rmRule, 'transform')),
        `${file}: reduced-motion transform differs from the keyframe end state (displacement)`,
      ).toBe(norm(endTransform));
    }
  });
});

describe('sample card hover lift (M4, M5)', () => {
  it('lifts on hover through a single transition', () => {
    // M4: 删掉 hover 位移类 → 第一/第二条红。
    // M5: 退回 `transition-transform transition-shadow`（两条工具类都写
    // transition-property，后者覆盖前者，位移变硬跳）→ 第三条红；两条正好
    // 各写一个属性，所以"恰好一个 transition 工具类"是这条的判别式。
    for (const file of ['en/samples/index.html', 'ko/samples/index.html']) {
      const root = parse(read(file));
      const cards = root.querySelectorAll('article');
      expect(cards.length, `${file} has no cards`).toBeGreaterThan(0);

      for (const card of cards) {
        const tokens = classTokens(card);
        expect(tokens, `${file}: the card does not lift on hover (M4)`)
          .toContain('hover:-translate-y-1');
        expect(tokens.join(' '), `${file}: the card has no hover shadow`).toContain(
          'hover:shadow-[0_12px_40px_rgba(46,125,255,0.18)]',
        );

        const transitions = tokens.filter((t) => /^transition(-\w+)?$/.test(t));
        expect(
          transitions,
          `${file}: expected exactly one \`transition\` utility, got ${JSON.stringify(transitions)} (M5)`,
        ).toEqual(['transition']);
      }
    }
  });
});

describe('gradient border on its consumer (M6)', () => {
  it('keeps background-clip: padding-box and takes no border-* colour class', async () => {
    // M6: 给 PriceBlock 加回 `border border-border` → 第二条红（底色类会压掉
    // 渐变）。`.edge-gradient` 自己声明的 `border: 1px solid transparent` 也要求
    // 使用者不得再叠一个 border 颜色类。
    const css = bundleCss();
    const rule = blockAfter(css, '.edge-gradient{');
    expect(rule, 'the .edge-gradient rule is gone').not.toBeNull();
    expect(declaration(rule, 'background-clip'), 'bg-surface would cover the ::after')
      .toBe('padding-box');

    const files = await fg('dist/**/index.html');
    let consumers = 0;
    for (const file of files) {
      const root = parse(readFromCwd(file));
      for (const el of root.querySelectorAll('*')) {
        if (!classTokens(el).includes('edge-gradient')) continue;
        consumers += 1;
        const colourBorders = classTokens(el).filter((t) => /^border-[a-z]/.test(t));
        expect(
          colourBorders,
          `${file}: .edge-gradient consumer also sets ${JSON.stringify(colourBorders)} (M6)`,
        ).toEqual([]);
      }
    }
    expect(consumers, 'nothing uses .edge-gradient — the gradient border is dead').toBeGreaterThan(0);
  });
});

describe('korean type scale (M7)', () => {
  it('drops the step by overriding the text tokens, not with an h1 selector', () => {
    // M7: 退回 brief 那个错的 `html:lang(ko) h1{font-size:2.75rem}` → 第一条红
    // （token 覆盖没了）、第二条红（坏选择器出现）。改 token 才能让 LegalLayout
    // 的 text-3xl 与 404 的 text-4xl 一并**按比例缩**，而不是被拍平到同一号。
    const css = bundleCss();
    const ko = blockAfter(css, 'html:lang(ko)');
    expect(ko, 'the Korean override block is gone').not.toBeNull();
    for (const token of ['--text-5xl:2.75rem', '--text-4xl:2rem', '--text-3xl:1.75rem', '--text-2xl:1.375rem']) {
      expect(norm(ko), `the Korean scale drops a step via ${token}`).toContain(norm(token));
    }
    expect(css, 'a raw html:lang(ko) h1 selector flattens the scale instead of scaling it')
      .not.toMatch(/html:lang\(ko\)\s+h1/);
  });
});

describe('grid texture (M8)', () => {
  it('paints the radial grid with a downward mask', () => {
    // M8: 删掉整块 body::before → blockAfter 得 null，红。
    const rule = blockAfter(bundleCss(), 'body:before');
    expect(rule, 'the grid texture (body::before) is gone (M8)').not.toBeNull();
    expect(declaration(rule, 'background-image'), 'the texture has no grid').toContain(
      'radial-gradient',
    );
    expect(declaration(rule, 'mask-image'), 'the texture no longer fades downward').toContain(
      'linear-gradient',
    );
  });
});

describe('negative-z textures are not painted over (fix round 1)', () => {
  it('leaves the body without an opaque background', () => {
    // 网格纹理与渐变描边是根层叠上下文里 z-index:-1 的伪元素：按 CSS 2.1 附录 E
    // 第 3 步绘制，body 的背景在第 4 步——不透明背景会把它们整片盖掉，且祖先链
    // 上没有任何元素建立层叠上下文。所以 body 不得带不透明背景类。把 bg-void
    // 加回去必须变红。html 已经在画同一个 --color-void，视觉基线不变。
    const OPAQUE = /^bg-(void|surface|raised|border)$|^bg-\[/;
    for (const file of ['index.html', ...HOME]) {
      const body = parse(read(file)).querySelector('body');
      expect(body, `${file} has no <body>`).not.toBeNull();
      const offenders = classTokens(body).filter((t) => OPAQUE.test(t));
      expect(
        offenders,
        `${file}: body paints an opaque background ${JSON.stringify(offenders)} — it covers the z-index:-1 textures`,
      ).toEqual([]);
    }
  });

  it('still paints the page background on html', () => {
    // 上一条之所以安全：html 在画同一个颜色。删掉它页面会变透明（默认白）。
    expect(bundleCss(), 'html lost its --color-void background').toMatch(
      /html\{[^}]*background-color:var\(--color-void\)/,
    );
  });
});
