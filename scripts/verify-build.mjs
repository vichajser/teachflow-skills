#!/usr/bin/env node
/**
 * 部署前的构建闸门。跑在 `dist/` 上而非源码上——Stripe 审核员看到的是 `dist/`。
 *
 * 只依赖 `fast-glob` + `node-html-parser`（两者都在 `dependencies`），因此可以
 * 在只装了生产依赖的部署机上单独跑（R-8）。需要 Astro/Tailwind/Vitest 的完整
 * 链换名为 `verify:all`，两条命令的分工写在 `deploy/README.md`。
 *
 * 域名从 `astro.config.mjs` 读（R-9），脚本里不得出现域名字面量——本文件底部
 * 有一条自扫描守着这条纪律，防止后来的人把域名硬编码回来。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, posix } from 'node:path';
import fg from 'fast-glob';
import { parse } from 'node-html-parser';
import { scanAriaHiddenFocus } from './aria-hidden-scan.mjs';

const ROOT = process.cwd();
const DIST = resolve(ROOT, 'dist');
const LOCALES = ['en', 'ko'];
const failures = [];
const warnings = [];

const fail = (check, detail) => failures.push(`${check}: ${detail}`);

// ---- 配置读取：域名只从两个允许的文件解析 -----------------------------------
//
// `astro.config.mjs` 与 `src/config/site.ts` 是占位域名仅有的两个合法落点
// （Global Constraints）。这里不 import astro.config.mjs——那会牵出 astro 与
// @tailwindcss/vite，生产依赖环境没有它们。改为文本解析，且解析失败时**响亮
// 失败**，绝不静默返回空串让下游检查空转通过。
const grab = (file, key) => {
  const src = readFileSync(resolve(ROOT, file), 'utf8');
  const m = src.match(new RegExp(`^\\s*${key}:\\s*['"]([^'"]+)['"]`, 'm'));
  return m ? m[1] : null;
};
const ASTRO_SITE = grab('astro.config.mjs', 'site'); // R-9：从 astro.config.mjs 读 site
const CONFIG_DOMAIN = grab('src/config/site.ts', 'domain'); // 交叉核对用
// 全站唯一合法价格写法。与上面同款文本解析：`site.ts` 里 `display` 只出现一次。
const PRICE_DISPLAY = grab('src/config/site.ts', 'display');
const PRICE_AMOUNT = grab('src/config/site.ts', 'amount');
// 带货币符号（含 HTML 实体）的错误写法。整数部分取自 `amount`，小数部分可选：
// `$29`、`$29.9`、`$29.90` 三种形态都要抓到。
const DOLLAR_PRICE = new RegExp(
  String.raw`(?:\$|&#0*36;|&#[xX]0*24;|&dollar;)\s*${(PRICE_AMOUNT ?? '').split('.')[0]}(?:\.\d{1,2})?\b`,
  'i',
);

if (!ASTRO_SITE) fail('domain', 'could not read `site` from astro.config.mjs');
if (!CONFIG_DOMAIN) fail('domain', 'could not read `domain` from src/config/site.ts');
if (!PRICE_DISPLAY) fail('price-notation', 'could not read `display` from src/config/site.ts');
if (!PRICE_AMOUNT) fail('price-notation', 'could not read `amount` from src/config/site.ts');
// 两处独立解析的结果必须一致：若有人只改了一处（或把域名硬编码进第三个文件），
// 产物里的 canonical 会与配置对不上——这条在下面按页面逐条抓。
if (ASTRO_SITE && CONFIG_DOMAIN && ASTRO_SITE !== CONFIG_DOMAIN) {
  fail(
    'domain-drift',
    `astro.config.mjs site=${ASTRO_SITE} but src/config/site.ts domain=${CONFIG_DOMAIN}`,
  );
}

/**
 * 全量 HTML，含 `dist/404.html`——全站唯一一个**不叫** `index.html` 的页面。
 * `pages`（`**\/index.html`）会静默漏掉它，而它是 Caddy `handle_errors` 的
 * 兜底、且（实测）本就带着完整页脚，理应受 canonical / dead-link / public-access /
 * entity-details 四条检查。S-8。
 */
const allHtml = (await fg('**/*.html', { cwd: DIST })).sort();
const pages = (await fg('**/index.html', { cwd: DIST })).sort();
if (pages.length === 0) fail('build', 'dist/ contains no pages — run `npm run build` first');

/**
 * `dist/index.html` 是根路径的 meta-refresh 跳转壳（`src/pages/index.astro`），
 * 不是内容页：只有 refresh + canonical→/en + title + 一个 <a>，刻意保持最小。
 * 它没有页脚、没有 hreflang，**这是设计**（裁决 1）。照 `tests/build/seo.test.mjs`
 * 的 `REDIRECT_SHELL` 写法排除，别另发明一套。
 */
const REDIRECT_SHELL = 'index.html';

/**
 * 两个本地化 404 页（`en/404`、`ko/404`）同样没有 hreflang——R-50 前半在
 * Task 11 已把错误页从语言互指图里摘除（错误页不进 sitemap，也不该声称自己是
 * 某语言的常规入口）。所以 hreflang 检查的适用面是「跳转壳与错误页之外」。
 * hreflang **不**扩到 `allHtml`：`dist/404.html` 是语言中立兜底，同样不该有。
 */
const isErrorPage = (p) => /(^|\/)404\/index\.html$/.test(p);
const CONTENT_PAGES = pages.filter((p) => p !== REDIRECT_SHELL && !isErrorPage(p));

// ---- 1. 两语页面数量一致，无缺页 -------------------------------------------
// 保持用 `pages`：locale-parity 说的是「两语的页面目录」，语言中立兜底
// `dist/404.html` 不参与这个对称关系。
const byLocale = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    pages.filter((p) => p.startsWith(`${l}/`)).map((p) => p.slice(l.length + 1)),
  ]),
);
const [en, ko] = [new Set(byLocale.en), new Set(byLocale.ko)];
for (const page of en) if (!ko.has(page)) fail('locale-parity', `ko/${page} missing`);
for (const page of ko) if (!en.has(page)) fail('locale-parity', `en/${page} missing`);

// ---- 2. canonical：存在、属本站、自指、无尾斜杠 ----------------------------
// 遍历面是 `allHtml`（含 `dist/404.html`）。
const CANONICAL_EXEMPT = new Map([
  // 跳转壳指向默认语言；它不是「自己」（自己会在瞬间跳走）。裁决 1。
  ['index.html', `${ASTRO_SITE ?? ''}/en`],
  // 根级语言中立 404 兜底指向英文错误页，这是设计（它没有自己的 URL）。
  ['404.html', `${ASTRO_SITE ?? ''}/en/404`],
]);

// 由 dist 相对路径推导该页应有的 canonical 路径（无域、无尾斜杠）。
//   `en/pricing/index.html` → `/en/pricing`
//   `en/404/index.html`     → `/en/404`
//   `404.html`              → `/404`（但它被豁免，见上）
const canonicalPathOf = (page) =>
  page.replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '');

for (const page of allHtml) {
  const html = parse(readFileSync(join(DIST, page), 'utf8'));
  const canonical = html.querySelector('link[rel="canonical"]');
  if (!canonical) {
    fail('canonical', `${page} has none`);
    continue;
  }
  const canonicalHref = canonical.getAttribute('href') ?? '';
  if (!ASTRO_SITE) continue; // 域名字面量已在上面报过，别重复刷屏

  // (a) 必须指向本站配置域名：域名漂移到第三个文件、或换域名时只改了
  // astro.config.mjs 而漏了别处，都会以“canonical 指向陌生主机”现形。
  if (!canonicalHref.startsWith(`${ASTRO_SITE}/`) && canonicalHref !== ASTRO_SITE) {
    fail('canonical', `${page} canonical points at ${canonicalHref}, not ${ASTRO_SITE}`);
    continue;
  }

  // (b) 不得有尾斜杠：全站 canonical 形态是无尾斜杠（`${SITE.domain}/en`），
  // Caddyfile 的 302 目标也是无尾斜杠——这两处是一套约定，这里把它钉住。
  if (canonicalHref.endsWith('/')) {
    fail('canonical', `${page} canonical has a trailing slash: ${canonicalHref}`);
    continue;
  }

  // (c) 必须自指。只校验主机前缀的话，指向本站**另一个页面**也测不出来。
  const expected =
    CANONICAL_EXEMPT.get(page) ?? `${ASTRO_SITE}/${canonicalPathOf(page)}`;
  if (canonicalHref !== expected) {
    fail('canonical', `${page} canonical is ${canonicalHref}, expected ${expected}`);
  }
}

// ---- 2b. hreflang 互指（仅内容页）------------------------------------------
for (const page of CONTENT_PAGES) {
  const html = parse(readFileSync(join(DIST, page), 'utf8'));
  const alts = html.querySelectorAll('link[rel="alternate"][hreflang]');
  const langs = alts.map((l) => l.getAttribute('hreflang'));
  for (const expected of [...LOCALES, 'x-default']) {
    if (!langs.includes(expected)) fail('hreflang', `${page} missing hreflang="${expected}"`);
  }
  for (const l of alts) {
    const href = l.getAttribute('href') ?? '';
    if (ASTRO_SITE && !href.startsWith(`${ASTRO_SITE}/`)) {
      fail('hreflang', `${page} hreflang="${l.getAttribute('hreflang')}" points at ${href}`);
    }
  }
}

// ---- 3. 无死链 --------------------------------------------------------------
// 遍历面扩到 `allHtml`（含 `dist/404.html`）。选择器也从 `a[href^="/"]` 放宽到
// `a[href]`，把两类此前测不到的形态一并校验：
//   - 同源绝对 URL（`https://<域名>/en`）→ 剥掉域名前缀后按站内路径校验；
//   - 相对路径（`../faq`）→ 按当前页所在目录解析后校验。
// 实测当前全站这两类各 0 条，所以这不是在修现网缺陷，而是把缺口永久关掉：
// 将来有人写 `<a href="https://<域名>/typo">` 或 `../typo` 时会被这里挡住。
// 外链（异源 `http(s)://`）与 `mailto:` 不在职责内，直接跳过。
const known = new Set(pages.map((p) => '/' + p.replace(/index\.html$/, '')));
const assets = new Set((await fg('**/*', { cwd: DIST })).map((f) => '/' + f));

const resolveHref = (href, page) => {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return null; // 纯片段（`#main`）或空
  if (ASTRO_SITE && clean.startsWith(ASTRO_SITE)) {
    return clean.slice(ASTRO_SITE.length) || '/'; // 同源绝对 → 站内路径
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) return null; // 其它 scheme（mailto、http(s) 外链……）
  if (clean.startsWith('/')) return posix.normalize(clean); // 站内绝对
  // 相对路径：解析基准是该 URL 的目录（目录式产物的 `/en/` 对应 `en/index.html`）。
  return '/' + posix.normalize(posix.join(posix.dirname(page), clean));
};

for (const page of allHtml) {
  const html = parse(readFileSync(join(DIST, page), 'utf8'));
  for (const a of html.querySelectorAll('a[href]')) {
    const raw = a.getAttribute('href') ?? '';
    const resolved = resolveHref(raw, page);
    if (resolved === null) continue;
    const withSlash = resolved.endsWith('/') ? resolved : `${resolved}/`;
    if (!known.has(withSlash) && !assets.has(resolved)) {
      fail('dead-link', `${page} → ${raw}`);
    }
  }
}

// ---- 4. 价格写法。全站唯一合法写法是 "USD 29.90"（Global Constraints）。----
// (a) 正向：配置里的价格必须**恰好**出现在这份清单上的页面里。
//     不要写成“每页都要有价格”——三十来个文件里只有这几个有价格。
//     清单是封闭的：新页面带上价格必须**同时**改这里，否则报错。
//     这正是它的用处——一个价格出现在预期之外的页面上，多半意味着
//     有人复制了一段带价格的组件而没想清楚该页要不要承担价格承诺。
const PRICE_PAGES = [
  'en/index.html',
  'en/pricing/index.html',
  'en/buy/index.html',
  // /skills 与 /samples 页尾的购买横幅（CtaBanner）把价格写在按钮上——
  // 这是刻意的购买引导，不是复制漂移，所以登记进清单。
  'en/skills/index.html',
  'en/samples/index.html',
  'ko/index.html',
  'ko/pricing/index.html',
  'ko/buy/index.html',
  'ko/skills/index.html',
  'ko/samples/index.html',
];
if (PRICE_DISPLAY) {
  for (const page of PRICE_PAGES) {
    const text = readFileSync(join(DIST, page), 'utf8');
    if (!text.includes(PRICE_DISPLAY)) {
      fail('price-notation', `${page} does not render the configured price "${PRICE_DISPLAY}"`);
    }
  }
  for (const file of allHtml.filter((f) => !PRICE_PAGES.includes(f))) {
    const text = readFileSync(join(DIST, file), 'utf8');
    if (text.includes(PRICE_DISPLAY)) {
      fail(
        'price-notation',
        `${file} renders a price but is not on the ${PRICE_PAGES.length}-page price list`,
      );
    }
  }
}

for (const file of allHtml) {
  const text = readFileSync(join(DIST, file), 'utf8');
  // (b) 否定，加宽到 HTML 实体形态：`$`、`&#36;`/`&#036;`、`&#x24;`/`&#X024;`、`&dollar;`。
  // 只认字面 `$` 的话，把价格写成实体的页面会溜过去。
  // 金额部分由 PRICE_AMOUNT 拼出，不写死数字——写死的话改价之后这条
  // 会安静地开始守一个不存在的旧价格（与 claims.test.mjs 同一个坑）。
  if (DOLLAR_PRICE.test(text)) {
    fail('price-notation', `${file} uses a $ price (literal or HTML entity)`);
  }
  // (c) 全站不得出现 `price.display` 之外的任何 USD 金额写法。
  // 金额形状收窄到 `\d+(?:\.\d+)?`，**不要**用 `[\d.]*`——后者会把句末的句点一并
  // 吞进来（"costs USD 29.90." → 匹配到 "USD 29.90."），于是与 display 不等而误报。
  for (const m of text.matchAll(/USD\s*\d+(?:\.\d+)?/gi)) {
    if (PRICE_DISPLAY && m[0] !== PRICE_DISPLAY) {
      fail('price-notation', `${file} uses "${m[0]}" — only "${PRICE_DISPLAY}" is allowed`);
    }
  }
}

// ---- 5. 站点必须公开可访问（spec §9.3）------------------------------------
// 缺文件必须失败，不能落回空串静默通过。原先 `: ''` 的写法让
// `rm dist/robots.txt` 之后闸门照样 exit 0 并打印 "✓ 26 HTML files verified"
// ——下面那个循环对空串跑零次，于是"没有 robots.txt"与"robots.txt 完全合格"
// 在输出上一模一样。审核员要能匿名抓取整站，缺这个文件是实打实的风险，
// 一个给出虚假安心的检查比没有这项检查更糟。
const ROBOTS = join(DIST, 'robots.txt');
let robots = '';
if (existsSync(ROBOTS)) {
  robots = readFileSync(ROBOTS, 'utf8');
} else {
  fail('public-access', 'robots.txt is missing from dist/ — crawlers get no directive at all');
}
// 任何**非空** Disallow 值都失败。原先只认整站形态 `Disallow: /`，于是
// `Disallow: /en/` 能整段屏蔽默认语言而不被发现。`Disallow:`（空值 = 允许全部）
// 应当放行。
for (const m of robots.matchAll(/^\s*Disallow:\s*(.*)$/gim)) {
  if (m[1].trim() !== '') fail('public-access', `robots.txt disallows "${m[1].trim()}"`);
}
for (const file of allHtml) {
  const html = parse(readFileSync(join(DIST, file), 'utf8'));

  // noindex 用解析器判定，不再用锁死属性顺序的正则：属性顺序、引号形态、
  // 大小写都不再是攻击面。凡 `meta[name]` 的 name ∈ {robots, googlebot}
  // 且 content 含 `noindex` 或 `none` 的，一律失败。
  for (const meta of html.querySelectorAll('meta[name]')) {
    const name = (meta.getAttribute('name') ?? '').toLowerCase();
    if (name !== 'robots' && name !== 'googlebot') continue;
    const content = (meta.getAttribute('content') ?? '').toLowerCase();
    if (/\bnoindex\b|\bnone\b/.test(content)) {
      fail('public-access', `${file} ships noindex (meta ${name}="${content}")`);
    }
  }

  if (/coming soon|under construction/i.test(readFileSync(join(DIST, file), 'utf8'))) {
    fail('public-access', `${file} looks unfinished`);
  }
}

// ---- 6. 主体信息逐字一致（spec §9.3）--------------------------------------
//
// 遍历面是 `allHtml` 减去跳转壳——跳转壳没有页脚是设计不是遗漏（裁决 1），
// 其余（含 `dist/404.html` 与两个本地化 404）实测都带着完整页脚。
const FOOTER_FACTS = [
  'CROSSXTOP LTD',
  'Company No. 16339041',
  'Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ',
  'crossxtop@gmail.com',
];
// 整行逐字。分隔符是 U+00B7 `·`，不随语言变化，不许换成 `-` 或 `|`。
const DISCLOSURE =
  'CROSSXTOP LTD · Registered in England and Wales · Company No. 16339041';
for (const page of allHtml.filter((p) => p !== REDIRECT_SHELL)) {
  const raw = readFileSync(join(DIST, page), 'utf8');
  for (const fact of FOOTER_FACTS) {
    if (!raw.includes(fact)) fail('entity-details', `${page} missing "${fact}"`);
  }
  // 拆成碎片散落各处仍能通过上面那条，所以再加整行断言。
  if (!raw.includes(DISCLOSURE)) {
    fail('entity-details', `${page} does not render the disclosure line verbatim`);
  }
  // 邮箱必须**可点**（spec 要求 clickable mailto），纯文本不算。
  // 用解析器查 `a[href^="mailto:"]` 比查字符串更结实：属性顺序、实体转义、
  // 把 mailto 塞进注释都骗不过它。
  const mailtos = parse(raw)
    .querySelectorAll('a[href^="mailto:"]')
    .map((a) => a.getAttribute('href'));
  if (!mailtos.includes('mailto:crossxtop@gmail.com')) {
    fail('entity-details', `${page} has no clickable mailto: link to the support email`);
  }
}

// ---- 7. aria-hidden 子树里不得有可聚焦元素（裁决 4，复用共享模块）---------
//
// 判定逻辑与 `tests/build/aria-hidden.test.mjs` 共用 `aria-hidden-scan.mjs`，
// 不是复制：部署机可能没有 vitest，闸门要能独立跑，但两处判据必须同源，
// 否则会长回“测试绿、闸门红”（控制者补注裁决 A）。判据本身的契约另由
// `tests/unit/aria-hidden-scan.test.mjs` 钉住。
{
  let hosts = 0;
  for (const file of allHtml) {
    const { hosts: found, violations } = scanAriaHiddenFocus(readFileSync(join(DIST, file), 'utf8'));
    hosts += found;
    for (const v of violations) fail('aria-hidden-focus', `${file} ${v}`);
  }
  // 反空转守卫：选择器写错、一个宿主都没匹配到时，上面一条失败都不会产生，
  // 闸门会静默变绿。部署机上没有 vitest 兜底，这里必须自己守。
  if (hosts === 0) {
    fail('aria-hidden-focus', 'no aria-hidden="true" host matched anywhere — the check never ran');
  }
}

// ---- 8. Stripe 审核可达性 ---------------------------------------------------
//
// spec §9.2 的「两分钟 Stripe 审核模拟」本要人肉交互，沙箱做不了（裁决 4）。
// 改为对 `dist/` 的站内链接图做 BFS：从每语首页出发，商品（/skills）、价格
// （/pricing）、退款政策（/legal/refund）须在 ≤2 跳内可达。
//
// 客服邮箱与公司主体信息断言在**首页自身**，不写成“≤2 跳内任意页面”——后者与
// 它宣称的“从首页出发”不是一回事：把首页页脚整个删掉，只要任意一个二跳页面还
// 有邮箱，旧的写法仍旧是绿的（S-12）。实测两者都在首页，收紧后余量充足。
{
  const targets = (lang) => ({
    product: `/${lang}/skills`,
    pricing: `/${lang}/pricing`,
    refund: `/${lang}/legal/refund`,
  });
  const fileFor = (href) => {
    const clean = href.split('#')[0].split('?')[0];
    if (!clean || !clean.startsWith('/')) return null;
    const withSlash = clean.endsWith('/') ? clean : `${clean}/`;
    const candidate = `${withSlash.replace(/^\//, '')}index.html`;
    return pages.includes(candidate) ? candidate : null;
  };
  for (const lang of LOCALES) {
    const start = `${lang}/index.html`;
    const homeRaw = readFileSync(join(DIST, start), 'utf8');
    const dist = new Map([[start, 0]]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      const html = parse(readFileSync(join(DIST, cur), 'utf8'));
      for (const a of html.querySelectorAll('a[href]')) {
        const next = fileFor(a.getAttribute('href') ?? '');
        if (next && !dist.has(next)) {
          dist.set(next, dist.get(cur) + 1);
          queue.push(next);
        }
      }
    }
    for (const [label, href] of Object.entries(targets(lang))) {
      const target = fileFor(href);
      if (!target || (dist.get(target) ?? Infinity) > 2) {
        fail('audit-reachability', `${lang} home → ${label} (${href}) is not within 2 links`);
      }
    }
    if (parse(homeRaw).querySelectorAll('a[href^="mailto:"]').length === 0) {
      fail('audit-reachability', `${lang} home page itself carries no clickable mailto: link`);
    }
    if (!homeRaw.includes('CROSSXTOP LTD')) {
      fail('audit-reachability', `${lang} home page itself carries no entity details`);
    }
  }
}

// ---- 9. R-9 自扫描：脚本自身不得硬编码域名 --------------------------------
// 清单改为 glob 而非硬编码——新增 `scripts/*.mjs` 会自动纳入，不会因为忘了
// 往清单里补一行而漏掉。
{
  for (const rel of await fg('scripts/*.mjs')) {
    const src = readFileSync(resolve(ROOT, rel), 'utf8');
    if (ASTRO_SITE && src.includes(ASTRO_SITE)) {
      fail('domain-hardcode', `${rel} embeds the domain literal instead of reading it from config`);
    }
  }
}

// ---- 非阻断警告：@font-face 引用的本地文件是否存在（裁决 3）----------------
//
// 字体缺失不阻断部署（`font-display: swap`，系统字体即时生效，构建保持绿色）；
// 但用户放入 `public/fonts/` 前后都该有明确信号。打印 ⚠ 而非并入 failures。
{
  const referenced = new Set();
  for (const css of await fg('**/*.css', { cwd: DIST })) {
    const text = readFileSync(join(DIST, css), 'utf8');
    for (const m of text.matchAll(/url\(([^)]+)\)/g)) {
      const url = m[1].replace(/["']/g, '').trim();
      if (url.startsWith('/fonts/')) referenced.add(url);
    }
  }
  const missing = [...referenced].sort().filter((u) => !existsSync(join(DIST, u.replace(/^\//, ''))));
  if (missing.length > 0) {
    warnings.push(
      `${missing.length} local font file(s) referenced by @font-face are absent from dist/: ` +
        `${missing.join(', ')}. This does NOT block deploy — the system font stack takes over ` +
        '(font-display: swap). The warning should disappear once the woff2 binaries are placed in public/fonts/.',
    );
  }
}

// ---- 汇总 ------------------------------------------------------------------
for (const w of warnings) console.warn(`\n⚠ ${w}`);

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `✓ ${allHtml.length} HTML files verified (${pages.length} index pages)` +
    `${warnings.length ? ` (${warnings.length} warning(s))` : ''}`,
);
