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
  const root = parse(readFileSync(file, 'utf8'));
  for (const el of root.querySelectorAll('script, style')) el.remove();
  return (root.querySelector('body') ?? root).structuredText;
}

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

  it('never attributes a refund day count to Agensi, on any page', () => {
    // Agensi 自己的 /terms §5.5 写 30 天、/stripe-terms 写 14 天，两者矛盾。
    // 我们只给链接、不复述天数；我们自己的 14 天窗口可以写，但不能挂在
    // Agensi 名下。规则因此是"Agensi 与天数同现"，不是"出现天数"。
    for (const file of files) {
      const text = visibleText(file);
      const where = relative(DIST, file);
      for (const m of text.matchAll(/Agensi/gi)) {
        const window = text.slice(
          Math.max(0, m.index - 120),
          m.index + 120,
        );
        expect(
          /\d+\s*(?:-|\s)?\s*(?:day|days|일)\b/i.test(window) &&
            /refund|환불/i.test(window),
          `${where} states a refund day count next to Agensi: ${JSON.stringify(window)}`,
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
