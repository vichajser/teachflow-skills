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
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { parse } from 'node-html-parser';
import { scanAriaHiddenFocus } from './aria-hidden-scan.mjs';

const ROOT = process.cwd();
const DIST = resolve(ROOT, 'dist');
const HERE = dirname(fileURLToPath(import.meta.url));
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

if (!ASTRO_SITE) fail('domain', 'could not read `site` from astro.config.mjs');
if (!CONFIG_DOMAIN) fail('domain', 'could not read `domain` from src/config/site.ts');
// 两处独立解析的结果必须一致：若有人只改了一处（或把域名硬编码进第三个文件），
// 产物里的 canonical 会与配置对不上——这条在下面按页面逐条抓。
if (ASTRO_SITE && CONFIG_DOMAIN && ASTRO_SITE !== CONFIG_DOMAIN) {
  fail(
    'domain-drift',
    `astro.config.mjs site=${ASTRO_SITE} but src/config/site.ts domain=${CONFIG_DOMAIN}`,
  );
}

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
 */
const isErrorPage = (p) => /(^|\/)404\/index\.html$/.test(p);
const CONTENT_PAGES = pages.filter((p) => p !== REDIRECT_SHELL && !isErrorPage(p));

// ---- 1. 两语页面数量一致，无缺页 -------------------------------------------
const byLocale = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    pages.filter((p) => p.startsWith(`${l}/`)).map((p) => p.slice(l.length + 1)),
  ]),
);
const [en, ko] = [new Set(byLocale.en), new Set(byLocale.ko)];
for (const page of en) if (!ko.has(page)) fail('locale-parity', `ko/${page} missing`);
for (const page of ko) if (!en.has(page)) fail('locale-parity', `en/${page} missing`);

// ---- 2. hreflang / canonical 存在且互指 ------------------------------------
for (const page of pages) {
  const html = parse(readFileSync(join(DIST, page), 'utf8'));
  const canonical = html.querySelector('link[rel="canonical"]');
  if (!canonical) {
    fail('canonical', `${page} has none`);
    continue;
  }

  // canonical 必须指向本站配置域名：域名漂移到第三个文件、或换域名时只改了
  // astro.config.mjs 而漏了别处，都会在产物里以“canonical 指向陌生主机”现形。
  const canonicalHref = canonical.getAttribute('href') ?? '';
  if (ASTRO_SITE && !canonicalHref.startsWith(`${ASTRO_SITE}/`) && canonicalHref !== ASTRO_SITE) {
    fail('canonical', `${page} canonical points at ${canonicalHref}, not ${ASTRO_SITE}`);
  }

  if (!CONTENT_PAGES.includes(page)) continue;

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

// ---- 3. 无死链。只查站内绝对路径；外链不在本脚本职责内。--------------------
const known = new Set(pages.map((p) => '/' + p.replace(/index\.html$/, '')));
const assets = new Set((await fg('**/*', { cwd: DIST })).map((f) => '/' + f));
for (const page of pages) {
  const html = parse(readFileSync(join(DIST, page), 'utf8'));
  for (const a of html.querySelectorAll('a[href^="/"]')) {
    const href = (a.getAttribute('href') ?? '').split('#')[0];
    if (!href) continue;
    const withSlash = href.endsWith('/') ? href : `${href}/`;
    if (!known.has(withSlash) && !assets.has(href)) {
      fail('dead-link', `${page} → ${href}`);
    }
  }
}

// ---- 4. 价格写法。全站唯一合法写法是 "USD 19.90"（Global Constraints）。----
for (const file of await fg('**/*.html', { cwd: DIST })) {
  const text = readFileSync(join(DIST, file), 'utf8');
  if (/\$\s?19(\.9\d?)?\b/.test(text)) fail('price-notation', `${file} uses a $ price`);
}

// ---- 5. 站点必须公开可访问（spec §9.3）------------------------------------
const robots = existsSync(join(DIST, 'robots.txt'))
  ? readFileSync(join(DIST, 'robots.txt'), 'utf8')
  : '';
if (/Disallow:\s*\/\s*$/m.test(robots)) fail('public-access', 'robots.txt disallows the whole site');
for (const page of pages) {
  const html = readFileSync(join(DIST, page), 'utf8');
  if (/name=["']robots["'][^>]*noindex/i.test(html)) fail('public-access', `${page} is noindex`);
  if (/coming soon|under construction/i.test(html)) fail('public-access', `${page} looks unfinished`);
}

// ---- 6. 主体信息逐字一致（spec §9.3）--------------------------------------
//
// 跳转壳没有页脚，是设计不是遗漏（裁决 1）。`dist/404.html` 是根级语言中立
// 兜底、不是 `**/index.html`，压根不在 `pages` 集合里，因此不受本条检查——
// 这是**有意为之**，不是漏了：它只作 Caddy `handle_errors` 的最终兜底，不进
// 语言互指图，也不承担主体披露职责。
const FOOTER_FACTS = [
  'CROSSXTOP LTD',
  'Company No. 16339041',
  'Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ',
  'vichajser@gmail.com',
];
for (const page of pages.filter((p) => p !== REDIRECT_SHELL)) {
  const html = readFileSync(join(DIST, page), 'utf8');
  for (const fact of FOOTER_FACTS) {
    if (!html.includes(fact)) fail('entity-details', `${page} missing "${fact}"`);
  }
}

// ---- 7. aria-hidden 子树里不得有可聚焦元素（裁决 4，复用共享模块）---------
//
// 判定逻辑与 `tests/build/aria-hidden.test.mjs` 共用 `aria-hidden-scan.mjs`，
// 不是复制：部署机可能没有 vitest，闸门要能独立跑，但两处判据必须同源，
// 否则会长回“测试绿、闸门红”（控制者补注裁决 A）。
{
  let hosts = 0;
  for (const file of await fg('**/*.html', { cwd: DIST })) {
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

// ---- 8. Stripe 审核可达性：关键目的地不超过两跳 ----------------------------
//
// spec §9.2 的「两分钟 Stripe 审核模拟」本要人肉交互，沙箱做不了（裁决 4）。
// 改为对 `dist/` 的站内链接图做 BFS：从每语首页出发，商品（/skills）、价格
// （/pricing）、退款政策（/legal/refund）须在 ≤2 跳内可达；客服邮箱与公司主体
// 信息须在 ≤2 跳内的页面上出现。算法在 `dist` 上跑，与真实站内导航一致。
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
    const reachable = [...dist.keys()];
    const has = (pred) =>
      reachable.some((f) => dist.get(f) <= 2 && pred(readFileSync(join(DIST, f), 'utf8')));
    for (const [label, href] of Object.entries(targets(lang))) {
      const target = fileFor(href);
      if (!target || (dist.get(target) ?? Infinity) > 2) {
        fail('audit-reachability', `${lang} home → ${label} (${href}) is not within 2 links`);
      }
    }
    if (!has((html) => html.includes('mailto:'))) {
      fail('audit-reachability', `${lang} home → support email is not within 2 links`);
    }
    if (!has((html) => html.includes('CROSSXTOP LTD'))) {
      fail('audit-reachability', `${lang} home → entity details is not within 2 links`);
    }
  }
}

// ---- 9. R-9 自扫描：脚本自身不得硬编码域名 --------------------------------
{
  const selfFiles = ['scripts/verify-build.mjs', 'scripts/aria-hidden-scan.mjs'];
  for (const rel of selfFiles) {
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
console.log(`✓ ${pages.length} pages verified${warnings.length ? ` (${warnings.length} warning(s))` : ''}`);
