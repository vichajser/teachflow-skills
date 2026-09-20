import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { parse } from 'node-html-parser';
import { SITE } from '@/config/site';

/**
 * 站点级的措辞纪律。
 *
 * `security-claims.test.mjs` 只扫两张 `/security`，`legal.test.mjs` 只扫四张
 * `/legal/*`。首页、`/skills`、`/pricing` 以及今后新增的每一页都在这两张网之外
 * ——实测过：把 "SOC 2 certified" 和 "30-day refund via Agensi" 写进首页，
 * 131 个用例全绿。而首页恰恰是 Stripe 与 Agensi 审核员打开的第一页。
 *
 * 这张网按页面**渲染后的可见文本**扫（剥掉 script/style），不扫原始 HTML：
 * 扫 HTML 的话 Tailwind 的任意值（`w-[50%]`）和 data 属性会把百分号一类的
 * 规则打成一片误报，而那些字符根本不出现在读者眼前。
 */

const DIST = resolve(process.cwd(), 'dist');

function htmlFiles(dir = DIST) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * HTML 注释的**内容**（不含 `<!--` / `-->` 本身），按文件拼成一段文本。
 *
 * 为什么要单独扫：`visibleText()` 走 `structuredText`，注释**不在其中**。
 * 实测过——在 `PriceBlock.astro` 顶层插一条
 * `<!-- MUT7B: SOC 2 certified and penetration-tested by a third party. -->`，
 * 它进入 4 个生产页面，而全部测试仍然全绿、`verify-build.mjs` 仍然 exit 0。
 * 注释对读者不可见，但 `view-source` 与爬虫都能看到，Stripe / Agensi 审核员
 * 恰恰会看源码；"绝不声称第三方审计"这条纪律不能靠注释绕过去。
 *
 * 本轮已把 `src/**` 的 `<!-- -->` 全部改成 `{/* *\/}`（后者不进产物），
 * 但那只是清空了当下的存量，**挡不住将来有人重新写**。这条断言才是常驻的网。
 */
function htmlComments(file) {
  const raw = readFileSync(file, 'utf8');
  return [...raw.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]);
}

/** 页面上读者真正看得到的文字。 */
function visibleText(file) {
  return visibleRoot(file).structuredText;
}

/** 同上，但保留 DOM——按区块取证的断言需要祖先链，拍平的字符串给不了。 */
function visibleRoot(file) {
  const root = parse(readFileSync(file, 'utf8'));
  for (const el of root.querySelectorAll('script, style')) el.remove();
  return root.querySelector('body') ?? root;
}

/**
 * 读者会当成"一段话"来读的最小单位。
 *
 * 相邻的两张卡片是两个并列 `<article>`：读者不会把其中一张的天数读成另一张的
 * 条款。跨过这个边界去判定"同现"，判的是 DOM 顺序，不是读者的理解。
 */
const REGION = ['article', 'section', 'li', 'td', 'th', 'aside', 'figure', 'blockquote', 'dd'];

/** 包含 `el` 的最近区块（含自身）；没有则退回 `el` 本身。 */
function regionOf(el) {
  for (let cur = el; cur && cur.tagName; cur = cur.parentNode) {
    if (REGION.includes(cur.tagName.toLowerCase())) return cur;
  }
  return el;
}

/**
 * 把一个区块按标题切成读者眼中的小节。
 *
 * 光按 DOM 区块切不够：四张 `/legal/*` 整页只有**一个** `<article>`，切完还是
 * 整页，于是"Agensi 小节"与八百字外"直销小节"的 14 天又被判成同现。标题是
 * 读者实际感知的分界，`legal.test.mjs` 的 `section()` 用的也是这条线。
 */
function chunks(el) {
  const text = el.structuredText;
  const heads = el
    .querySelectorAll('h1, h2, h3, h4, h5, h6')
    .map((h) => h.structuredText.trim())
    .filter(Boolean);

  const cuts = [];
  let from = 0;
  for (const h of heads) {
    const at = text.indexOf(h, from);
    if (at >= 0) {
      cuts.push(at);
      from = at + h.length;
    }
  }
  if (!cuts.length) return [text];

  const out = cuts[0] > 0 ? [text.slice(0, cuts[0])] : [];
  cuts.forEach((at, i) => out.push(text.slice(at, cuts[i + 1] ?? text.length)));
  return out;
}

/**
 * 整页切成读者眼中的小节，供"同现"判定使用。
 *
 * 两层都需要：并列的 `<article>`（/pricing 的两张购买卡）靠区块分开，整页只有
 * 一个 `<article>` 的 `/legal/*` 靠标题分开。先取所有区块，再在每个区块内按
 * 标题细切；没有任何区块时退回整个 body 再按标题切。
 */
function readerSections(root) {
  const regions = root.querySelectorAll(REGION.join(', '));
  const outermost = regions.filter(
    (el) => !regions.some((other) => other !== el && other.querySelectorAll('*').includes(el)),
  );
  const bases = outermost.length ? outermost : [root];
  return bases.flatMap((el) => chunks(el));
}

/**
 * 天数/月数的写法。
 *
 * **`일` 后面不能跟 `\b`。** 这是本文件出过的一个真 bug：原先写的是
 * `(?:day|days|일)\b`，而 JS 的 `\b` 只认 `[A-Za-z0-9_]`，韩文字母不是单词
 * 字符——于是 `일\b` 要求"일 后面紧跟一个 ASCII 单词字符"，`7일 이내`、
 * `7일.`、`7일` 全都不匹配。这条断言的韩文一侧从写下那天起就是死的：
 * 它扫遍全站 26 张页面，对韩文永远返回"通过"。
 *
 * 一条永远为真的断言比没有断言更坏——它让人以为韩文页受着保护。下面那条
 * `matches the day counts it is meant to catch` 就是为了不再出现这种情况：
 * 先证明这个模式抓得住它该抓的字符串，再拿它去扫页面。
 *
 * 韩文一侧改用"数字打头"来定界，不在 `일` 后面设任何限制：`30일입니다`
 * （"是 30 天"）里的 `일` 后面正是韩文字母，用否定预查会把它一并漏掉——
 * 这恰恰是最常见的句式。而 `일요일`（星期天）不匹配的理由是它前面没有数字，
 * 不需要靠后视来排除。
 */
const DAY_COUNT = /\d+\s*(?:-|\s)?\s*(?:days?\b|일|개월)/i;

/**
 * 说不出证据的话。
 *
 * 前两组来自 spec §3：`_SPEC.md` 约束的是"本地运行、无网络、白名单命令"，
 * 没有任何一条能撑起"通过了第三方审计/认证"——Stripe 和 Agensi 都会去查。
 * 后三组是凭空数字：运行时间百分比、省下多少小时、多少老师在用。
 *
 * 刻意**没有**收进来的几类（都是产品事实，不是营销数字，逐条验过）：
 *   - `30 days`（日志留存期，/legal/privacy）
 *   - `45분 × 3차시` / `1분 분량` / `30초` （音频与课时设置，/skills）
 *   - 我们自己的 14 天退款窗口与 2 个工作日响应（/legal/refund，已由
 *     legal.test.mjs 按区块校验，且从不挂在 Agensi 名下）
 * 用 `\d+%` 或 `\d+ hours` 一类的泛式会把上面全部打成误报。
 */
const UNSUPPORTED = [
  {
    name: 'audit / certification claims',
    re: /third[- ]party (?:security )?audit|independently audited|penetration[- ]tested|pen[- ]tested|certified secure|SOC\s?2|ISO\s?27001|security certification|제3자 보안 감사|보안 인증을 받았/i,
  },
  {
    name: 'uptime or availability guarantees',
    re: /uptime|guaranteed availability|가동률/i,
  },
  {
    // `[^.!?\n]{0,40}` 限定在同一个句子内：跨句子匹配会把 "saved to your
    // computer …" 与邻句里任何一个时长数字凑成一条并不存在的"省时"宣称。
    // （曾经的实例是 /legal/delivery 的 "valid for 24 hours"；那句话已按
    // §6.8 改成指向 Agensi 条款，但句内限定这个设计本身仍然必要。）
    name: 'invented time-saved figures',
    re: /\bsaves?\b[^.!?\n]{0,40}?\d+\s*(?:hours?|minutes?)|\d+\s*(?:hours?|시간)[^.!?\n]{0,12}?(?:saved|절약)/i,
  },
  {
    name: 'invented adoption counts',
    re: /\d[\d,]{2,}\+?\s*(?:teachers|schools|users|선생님|학교|사용자)|(?:over|more than|이상의)\s+\d[\d,]*\s*(?:teachers|schools|users|선생님|학교)/i,
  },
];

describe('site-wide wording discipline', () => {
  const files = htmlFiles();

  it('builds pages to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('makes no claim the product cannot back up, on any page', () => {
    for (const file of files) {
      const text = visibleText(file);
      const where = relative(DIST, file);
      for (const { name, re } of UNSUPPORTED) {
        expect(re.test(text), `${where} makes an unsupported ${name}`).toBe(
          false,
        );
      }
    }
  });

  it('makes no unsupported claim inside an HTML comment, on any page', () => {
    // 与上面那条正文断言共用同一份 UNSUPPORTED 清单——两套词表会各自漂移，
    // 而"注释里可以说的话"与"正文里可以说的话"从来不该有差别。
    for (const file of files) {
      const where = relative(DIST, file);
      for (const comment of htmlComments(file)) {
        for (const { name, re } of UNSUPPORTED) {
          const hit = comment.match(re);
          expect(
            hit === null,
            `${where} makes an unsupported ${name} inside an HTML comment: ${JSON.stringify(hit?.[0])}`,
          ).toBe(true);
        }
      }
    }
  });

  it('matches the day counts it is meant to catch, in both languages', () => {
    // 守卫自身的守卫。上面那条断言扫的是产物，产物里没有的写法它永远不会
    // 报错——所以"它能不能匹配"必须单独证，不能靠它在页面上没报错来推断。
    // 韩文的四个例子正是曾经全部漏掉的那些。
    for (const s of [
      '7 days',
      '14-day',
      '30 days',
      '7일',
      '7일 이내',
      '30일입니다',
      '3개월',
    ]) {
      expect(DAY_COUNT.test(s), `DAY_COUNT fails to match ${JSON.stringify(s)}`).toBe(
        true,
      );
    }
    // 反例：日期与序号不是"天数"。
    for (const s of ['2026-09-20', '제17조', '일요일']) {
      expect(DAY_COUNT.test(s), `DAY_COUNT wrongly matches ${JSON.stringify(s)}`).toBe(
        false,
      );
    }
  });

  it('never attributes a refund day count to Agensi, on any page', () => {
    // Agensi 自己的 /terms §5.5 写 30 天、/stripe-terms 写 14 天，两者矛盾。
    // 我们只给链接、不复述天数；我们自己的 14 天窗口可以写，但不能挂在
    // Agensi 名下。规则因此是"Agensi 与天数同现"，不是"出现天数"。
    //
    // "同现"按**区块**判，不按字符距离判。原先取前后各 120 字符，跨得过
    // `</article><article>` 边界：/pricing 上两张并列的购买卡片——一张写
    // Agensi 不含天数，另一张写"영업일 기준 2일"（发货时限，与退款无关）
    // 且不含 Agensi——被拍平成一个字符串后凑成了一条并不存在的违规。
    // 读者不会把 A 卡的天数读成 B 卡的条款，断言也不该。
    for (const file of files) {
      const where = relative(DIST, file);
      for (const text of readerSections(visibleRoot(file))) {
        if (!/Agensi/i.test(text)) continue;
        expect(
          DAY_COUNT.test(text) && /refund|환불/i.test(text),
          `${where} states a refund day count next to Agensi: ${JSON.stringify(text.replace(/\s+/g, ' ').slice(0, 240))}`,
        ).toBe(false);
      }
    }
  });

  it('writes the price only as SITE.price.display, on any page', () => {
    // PriceBlock 之外任何地方手写价格都会漂移：裸币种符号、少一位小数、
    // 币种代码写在数字后面，全部禁止——spec §10.1 要求币种代码在前、两位小数。
    //
    // 金额从 `SITE.price` **算出来**，不写死。此前这里硬编码着当时的价格，
    // 于是改价时这一条变成"守着一个已经不存在的数字"——实测：改 site.ts 之后
    // 本例仍然全绿，因为产物里再没有旧数字可匹配，循环跑零次。一个在它要守的
    // 东西变了之后自动失效、却仍然显示通过的断言，比没有这条断言更坏。
    const { amount, currency, display } = SITE.price;
    // 例：`29.90` → `/29[.,]90?/`：允许买家常见的逗号小数点与吞掉末位零的写法，
    // 这两种都是要抓的错写法，不是要放过的。
    const [whole, cents] = amount.split('.');
    const loose = new RegExp(`${whole}[.,]${cents.replace(/0$/, '0?')}`, 'g');

    for (const file of files) {
      const text = visibleText(file);
      const where = relative(DIST, file);
      expect(
        /\$\s?\d/.test(text),
        `${where} writes a price with a bare $ sign`,
      ).toBe(false);
      for (const m of text.matchAll(loose)) {
        const before = text.slice(Math.max(0, m.index - currency.length - 1), m.index);
        expect(
          before.endsWith(`${currency} `) && m[0] === amount,
          `${where} writes the price as ${JSON.stringify(before + m[0])}, not "${display}"`,
        ).toBe(true);
      }
    }
  });
});
