# TeachFlow-KR 官网实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 TeachFlow-KR 的英韩双语纯静态营销官网，同时满足 Stripe 商户激活审核与 Agensi 上架的合规展示要求。

**Architecture:** Astro 静态站，`src/pages/[lang]/` 目录式双语路由（不启用 Astro 内置 i18n 中间件，全部由自写的 `src/i18n/` 模块驱动，构建行为完全确定）。UI 文案集中在 `en.json` / `ko.json`，长文用内容集合按语言分目录。全站零 JS，仅首页的六 skill 关系图是唯一的 Astro island。构建产物 `dist/` 由 Hetzner 上的 Caddy 直接托管。

**Tech Stack:** Astro 5（static output）、Tailwind CSS 4（`@tailwindcss/vite`，CSS-first `@theme`）、TypeScript、Vitest（单元测试 + 构建产物断言）、Caddy（部署）。

**Spec:** `docs/superpowers/specs/2026-09-18-teachflow-website-design.md`

## Global Constraints

以下为全局约束，每个任务的要求都隐含包含本节。值逐字取自 spec。

**环境与工具链**

- 仓库根目录即 Astro 项目根目录：`/Users/mac/workspace/TeachFlowSkills/workspace`（已 `git init`，remote `git@github.com:vichajser/teachflow-skills.git`）。不再嵌套子目录。
- **npm registry 在 agent 沙箱中不可达**（`npm ping` 返回 403）。所有 `npm install` / `npm create astro` 必须由用户在自己的终端执行。计划中凡出现安装命令，执行者必须停下来请用户运行，拿到成功回执后再继续；不得尝试自行联网安装。
- 同理，**自托管字体的 woff2 二进制文件由用户提供**，放入 `public/fonts/`。代码必须在字体文件缺失时仍能正常构建与渲染（回落系统字体栈）。
- 不使用 `@astrojs/tailwind`（已废弃），使用 `@tailwindcss/vite`。
- 不启用 Astro 的 `i18n` 配置块。语言路由由 `src/pages/[lang]/` + `getStaticPaths` 显式生成。

**内容与素材**

- 内容主源 `TeachFlow-KR/docs/README.md`、安全事实源 `TeachFlow-KR/_SPEC.md` §3、教材 `sources/` **位于本仓库之外**（父目录 `TeachFlowSkills/`）。实现时读取，**不复制进本仓库**。
- 本仓库只存网站代码、spec、计划与经脱敏的样例产物。
- 样例文件中**不得出现任何真实学生姓名或学校名**，统一用 `Class 1-3`、`김민준(예시)`。

**文案纪律（违反即为 bug）**

- 价格全站一律写作 `USD 19.90`，含币种代码，不写 `$19.9`、`$19.90`、`19.9 USD`。唯一来源是 `SITE.price.display`。
- 引用 Agensi 退款政策时**只给链接、绝不复述天数**（Agensi 自家两份文件 30 天 / 14 天互相矛盾）。
- `/security` 只陈述 `_SPEC.md` §3 中确有约束的条目。**不得出现"通过第三方安全审计"等无依据表述。**
- "节省时间"类数字必须有依据，取自实际运行 skill 的耗时记录。无记录则不显示该数字。
- 页脚公司信息逐字为：
  ```
  CROSSXTOP LTD · Registered in England and Wales · Company No. 16339041
  Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ
  ```
  与 Companies House 公开记录及提交给 Stripe 的主体信息必须逐字一致。
- 客服邮箱 `vichajser@gmail.com`，必须是可点击的 `mailto:` 直达链接，不得仅提供表单。

**视觉约束**

- 霓虹色（`#22D3EE`、`#2E7DFF`、`#A855F7`）仅用于描边、连线、辉光与小面积图标，**不用于正文**。
- 全站仅四处动效：首页主关系图、Hero 扇形展开、成品卡 hover、耗时计数器。除此之外不做动效。
- 毛玻璃仅用于吸顶导航一处。
- `/pricing` 与 `/legal/*` 取消所有辉光与动效。
- `prefers-reduced-motion: reduce` 时所有动效渲染终态，无任何位移。

**合规硬性项**

- 站点必须公开可访问：无 Basic Auth、无 `noindex`、无 "Coming Soon"。这是 Stripe 预发布站点最常见的驳回原因。
- 域名尚未购买。`canonical` 与 `hreflang` 的域名部分只允许来自 `SITE.domain` 这一个配置项。

**提交纪律**

- 每个任务末尾提交一次，commit message 用 Conventional Commits（`feat:` / `chore:` / `test:` / `docs:`）。
- 不 push（remote 未验证可达）。push 由用户决定时机。

---

## File Structure

```
workspace/
├── astro.config.mjs              Astro 配置：site、static、tailwind vite 插件
├── package.json                  依赖与脚本
├── tsconfig.json                 TS 严格模式 + 路径别名 @/
├── vitest.config.ts              Vitest 配置
├── deploy/
│   └── Caddyfile                 Hetzner 托管配置：/ → /en/、404、缓存头
├── scripts/
│   └── verify-build.mjs          构建后校验：双语页数对等、hreflang 互指、无死链、价格写法
├── public/
│   ├── fonts/                    用户提供的 woff2（Inter / Pretendard / JetBrains Mono）
│   ├── samples/                  韩语样例产物（并行工作流产出后放入）
│   └── robots.txt                允许全站抓取
├── src/
│   ├── config/
│   │   └── site.ts               唯一的站点常量源：域名、公司主体、邮箱、价格
│   ├── i18n/
│   │   ├── config.ts             Locale 类型、路径本地化与剥离
│   │   ├── t.ts                  翻译查找，缺失回落 en
│   │   ├── paths.ts              getStaticPaths 共用助手
│   │   ├── en.json               英文 UI 文案
│   │   └── ko.json               韩文 UI 文案
│   ├── styles/
│   │   ├── global.css            Tailwind 入口 + @theme 设计令牌 + 字体栈 + 网格底纹
│   │   └── fonts.css             @font-face 声明（自托管 woff2）
│   ├── layouts/
│   │   ├── BaseLayout.astro      html/head/SEO/header/footer 骨架
│   │   └── LegalLayout.astro     合规静音版式（无辉光无动效）
│   ├── components/
│   │   ├── SiteHeader.astro      吸顶导航（唯一毛玻璃）
│   │   ├── SiteFooter.astro      公司主体 + 客服邮箱 + 法务链接
│   │   ├── LanguageSwitcher.astro 保持当前路径切换语言
│   │   ├── SeoHead.astro         canonical + hreflang + og
│   │   ├── PriceBlock.astro      USD 19.90 唯一渲染出口
│   │   ├── SkillCard.astro       /skills 与首页共用
│   │   ├── SampleCard.astro      含"样例准备中"占位态
│   │   ├── HeroFan.astro         首屏扇形展开（纯 CSS，演一次即停）
│   │   └── FlowDiagram/
│   │       ├── FlowDiagram.astro 内联 SVG 结构（终态即静态图）+ 悬停侧卡
│   │       ├── nodes.ts          节点与连线数据 + 阶段配色
│   │       └── flow-diagram.ts   island 脚本：四拍演出、约束胶囊、悬停高亮
│   ├── content/
│   │   ├── config.ts             内容集合 schema
│   │   ├── skills/{en,ko}/       6 个 skill 详情长文
│   │   ├── legal/{en,ko}/        terms / privacy / refund / delivery
│   │   └── faq/{en,ko}/          常见问题
│   ├── data/
│   │   ├── skills.ts             六 skill 元数据：阶段、产物、配色
│   │   ├── samples.ts            样例清单（含未就绪标记）
│   │   └── security-matrix.ts    Agensi 8 点扫描对照表数据
│   └── pages/
│       ├── index.astro           / → /en/ 重定向页
│       ├── 404.astro             兜底 404（未知语言前缀）
│       └── [lang]/
│           ├── index.astro       首页
│           ├── skills.astro      六 skill 详情
│           ├── samples.astro     成品画廊
│           ├── pricing.astro     定价与购买路径
│           ├── security.astro    安全与隐私
│           ├── docs.astro        安装与快速上手
│           ├── faq.astro         常见问题
│           ├── 404.astro         各语言 404
│           └── legal/
│               ├── terms.astro
│               ├── privacy.astro
│               ├── refund.astro
│               └── delivery.astro
├── deploy/
│   ├── Caddyfile                 Hetzner 上的静态托管配置（无 Basic Auth）
│   └── README.md                 部署与上线前检查步骤
└── tests/
    ├── unit/                     i18n、site config、skills、samples、flow-nodes 的纯函数测试
    └── build/                    对 dist/ 产物的断言测试
```

---

## Task 1: 项目骨架与构建冒烟

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/styles/global.css`
- Create: `src/pages/[lang]/index.astro`
- Create: `public/robots.txt`
- Test: `tests/build/smoke.test.mjs`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: 可运行的 `npm run build`，输出 `dist/en/index.html` 与 `dist/ko/index.html`；`npm run test` 可执行 Vitest；Tailwind 4 通过 `src/styles/global.css` 生效。

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "teachflow-site",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=20.3.0" },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run",
    "verify": "npm run build && npm run test && node scripts/verify-build.mjs"
  },
  "dependencies": {
    "astro": "^5.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "fast-glob": "^3.3.2",
    "node-html-parser": "^6.1.13",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 请用户安装依赖**

npm registry 在 agent 沙箱中不可达。停下来，请用户在自己的终端运行：

```bash
cd /Users/mac/workspace/TeachFlowSkills/workspace && npm install
```

拿到成功回执后再继续。不要尝试自行安装。

- [ ] **Step 3: 写 `astro.config.mjs`**

```js
// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// 域名尚未购买：占位域名只允许出现在这里与 src/config/site.ts。
// 确定域名后，两处同步改动即可，其余代码不得硬编码域名。
export default defineConfig({
  site: 'https://teachflow-kr.example',
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  vite: { plugins: [tailwindcss()] },
});
```

- [ ] **Step 4: 写 `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  },
  "include": [".astro/types.d.ts", "src/**/*", "tests/**/*", "scripts/**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 5: 写 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.{ts,mjs}'],
    environment: 'node',
  },
});
```

- [ ] **Step 6: 写 `src/styles/global.css`**

设计令牌逐字取自 spec §5.1。Tailwind 4 用 CSS-first `@theme`，不写 `tailwind.config.js`。

```css
@import "tailwindcss";

@theme {
  --color-void: #070B16;
  --color-surface: #0E1626;
  --color-raised: #16203A;
  --color-border: #1F2C4A;

  --color-accent: #2E7DFF;
  --color-accent-glow: #22D3EE;
  --color-accent-warm: #A855F7;

  --color-text-hi: #F2F6FF;
  --color-text-body: #C3CFE4;
  --color-text-mute: #7C8AA6;

  --font-sans: "Inter", system-ui, sans-serif;
  --font-ko: "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

html {
  background-color: var(--color-void);
  color: var(--color-text-body);
  font-family: var(--font-sans);
}

html:lang(ko) {
  font-family: var(--font-ko);
}
```

- [ ] **Step 7: 写最小的 `src/pages/[lang]/index.astro`**

本任务只验证双语路由与构建管线通了，内容在后续任务替换。

```astro
---
import '@/styles/global.css';

export function getStaticPaths() {
  return [{ params: { lang: 'en' } }, { params: { lang: 'ko' } }];
}

const { lang } = Astro.params;
---

<!doctype html>
<html lang={lang}>
  <head>
    <meta charset="utf-8" />
    <title>TeachFlow-KR</title>
  </head>
  <body>
    <h1 class="text-text-hi">TeachFlow-KR</h1>
  </body>
</html>
```

- [ ] **Step 8: 写 `public/robots.txt`**

必须允许全站抓取。带 `noindex` 或屏蔽抓取是 Stripe 审核的驳回项。

```
User-agent: *
Allow: /

Sitemap: https://teachflow-kr.example/sitemap-index.xml
```

- [ ] **Step 9: 写失败的构建冒烟测试 `tests/build/smoke.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = (p) => resolve(process.cwd(), 'dist', p);

describe('build output', () => {
  it('emits an English home page', () => {
    expect(existsSync(dist('en/index.html'))).toBe(true);
  });

  it('emits a Korean home page', () => {
    expect(existsSync(dist('ko/index.html'))).toBe(true);
  });

  it('sets the html lang attribute per locale', () => {
    expect(readFileSync(dist('en/index.html'), 'utf8')).toContain('lang="en"');
    expect(readFileSync(dist('ko/index.html'), 'utf8')).toContain('lang="ko"');
  });
});
```

- [ ] **Step 10: 运行测试确认失败**

Run: `npx vitest run tests/build/smoke.test.mjs`
Expected: FAIL —— `dist/` 尚不存在，三条断言全部报 `expected false to be true`。

- [ ] **Step 11: 构建并重跑测试**

Run: `npm run build && npx vitest run tests/build/smoke.test.mjs`
Expected: PASS（3 passed）

- [ ] **Step 12: 提交**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json vitest.config.ts src/styles/global.css "src/pages/[lang]/index.astro" public/robots.txt tests/build/smoke.test.mjs
git commit -m "feat: scaffold Astro 5 + Tailwind 4 static site with bilingual routes"
```

---

## Task 2: 站点常量与 i18n 核心模块

**Files:**
- Create: `src/config/site.ts`
- Create: `src/i18n/config.ts`
- Create: `src/i18n/t.ts`
- Create: `src/i18n/paths.ts`
- Create: `src/i18n/en.json`
- Create: `src/i18n/ko.json`
- Test: `tests/unit/i18n.test.ts`
- Test: `tests/unit/site.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `tsconfig.json` 路径别名 `@/`、`vitest.config.ts`
- Produces:
  - `SITE`（`src/config/site.ts`）—— 只读常量对象，字段：`domain: string`、`companyName: string`、`companyNumber: string`、`registeredIn: string`、`address: string`、`supportEmail: string`、`supportResponseDays: number`、`price: { currency: 'USD'; amount: '19.90'; display: 'USD 19.90' }`、`agensiListingUrl: string`、`agensiTermsUrl: string`
  - `LOCALES: readonly ['en','ko']`、`type Locale = 'en'|'ko'`、`DEFAULT_LOCALE: Locale`
  - `isLocale(value: string): value is Locale`
  - `localizePath(path: string, locale: Locale): string`
  - `stripLocale(pathname: string): string`
  - `localeFromPath(pathname: string): Locale`
  - `useTranslations(locale: Locale): (key: TranslationKey) => string`、`type TranslationKey = keyof typeof en`
  - `localeStaticPaths(): { params: { lang: Locale } }[]`

- [ ] **Step 1: 写失败的 i18n 单元测试 `tests/unit/i18n.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  localizePath,
  stripLocale,
  localeFromPath,
} from '@/i18n/config';
import { useTranslations } from '@/i18n/t';
import { localeStaticPaths } from '@/i18n/paths';

describe('locale config', () => {
  it('ships exactly English and Korean, English first', () => {
    expect(LOCALES).toEqual(['en', 'ko']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('recognises supported locales only', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('ko')).toBe(true);
    expect(isLocale('zh')).toBe(false);
    expect(isLocale('')).toBe(false);
  });
});

describe('localizePath', () => {
  it('prefixes a path with the locale', () => {
    expect(localizePath('/pricing', 'ko')).toBe('/ko/pricing');
    expect(localizePath('/legal/refund', 'en')).toBe('/en/legal/refund');
  });

  it('maps the site root to the locale root', () => {
    expect(localizePath('/', 'en')).toBe('/en');
    expect(localizePath('/', 'ko')).toBe('/ko');
  });

  it('accepts paths with or without a leading slash', () => {
    expect(localizePath('pricing', 'ko')).toBe('/ko/pricing');
  });
});

describe('stripLocale', () => {
  it('removes the locale prefix', () => {
    expect(stripLocale('/ko/pricing')).toBe('/pricing');
    expect(stripLocale('/en/legal/terms')).toBe('/legal/terms');
  });

  it('maps a bare locale root back to the site root', () => {
    expect(stripLocale('/ko')).toBe('/');
    expect(stripLocale('/en/')).toBe('/');
  });

  it('leaves unprefixed paths untouched', () => {
    expect(stripLocale('/pricing')).toBe('/pricing');
  });
});

describe('localeFromPath', () => {
  it('reads the locale out of the path', () => {
    expect(localeFromPath('/ko/samples')).toBe('ko');
    expect(localeFromPath('/en')).toBe('en');
  });

  it('falls back to the default locale for unknown prefixes', () => {
    expect(localeFromPath('/zh/samples')).toBe('en');
    expect(localeFromPath('/')).toBe('en');
  });
});

describe('useTranslations', () => {
  it('returns the string for the requested locale', () => {
    expect(useTranslations('en')('nav.pricing')).toBe('Pricing');
    expect(useTranslations('ko')('nav.pricing')).toBe('가격');
  });

  it('never returns an empty string for a known key', () => {
    const t = useTranslations('ko');
    expect(t('nav.skills').length).toBeGreaterThan(0);
  });
});

describe('localeStaticPaths', () => {
  it('produces one entry per locale', () => {
    expect(localeStaticPaths()).toEqual([
      { params: { lang: 'en' } },
      { params: { lang: 'ko' } },
    ]);
  });
});
```

- [ ] **Step 2: 写失败的站点常量测试 `tests/unit/site.test.ts`**

价格写法与公司主体是 Stripe 审核的硬性项，用测试钉死，防止后续任务改坏。

```ts
import { describe, it, expect } from 'vitest';
import { SITE } from '@/config/site';

describe('SITE constants', () => {
  it('renders the price with an explicit currency code', () => {
    expect(SITE.price.display).toBe('USD 19.90');
    expect(SITE.price.display).not.toContain('$');
  });

  it('carries the company details verbatim as filed', () => {
    expect(SITE.companyName).toBe('CROSSXTOP LTD');
    expect(SITE.companyNumber).toBe('16339041');
    expect(SITE.registeredIn).toBe('England and Wales');
    expect(SITE.address).toBe(
      'Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ',
    );
  });

  it('exposes a reachable support email', () => {
    expect(SITE.supportEmail).toBe('vichajser@gmail.com');
  });

  it('keeps the domain in one place, with no trailing slash', () => {
    expect(SITE.domain.startsWith('https://')).toBe(true);
    expect(SITE.domain.endsWith('/')).toBe(false);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/unit`
Expected: FAIL —— `Failed to resolve import "@/i18n/config"` 与 `"@/config/site"`。

- [ ] **Step 4: 写 `src/config/site.ts`**

```ts
/**
 * 站点唯一的常量源。
 *
 * 域名尚未购买：占位域名只允许出现在这里与 astro.config.mjs。
 * 公司主体信息须与 Companies House 公开记录及提交给 Stripe 的资料逐字一致——
 * Stripe 人工复审会比对，不一致即驳回。
 */
export const SITE = {
  domain: 'https://teachflow-kr.example',

  companyName: 'CROSSXTOP LTD',
  companyNumber: '16339041',
  registeredIn: 'England and Wales',
  address: 'Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ',

  supportEmail: 'vichajser@gmail.com',
  supportResponseDays: 2,

  // 全站价格的唯一出口。写作 "USD 19.90"，不写 "$19.9"。
  price: {
    currency: 'USD',
    amount: '19.90',
    display: 'USD 19.90',
  },

  agensiListingUrl: 'https://www.agensi.io',
  // 只链接，不复述其退款天数：Agensi 自家 /terms 与 /stripe-terms 互相矛盾。
  agensiTermsUrl: 'https://www.agensi.io/terms',
} as const;
```

- [ ] **Step 5: 写 `src/i18n/config.ts`**

```ts
export const LOCALES = ['en', 'ko'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** '/pricing' + 'ko' → '/ko/pricing'；'/' + 'en' → '/en' */
export function localizePath(path: string, locale: Locale): string {
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  return clean === '' ? `/${locale}` : `/${locale}/${clean}`;
}

/** '/ko/pricing' → '/pricing'；'/ko' → '/'；无语言前缀则原样返回 */
export function stripLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && isLocale(segments[0]!)) {
    segments.shift();
  }
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

/** 未知或缺失前缀一律回落默认语言（spec §8：未知语言前缀重定向至 /en） */
export function localeFromPath(pathname: string): Locale {
  const first = pathname.split('/').filter(Boolean)[0];
  return first && isLocale(first) ? first : DEFAULT_LOCALE;
}
```

- [ ] **Step 6: 写 `src/i18n/en.json` 与 `src/i18n/ko.json`**

本任务只放导航与页脚所需的键，后续任务按需增补。键名用点分命名空间，扁平存储——扁平结构让 `keyof typeof en` 直接成为可用的联合类型。

`src/i18n/en.json`：

```json
{
  "site.tagline": "Six Claude Skills that turn a textbook unit into a full week of lessons.",
  "nav.skills": "Skills",
  "nav.samples": "Samples",
  "nav.pricing": "Pricing",
  "nav.security": "Security",
  "nav.docs": "Docs",
  "nav.faq": "FAQ",
  "nav.home": "Home",
  "lang.switch": "Language",
  "lang.en": "English",
  "lang.ko": "한국어",
  "footer.legal": "Legal",
  "footer.terms": "Terms of Service",
  "footer.privacy": "Privacy Policy",
  "footer.refund": "Refund & Cancellation",
  "footer.delivery": "Digital Delivery",
  "footer.support": "Support",
  "footer.supportLine": "Email us — we reply within 2 business days.",
  "footer.registered": "Registered in England and Wales"
}
```

`src/i18n/ko.json`：

```json
{
  "site.tagline": "교재 한 단원을 한 주 분량의 수업으로 바꿔 주는 6개의 Claude Skill.",
  "nav.skills": "스킬",
  "nav.samples": "실제 산출물",
  "nav.pricing": "가격",
  "nav.security": "보안",
  "nav.docs": "사용 안내",
  "nav.faq": "자주 묻는 질문",
  "nav.home": "홈",
  "lang.switch": "언어",
  "lang.en": "English",
  "lang.ko": "한국어",
  "footer.legal": "법적 고지",
  "footer.terms": "이용약관",
  "footer.privacy": "개인정보 처리방침",
  "footer.refund": "환불 및 취소 정책",
  "footer.delivery": "디지털 상품 전달 안내",
  "footer.support": "고객 지원",
  "footer.supportLine": "이메일로 문의해 주세요. 영업일 기준 2일 이내에 답변드립니다.",
  "footer.registered": "잉글랜드 및 웨일스 등록 법인"
}
```

- [ ] **Step 7: 写 `src/i18n/t.ts`**

```ts
import en from './en.json';
import ko from './ko.json';
import type { Locale } from './config';

export type TranslationKey = keyof typeof en;

const DICTIONARIES: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  en,
  ko,
};

/**
 * 韩文缺键时回落英文，绝不返回空串或裸键——
 * 页面上出现 "nav.pricing" 这样的裸键比显示英文更糟。
 */
export function useTranslations(locale: Locale) {
  return function t(key: TranslationKey): string {
    return DICTIONARIES[locale][key] ?? en[key];
  };
}
```

- [ ] **Step 8: 写 `src/i18n/paths.ts`**

```ts
import { LOCALES, type Locale } from './config';

/** 每个 src/pages/[lang]/ 下的页面都导出 `export const getStaticPaths = localeStaticPaths` */
export function localeStaticPaths(): { params: { lang: Locale } }[] {
  return LOCALES.map((lang) => ({ params: { lang } }));
}
```

- [ ] **Step 9: 运行测试确认通过**

Run: `npx vitest run tests/unit`
Expected: PASS（i18n.test.ts 与 site.test.ts 全部通过）

- [ ] **Step 10: 提交**

```bash
git add src/config/site.ts src/i18n tests/unit
git commit -m "feat: add site constants and i18n core with en/ko dictionaries"
```

---

## Task 3: 页面骨架 —— SEO 头、导航、页脚、语言切换

**Files:**
- Create: `src/components/SeoHead.astro`
- Create: `src/components/LanguageSwitcher.astro`
- Create: `src/components/SiteHeader.astro`
- Create: `src/components/SiteFooter.astro`
- Create: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/[lang]/index.astro`（用 BaseLayout 重写）
- Create: `src/pages/index.astro`
- Test: `tests/build/seo.test.mjs`
- Test: `tests/build/footer.test.mjs`

**Interfaces:**
- Consumes: `SITE`（Task 2）、`LOCALES` / `Locale` / `localizePath` / `stripLocale`（Task 2）、`useTranslations`（Task 2）、`localeStaticPaths`（Task 2）
- Produces:
  - `BaseLayout.astro` —— Props: `{ lang: Locale; title: string; description: string; path: string; variant?: 'marketing' | 'legal' }`。`path` 是**去掉语言前缀**的路径（`/pricing`、`/legal/refund`、`/` 表首页），供 canonical 与 hreflang 生成。`variant` 默认 `'marketing'`；`'legal'` 时 body 加 `data-quiet` 属性，CSS 据此关闭辉光与动效。所有后续页面一律用它包裹。
  - `SeoHead.astro` —— Props: `{ lang: Locale; title: string; description: string; path: string }`
  - `SiteHeader.astro` / `SiteFooter.astro` / `LanguageSwitcher.astro` —— Props 均为 `{ lang: Locale; path: string }`

- [ ] **Step 1: 写失败的 SEO 构建测试 `tests/build/seo.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';

const DOMAIN = 'https://teachflow-kr.example';
const read = (p) => parse(readFileSync(resolve(process.cwd(), 'dist', p), 'utf8'));

describe('SEO head', () => {
  it('points canonical at the page it sits on', () => {
    const en = read('en/index.html');
    expect(en.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${DOMAIN}/en`,
    );
    const ko = read('ko/index.html');
    expect(ko.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${DOMAIN}/ko`,
    );
  });

  it('cross-links both locales plus x-default on every page', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      const root = read(page);
      const alternates = root
        .querySelectorAll('link[rel="alternate"]')
        .map((el) => [el.getAttribute('hreflang'), el.getAttribute('href')]);
      expect(alternates).toEqual([
        ['en', `${DOMAIN}/en`],
        ['ko', `${DOMAIN}/ko`],
        ['x-default', `${DOMAIN}/en`],
      ]);
    }
  });

  it('never ships a noindex directive', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      const robots = read(page).querySelector('meta[name="robots"]');
      expect(robots?.getAttribute('content') ?? '').not.toContain('noindex');
    }
  });

  it('gives each page a non-empty description', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      const desc = read(page).querySelector('meta[name="description"]');
      expect((desc?.getAttribute('content') ?? '').length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 写失败的页脚构建测试 `tests/build/footer.test.mjs`**

页脚同时承担 Companies Act 2006 披露义务与 Stripe 主体一致性要求，两语都必须有，且是逐字的。

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');

const REQUIRED = [
  'CROSSXTOP LTD',
  'Company No. 16339041',
  'Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ',
  'mailto:vichajser@gmail.com',
];

describe('site footer', () => {
  it('discloses the legal entity in both locales', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      const html = read(page);
      for (const fragment of REQUIRED) {
        expect(html, `${page} is missing "${fragment}"`).toContain(fragment);
      }
    }
  });

  it('keeps the company address untranslated', () => {
    // 地址是法律记录，不随语言变化——翻译它会导致与 Companies House 不一致。
    expect(read('ko/index.html')).toContain(
      'Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ',
    );
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm run build && npx vitest run tests/build/seo.test.mjs tests/build/footer.test.mjs`
Expected: FAIL —— canonical 与 alternate 查询返回 `undefined`；页脚断言报缺 `CROSSXTOP LTD`。

- [ ] **Step 4: 写 `src/components/SeoHead.astro`**

```astro
---
import { SITE } from '@/config/site';
import { LOCALES, localizePath, type Locale } from '@/i18n/config';

interface Props {
  lang: Locale;
  title: string;
  description: string;
  /** 去掉语言前缀的路径，如 '/pricing'、'/legal/refund'、'/' */
  path: string;
}

const { lang, title, description, path } = Astro.props;

const url = (locale: Locale) => `${SITE.domain}${localizePath(path, locale)}`;
---

<title>{title}</title>
<meta name="description" content={description} />
<link rel="canonical" href={url(lang)} />
{LOCALES.map((locale) => (
  <link rel="alternate" hreflang={locale} href={url(locale)} />
))}
<link rel="alternate" hreflang="x-default" href={url('en')} />

<meta property="og:type" content="website" />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:url" content={url(lang)} />
<meta property="og:locale" content={lang === 'ko' ? 'ko_KR' : 'en_GB'} />
```

`x-default` 必须排在两条 hreflang 之后 —— 测试按顺序断言。

- [ ] **Step 5: 写 `src/components/LanguageSwitcher.astro`**

切换语言保持当前路径，不回首页（spec §3.1）。

```astro
---
import { LOCALES, localizePath, type Locale } from '@/i18n/config';
import { useTranslations } from '@/i18n/t';

interface Props {
  lang: Locale;
  /** 去掉语言前缀的当前路径 */
  path: string;
}

const { lang, path } = Astro.props;
const t = useTranslations(lang);
---

<nav aria-label={t('lang.switch')} class="flex items-center gap-2 text-sm">
  {LOCALES.map((locale) => (
    <a
      href={localizePath(path, locale)}
      hreflang={locale}
      lang={locale}
      aria-current={locale === lang ? 'true' : undefined}
      class:list={[
        'px-2 py-1 rounded transition-colors',
        locale === lang
          ? 'text-text-hi bg-raised'
          : 'text-text-mute hover:text-text-body',
      ]}
    >
      {locale === 'en' ? t('lang.en') : t('lang.ko')}
    </a>
  ))}
</nav>
```

- [ ] **Step 6: 写 `src/components/SiteHeader.astro`**

全站唯一的毛玻璃（spec §5.3）。

```astro
---
import LanguageSwitcher from './LanguageSwitcher.astro';
import { localizePath, type Locale } from '@/i18n/config';
import { useTranslations } from '@/i18n/t';

interface Props {
  lang: Locale;
  path: string;
}

const { lang, path } = Astro.props;
const t = useTranslations(lang);

const links = [
  { href: '/skills', label: t('nav.skills') },
  { href: '/samples', label: t('nav.samples') },
  { href: '/pricing', label: t('nav.pricing') },
  { href: '/security', label: t('nav.security') },
  { href: '/docs', label: t('nav.docs') },
  { href: '/faq', label: t('nav.faq') },
];
---

<header
  class="sticky top-0 z-50 border-b border-border bg-void/70 backdrop-blur-md"
>
  <div class="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
    <a
      href={localizePath('/', lang)}
      class="font-mono text-text-hi tracking-tight"
    >TeachFlow<span class="text-accent-glow">-KR</span></a>

    <nav aria-label={t('nav.home')} class="hidden gap-5 text-sm md:flex">
      {links.map((link) => (
        <a
          href={localizePath(link.href, lang)}
          aria-current={path === link.href ? 'page' : undefined}
          class:list={[
            'transition-colors',
            path === link.href ? 'text-text-hi' : 'text-text-body hover:text-text-hi',
          ]}
        >{link.label}</a>
      ))}
    </nav>

    <div class="ml-auto"><LanguageSwitcher lang={lang} path={path} /></div>
  </div>
</header>
```

- [ ] **Step 7: 写 `src/components/SiteFooter.astro`**

```astro
---
import { SITE } from '@/config/site';
import { localizePath, type Locale } from '@/i18n/config';
import { useTranslations } from '@/i18n/t';

interface Props {
  lang: Locale;
  path: string;
}

const { lang } = Astro.props;
const t = useTranslations(lang);

const legalLinks = [
  { href: '/legal/terms', label: t('footer.terms') },
  { href: '/legal/privacy', label: t('footer.privacy') },
  { href: '/legal/refund', label: t('footer.refund') },
  { href: '/legal/delivery', label: t('footer.delivery') },
];
---

<footer class="mt-24 border-t border-border bg-surface">
  <div class="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-2">
    <section>
      <h2 class="mb-3 text-sm font-semibold text-text-hi">{t('footer.legal')}</h2>
      <ul class="space-y-1 text-sm">
        {legalLinks.map((link) => (
          <li>
            <a
              href={localizePath(link.href, lang)}
              class="text-text-body underline-offset-2 hover:text-text-hi hover:underline"
            >{link.label}</a>
          </li>
        ))}
      </ul>
    </section>

    <section>
      <h2 class="mb-3 text-sm font-semibold text-text-hi">{t('footer.support')}</h2>
      <p class="text-sm text-text-body">{t('footer.supportLine')}</p>
      <a
        href={`mailto:${SITE.supportEmail}`}
        class="mt-1 inline-block font-mono text-sm text-accent hover:underline"
      >{SITE.supportEmail}</a>
    </section>
  </div>

  <!--
    Companies Act 2006 的网站披露义务与 Stripe 主体一致性要求在此一并满足。
    这段文字不翻译：它必须与 Companies House 公开记录逐字一致。
  -->
  <div class="border-t border-border">
    <address
      lang="en"
      class="mx-auto max-w-6xl px-4 py-6 text-xs not-italic leading-relaxed text-text-mute"
    >
      {SITE.companyName} · {t('footer.registered')} · Company No. {SITE.companyNumber}<br />
      {SITE.address}
    </address>
  </div>
</footer>
```

`t('footer.registered')` 在英文下即 `Registered in England and Wales`，与 spec §3.3 的逐字要求一致；韩文页翻译的只是这一句说明，公司名、注册号、地址三项保持原文。

- [ ] **Step 8: 写 `src/layouts/BaseLayout.astro`**

```astro
---
import '@/styles/global.css';
import SeoHead from '@/components/SeoHead.astro';
import SiteHeader from '@/components/SiteHeader.astro';
import SiteFooter from '@/components/SiteFooter.astro';
import type { Locale } from '@/i18n/config';

interface Props {
  lang: Locale;
  title: string;
  description: string;
  /** 去掉语言前缀的路径，如 '/pricing'、'/' */
  path: string;
  /** 'legal' 关闭辉光与动效（spec §5.5 合规区静音） */
  variant?: 'marketing' | 'legal';
}

const { lang, title, description, path, variant = 'marketing' } = Astro.props;
---

<!doctype html>
<html lang={lang}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <SeoHead lang={lang} title={title} description={description} path={path} />
  </head>
  <body
    data-quiet={variant === 'legal' ? '' : undefined}
    class="min-h-screen bg-void text-text-body antialiased"
  >
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-raised focus:px-3 focus:py-2 focus:text-text-hi"
    >Skip to content</a>

    <SiteHeader lang={lang} path={path} />
    <main id="main" class="mx-auto max-w-6xl px-4"><slot /></main>
    <SiteFooter lang={lang} path={path} />
  </body>
</html>
```

- [ ] **Step 9: 在 `src/styles/global.css` 末尾追加静音与减动效规则**

```css
/* spec §5.5：合规区静音——/pricing 与 /legal/* 取消辉光与动效 */
body[data-quiet] * {
  box-shadow: none !important;
  animation: none !important;
  transition: none !important;
}

/* spec §8：prefers-reduced-motion 下渲染终态，无任何位移 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 10: 用 BaseLayout 重写 `src/pages/[lang]/index.astro`**

首页内容在 Task 6 填充，这里先让骨架跑通。

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import { useTranslations } from '@/i18n/t';
import type { Locale } from '@/i18n/config';

export { localeStaticPaths as getStaticPaths } from '@/i18n/paths';

const lang = Astro.params.lang as Locale;
const t = useTranslations(lang);
---

<BaseLayout lang={lang} title="TeachFlow-KR" description={t('site.tagline')} path="/">
  <h1 class="py-24 text-4xl font-semibold text-text-hi">TeachFlow-KR</h1>
</BaseLayout>
```

- [ ] **Step 11: 写 `src/pages/index.astro`（根重定向）**

纯静态托管下用 meta refresh + canonical，同时 Caddy 层也会做 302（Task 12）。两层都做：直接命中 `index.html` 的爬虫靠 meta，浏览器访问靠 Caddy。

```astro
---
import { SITE } from '@/config/site';
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=/en" />
    <link rel="canonical" href={`${SITE.domain}/en`} />
    <title>TeachFlow-KR</title>
  </head>
  <body>
    <p><a href="/en">Continue to TeachFlow-KR</a></p>
  </body>
</html>
```

- [ ] **Step 12: 构建并运行测试确认通过**

Run: `npm run build && npx vitest run`
Expected: PASS（smoke / seo / footer / unit 全绿）

- [ ] **Step 13: 提交**

```bash
git add src/components src/layouts src/styles/global.css "src/pages/[lang]/index.astro" src/pages/index.astro tests/build
git commit -m "feat: add base layout with SEO head, header, footer and language switcher"
```

---

## Task 4: 六 skill 数据模型与 `/skills` 页

**Files:**
- Create: `src/data/skills.ts`
- Create: `src/content/config.ts`
- Create: `src/content/skills/en/lesson-workflow.md`（另 5 个同构，见 Step 6）
- Create: `src/content/skills/ko/lesson-workflow.md`（另 5 个同构，见 Step 6）
- Create: `src/components/SkillCard.astro`
- Create: `src/pages/[lang]/skills.astro`
- Test: `tests/unit/skills.test.ts`

**Interfaces:**
- Consumes: `BaseLayout`（Task 3）、`Locale` / `localizePath`（Task 2）、`useTranslations`（Task 2）
- Produces:
  - `type SkillId = 'lesson-workflow' | 'ppt-workflow' | 'audio-workflow' | 'word-workflow' | 'worksheet-workflow' | 'report-workflow'`
  - `type SkillStage = 1 | 2 | 3`
  - `interface SkillMeta { id: SkillId; stage: SkillStage; order: number; outputs: string[] }`
  - `SKILLS: readonly SkillMeta[]`（按 `order` 升序）
  - `STAGE_COLOR: Record<SkillStage, string>` —— `1: '#22D3EE'`、`2: '#2E7DFF'`、`3: '#A855F7'`
  - `stageClass(stage: SkillStage): string` —— 返回 Tailwind 类名串，供卡片与徽章复用
  - 内容集合 `skills`，frontmatter schema：`{ id: SkillId; lang: Locale; title: string; tagline: string; inputs: string[]; checks: string[] }`，正文为产出说明
  - `SkillCard.astro` —— Props: `{ lang: Locale; skill: SkillMeta; title: string; tagline: string; href: string }`

- [ ] **Step 1: 写失败的数据模型测试 `tests/unit/skills.test.ts`**

阶段配色是全站信息编码（spec §5.2），错一处整套图例就失效，用测试钉死。

```ts
import { describe, it, expect } from 'vitest';
import { SKILLS, STAGE_COLOR, stageClass } from '@/data/skills';

describe('SKILLS', () => {
  it('describes exactly the six shipped skills, in pipeline order', () => {
    expect(SKILLS.map((s) => s.id)).toEqual([
      'lesson-workflow',
      'ppt-workflow',
      'audio-workflow',
      'word-workflow',
      'worksheet-workflow',
      'report-workflow',
    ]);
  });

  it('puts lesson-workflow alone in stage 1 and report-workflow alone in stage 3', () => {
    expect(SKILLS.filter((s) => s.stage === 1).map((s) => s.id)).toEqual([
      'lesson-workflow',
    ]);
    expect(SKILLS.filter((s) => s.stage === 3).map((s) => s.id)).toEqual([
      'report-workflow',
    ]);
    expect(SKILLS.filter((s) => s.stage === 2)).toHaveLength(4);
  });

  it('lists the real file extensions each skill produces', () => {
    const byId = Object.fromEntries(SKILLS.map((s) => [s.id, s.outputs]));
    expect(byId['ppt-workflow']).toEqual(['.pptx']);
    expect(byId['audio-workflow']).toEqual(['.mp3']);
    expect(byId['word-workflow']).toEqual(['.xlsx', '.csv']);
    expect(byId['worksheet-workflow']).toEqual(['.docx', '.docx', '.docx']);
    expect(byId['report-workflow']).toEqual(['.png']);
  });
});

describe('stage colours', () => {
  it('matches the palette the whole site encodes stages with', () => {
    expect(STAGE_COLOR).toEqual({
      1: '#22D3EE',
      2: '#2E7DFF',
      3: '#A855F7',
    });
  });

  it('returns a distinct class string per stage', () => {
    const classes = new Set([stageClass(1), stageClass(2), stageClass(3)]);
    expect(classes.size).toBe(3);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/skills.test.ts`
Expected: FAIL —— `Failed to resolve import "@/data/skills"`

- [ ] **Step 3: 写 `src/data/skills.ts`**

`outputs` 逐字取自 README §4：worksheet-workflow 产出**三个** `.docx`（학생용 학습지 / 심화 도전 카드 / 교사용 정답지），word-workflow 同时给 `.xlsx` 与 `.csv`。

```ts
export type SkillId =
  | 'lesson-workflow'
  | 'ppt-workflow'
  | 'audio-workflow'
  | 'word-workflow'
  | 'worksheet-workflow'
  | 'report-workflow';

/** 1 = 流程源头；2 = 并列独立；3 = 课后终点（spec §5.2） */
export type SkillStage = 1 | 2 | 3;

export interface SkillMeta {
  id: SkillId;
  stage: SkillStage;
  order: number;
  /** 产物文件扩展名，按实际产出数量重复列出 */
  outputs: string[];
}

export const SKILLS: readonly SkillMeta[] = [
  { id: 'lesson-workflow', stage: 1, order: 1, outputs: [] },
  { id: 'ppt-workflow', stage: 2, order: 2, outputs: ['.pptx'] },
  { id: 'audio-workflow', stage: 2, order: 3, outputs: ['.mp3'] },
  { id: 'word-workflow', stage: 2, order: 4, outputs: ['.xlsx', '.csv'] },
  {
    id: 'worksheet-workflow',
    stage: 2,
    order: 5,
    // 학생용 학습지 / 심화 도전 카드 / 교사용 정답지 —— 三份独立 docx
    outputs: ['.docx', '.docx', '.docx'],
  },
  { id: 'report-workflow', stage: 3, order: 6, outputs: ['.png'] },
] as const;

export const STAGE_COLOR: Record<SkillStage, string> = {
  1: '#22D3EE',
  2: '#2E7DFF',
  3: '#A855F7',
};

/**
 * 霓虹色只走描边与辉光，不进正文（spec §5.1 约束）。
 * 因此这里返回的是 border/shadow 类，不含 text-*。
 */
export function stageClass(stage: SkillStage): string {
  switch (stage) {
    case 1:
      return 'border-accent-glow shadow-[0_0_24px_rgba(34,211,238,0.25)]';
    case 2:
      return 'border-accent shadow-[0_0_24px_rgba(46,125,255,0.25)]';
    case 3:
      return 'border-accent-warm shadow-[0_0_24px_rgba(168,85,247,0.25)]';
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/skills.test.ts`
Expected: PASS（6 passed）

- [ ] **Step 5: 写 `src/content/config.ts`**

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const LOCALE = z.enum(['en', 'ko']);

const skills = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/skills' }),
  schema: z.object({
    id: z.enum([
      'lesson-workflow',
      'ppt-workflow',
      'audio-workflow',
      'word-workflow',
      'worksheet-workflow',
      'report-workflow',
    ]),
    lang: LOCALE,
    title: z.string(),
    tagline: z.string(),
    /** 教师需要提供什么（README §4 的"입력" 表） */
    inputs: z.array(z.string()).min(1),
    /** 教师拿到产物后必须自查什么（README §4 的"교사 확인 사항"） */
    checks: z.array(z.string()).min(1),
  }),
});

const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
  schema: z.object({
    slug: z.enum(['terms', 'privacy', 'refund', 'delivery']),
    lang: LOCALE,
    title: z.string(),
    description: z.string(),
    updated: z.string(),
  }),
});

const faq = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/faq' }),
  schema: z.object({
    lang: LOCALE,
    order: z.number(),
    question: z.string(),
  }),
});

export const collections = { skills, legal, faq };
```

- [ ] **Step 6: 写六个 skill 的英韩内容文件**

内容源为 `TeachFlow-KR/docs/README.md` §4.1–§4.6。**必须打开 README 逐条誊写**，不得凭印象编写——`inputs` 与 `checks` 是产品行为的准确描述，写错会在 `/skills` 页上误导用户。

文件命名：`src/content/skills/{en,ko}/<skill-id>.md`，共 12 个文件。

`src/content/skills/ko/ppt-workflow.md` 作为格式样板（韩文版直接用 README 原文措辞）：

```markdown
---
id: ppt-workflow
lang: ko
title: 수업 슬라이드
tagline: 수업 지도안의 PPT 개요를 그대로 편집 가능한 .pptx로 바꿉니다.
inputs:
  - PPT 개요 (필수 — lesson-workflow 모드 C의 산출물)
  - 교재 원문 (필수)
  - 시각 스타일 (필수 — 내장 10종 중 선택하거나 자유롭게 설명)
checks:
  - 슬라이드 수가 개요와 정확히 일치하는지 (생략·병합·순서 변경이 없는지)
  - 과제 슬라이드에 정답이 없는지 (정답은 별도 Answer Check 슬라이드에만)
  - 읽기 수업이라면 교재 원문이 그대로 들어갔는지
  - 본문 글자 크기가 22pt 이상인지 (교실 뒷자리에서 읽을 수 있는지)
  - 교사용 설명이 화면이 아니라 슬라이드 노트에 있는지
---

텍스트·표·도형이 모두 실제 객체로 들어가므로 PowerPoint, 한컴오피스, Keynote에서
그대로 편집할 수 있습니다. 글자를 이미지로 구워 넣지 않습니다.

미니멀한 발표용 슬라이드나 사진 포스터가 아닙니다. 교재 원문, 질문, 과제 지시,
문장 지원 틀, 어휘 힌트, 표, 산출 틀이 실제로 들어간 수업용 슬라이드입니다.

한국어 글꼴은 Noto Sans KR → Pretendard → Apple SD Gothic Neo(macOS) →
맑은 고딕(Windows) 순으로 대체됩니다.
```

英文版 `src/content/skills/en/ppt-workflow.md` 为同一内容的英文表述，`lang: en`，其余 frontmatter 字段结构一致。

其余五个 skill 按同一结构誊写，各自的要点（**仍需回 README 核对细节后再写**）：

- `lesson-workflow` —— 阶段 1，流程源头。四个子产物：단원 차시 분할 → 차시 수업 설계안 → 수업 지도안 → PPT 개요。上位阶段约束向下流动，下位不得推翻上位（README §3.3）。
- `audio-workflow` —— 产出 Audio Script（2인 대화, **영어만**）、Scene、Sample Context、Listening Tasks(5문항 + 정답)、음성 파일。最关键检查项：**Listening Tasks는 절대 음성에 넣지 않습니다**。TTS 없으면 스크립트만 나오며, 교사가 직접 TTS에 넣을 때 Listening Tasks 부분은 붙여넣지 않아야 합니다。
- `word-workflow` —— `.xlsx` + `.csv`，단어당 11개 필드。레벨별 단어 수 A1/A2 5–8, B1 8–12, B2/C1 10–15。两条必查：**발음 기호는 직접 확인**（AI가 가장 자주 틀리는 항목）、**교재 예문은 한 줄씩 대조**（두 번째로 잦은 오류）。근거 없으면 비워 두고 표시하며 지어내지 않습니다。학생 자가 점검 칸은 비워 둡니다。
- `worksheet-workflow` —— 三份 `.docx`。세 수준이 **같은 핵심 학습 내용을 확인**하며, 서로 다른 시험이 아닙니다。Foundation=Sage Green, Core=Warm Orange, Extension=Terracotta。학생용 두 파일에 정답이 없어야 합니다。
- `report-workflow` —— 阶段 3，A4 세로 PNG。6개 항목 중 **4번(학생 참여 모습)은 반드시 비어 있어야** 합니다 —— 교사가 직접 관찰한 내용을 손으로 적을 때만 의미가 있습니다。**개인정보 처리 기준**：학생 실명·학번·개별 성적·석차·사진·연락처를 안내문에 넣지 않으며, 학급 단위 내용만 담습니다（개인정보 보호법 및 교육부 학교 개인정보 보호 지침）。

- [ ] **Step 7: 写 `src/components/SkillCard.astro`**

```astro
---
import { stageClass, type SkillMeta } from '@/data/skills';
import type { Locale } from '@/i18n/config';

interface Props {
  lang: Locale;
  skill: SkillMeta;
  title: string;
  tagline: string;
  href: string;
}

const { skill, title, tagline, href } = Astro.props;
---

<a
  href={href}
  class:list={[
    'block rounded-xl border bg-surface p-5 transition-transform hover:-translate-y-0.5',
    stageClass(skill.stage),
  ]}
>
  <h3 class="mb-1 text-lg font-semibold text-text-hi">{title}</h3>
  <p class="mb-3 text-sm text-text-body">{tagline}</p>
  <p class="font-mono text-xs text-text-mute">
    {skill.outputs.length > 0 ? skill.outputs.join('  ') : '—'}
  </p>
</a>
```

- [ ] **Step 8: 写 `src/pages/[lang]/skills.astro`**

```astro
---
import { getCollection, render } from 'astro:content';
import BaseLayout from '@/layouts/BaseLayout.astro';
import { SKILLS, stageClass } from '@/data/skills';
import { useTranslations } from '@/i18n/t';
import type { Locale } from '@/i18n/config';

export { localeStaticPaths as getStaticPaths } from '@/i18n/paths';

const lang = Astro.params.lang as Locale;
const t = useTranslations(lang);

const entries = await getCollection('skills', (e) => e.data.lang === lang);
const byId = new Map(entries.map((e) => [e.data.id, e]));

const sections = await Promise.all(
  SKILLS.map(async (skill) => {
    const entry = byId.get(skill.id);
    if (!entry) throw new Error(`Missing ${lang} content for skill ${skill.id}`);
    const { Content } = await render(entry);
    return { skill, data: entry.data, Content };
  }),
);
---

<BaseLayout
  lang={lang}
  title={`${t('nav.skills')} — TeachFlow-KR`}
  description={t('site.tagline')}
  path="/skills"
>
  <h1 class="pt-16 pb-10 text-4xl font-semibold text-text-hi">{t('nav.skills')}</h1>

  <div class="space-y-12 pb-16">
    {sections.map(({ skill, data, Content }) => (
      <article
        id={skill.id}
        class:list={['rounded-xl border bg-surface p-6', stageClass(skill.stage)]}
      >
        <header class="mb-4">
          <p class="font-mono text-xs text-text-mute">{skill.id}</p>
          <h2 class="text-2xl font-semibold text-text-hi">{data.title}</h2>
          <p class="text-text-body">{data.tagline}</p>
        </header>

        <div class="prose-invert max-w-none text-text-body"><Content /></div>

        <div class="mt-6 grid gap-6 md:grid-cols-2">
          <section>
            <h3 class="mb-2 text-sm font-semibold text-text-hi">{t('skills.inputs')}</h3>
            <ul class="list-disc space-y-1 pl-5 text-sm text-text-body">
              {data.inputs.map((item) => <li>{item}</li>)}
            </ul>
          </section>
          <section>
            <h3 class="mb-2 text-sm font-semibold text-text-hi">{t('skills.checks')}</h3>
            <ul class="list-disc space-y-1 pl-5 text-sm text-text-body">
              {data.checks.map((item) => <li>{item}</li>)}
            </ul>
          </section>
        </div>

        {skill.outputs.length > 0 && (
          <p class="mt-4 font-mono text-xs text-text-mute">
            {t('skills.outputs')}: {skill.outputs.join('  ')}
          </p>
        )}
      </article>
    ))}
  </div>
</BaseLayout>
```

- [ ] **Step 9: 补三个新翻译键**

`src/i18n/en.json` 追加：

```json
  "skills.inputs": "What you provide",
  "skills.checks": "What to check before class",
  "skills.outputs": "Produces"
```

`src/i18n/ko.json` 追加：

```json
  "skills.inputs": "교사가 준비할 것",
  "skills.checks": "수업 전 확인 사항",
  "skills.outputs": "산출물"
```

- [ ] **Step 10: 构建并运行全部测试**

Run: `npm run build && npx vitest run`
Expected: PASS。若某个 skill 缺内容文件，构建会抛 `Missing <lang> content for skill <id>` —— 这是刻意的，缺内容必须构建失败而不是静默出空页。

- [ ] **Step 11: 提交**

```bash
git add src/data/skills.ts src/content "src/pages/[lang]/skills.astro" src/components/SkillCard.astro src/i18n tests/unit/skills.test.ts
git commit -m "feat: add skill data model and bilingual /skills page"
```

---

## Task 5: `/security` 页 —— Agensi 八点扫描对照表

**Files:**
- Create: `src/data/security-matrix.ts`
- Create: `src/pages/[lang]/security.astro`
- Test: `tests/unit/security-matrix.test.ts`
- Test: `tests/build/security-claims.test.mjs`

**Interfaces:**
- Consumes: `BaseLayout`（Task 3）、`Locale`（Task 2）、`useTranslations`（Task 2）
- Produces:
  - `interface SecurityRow { scan: string; practice: Record<Locale, string>; verify: Record<Locale, string> }`
  - `SECURITY_MATRIX: readonly SecurityRow[]` —— 8 行，`scan` 值与 Agensi 扫描项名称逐字一致
  - `VERIFIABLE_FACTS: readonly { id: 'no-executable-code' | 'verify-script'; text: Record<Locale, string> }[]`

- [ ] **Step 1: 写失败的数据测试 `tests/unit/security-matrix.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { SECURITY_MATRIX, VERIFIABLE_FACTS } from '@/data/security-matrix';

const AGENSI_SCANS = [
  'Prompt injection',
  'Data exfiltration',
  'Secret detection',
  'Dangerous commands',
  'Obfuscation',
  'External fetch',
  'Credential access',
  'Privilege escalation',
];

describe('SECURITY_MATRIX', () => {
  it("mirrors Agensi's eight scans, in their order and wording", () => {
    expect(SECURITY_MATRIX.map((row) => row.scan)).toEqual(AGENSI_SCANS);
  });

  it('answers every scan in both locales', () => {
    for (const row of SECURITY_MATRIX) {
      for (const locale of ['en', 'ko'] as const) {
        expect(row.practice[locale].length, `${row.scan} practice.${locale}`)
          .toBeGreaterThan(0);
        expect(row.verify[locale].length, `${row.scan} verify.${locale}`)
          .toBeGreaterThan(0);
      }
    }
  });
});

describe('VERIFIABLE_FACTS', () => {
  it('offers the two facts a reader can check for themselves', () => {
    expect(VERIFIABLE_FACTS.map((f) => f.id)).toEqual([
      'no-executable-code',
      'verify-script',
    ]);
  });
});
```

- [ ] **Step 2: 写失败的措辞纪律测试 `tests/build/security-claims.test.mjs`**

这条测试防的是最危险的失误：在安全页上写出无依据的断言。Stripe 与 Agensi 都会核查，一句"通过第三方安全审计"足以毁掉整个审核。

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');

/** 无依据的断言——_SPEC.md 中没有任何东西支撑这些说法 */
const UNSUPPORTED_CLAIMS = [
  /third[- ]party security audit/i,
  /independently audited/i,
  /penetration[- ]tested/i,
  /certified secure/i,
  /제3자 보안 감사/,
  /보안 인증을 받았/,
];

describe('/security wording discipline', () => {
  it('states only what _SPEC.md actually constrains', () => {
    for (const page of ['en/security/index.html', 'ko/security/index.html']) {
      const html = read(page);
      for (const claim of UNSUPPORTED_CLAIMS) {
        expect(html, `${page} makes an unsupported claim: ${claim}`).not.toMatch(claim);
      }
    }
  });

  it('names all eight Agensi scans on the English page', () => {
    const html = read('en/security/index.html');
    for (const scan of [
      'Prompt injection',
      'Data exfiltration',
      'Secret detection',
      'Dangerous commands',
      'Obfuscation',
      'External fetch',
      'Credential access',
      'Privilege escalation',
    ]) {
      expect(html, `missing scan row: ${scan}`).toContain(scan);
    }
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/unit/security-matrix.test.ts`
Expected: FAIL —— `Failed to resolve import "@/data/security-matrix"`

- [ ] **Step 4: 写 `src/data/security-matrix.ts`**

`practice` 逐条对应 `_SPEC.md` §3；`verify` 是用户可自行走通的检查路径。两列都不许超出 `_SPEC.md` 的实际约束。

```ts
import type { Locale } from '@/i18n/config';

export interface SecurityRow {
  /** Agensi 扫描项名称，逐字不改——审核员按名称对照 */
  scan: string;
  practice: Record<Locale, string>;
  verify: Record<Locale, string>;
}

export const SECURITY_MATRIX: readonly SecurityRow[] = [
  {
    scan: 'Prompt injection',
    practice: {
      en: 'Uploaded textbook content is handled as data. It is never executed as instructions.',
      ko: '업로드한 교재 내용은 데이터로만 처리하며, 지시문으로 실행하지 않습니다.',
    },
    verify: {
      en: 'Read the skill files — every instruction the model follows is in plain Markdown you can review.',
      ko: '스킬 파일을 직접 읽어 보세요. 모델이 따르는 모든 지시가 읽을 수 있는 Markdown에 그대로 있습니다.',
    },
  },
  {
    scan: 'Data exfiltration',
    practice: {
      en: 'File reads and writes stay inside the current working directory; output goes to outputs/. Never ~, /etc or /usr.',
      ko: '파일 읽기와 쓰기는 현재 작업 폴더 안으로 제한되며 산출물은 outputs/에 저장됩니다. ~, /etc, /usr는 건드리지 않습니다.',
    },
    verify: {
      en: 'Search the skill files for a path outside the working directory — there is none.',
      ko: '스킬 파일에서 작업 폴더 밖의 경로를 검색해 보세요. 하나도 없습니다.',
    },
  },
  {
    scan: 'Secret detection',
    practice: {
      en: 'No hardcoded credentials. Where a credential is needed, only the environment variable name appears.',
      ko: '하드코딩된 인증 정보가 없습니다. 인증이 필요한 경우에도 환경 변수 이름만 등장합니다.',
    },
    verify: {
      en: 'Grep the package for keys and tokens — the files are plain text and fully searchable.',
      ko: '패키지 전체를 검색해 보세요. 모두 일반 텍스트라 그대로 확인할 수 있습니다.',
    },
  },
  {
    scan: 'Dangerous commands',
    practice: {
      en: 'Only whitelisted tools run: python-pptx, python-docx, openpyxl, soffice/LibreOffice, and headless Chrome for local HTML rendering only.',
      ko: '허용된 도구만 실행합니다: python-pptx, python-docx, openpyxl, soffice/LibreOffice, 그리고 로컬 HTML 렌더링 전용 headless Chrome.',
    },
    verify: {
      en: 'Every command the skills may run is listed in the skill files themselves.',
      ko: '스킬이 실행할 수 있는 모든 명령이 스킬 파일 안에 명시되어 있습니다.',
    },
  },
  {
    scan: 'Obfuscation',
    practice: {
      en: 'No base64 blobs, no escape tricks, no invisible Unicode.',
      ko: 'base64 문자열, 이스케이프 트릭, 보이지 않는 유니코드를 쓰지 않습니다.',
    },
    verify: {
      en: 'Open any file in the package — all of it is readable prose and structured instructions.',
      ko: '패키지의 아무 파일이나 열어 보세요. 전부 읽을 수 있는 문장과 구조화된 지시입니다.',
    },
  },
  {
    scan: 'External fetch',
    practice: {
      en: 'No network access at all: no external URLs, no remote script downloads, no external API calls.',
      ko: '네트워크 접근이 전혀 없습니다. 외부 URL 요청, 원격 스크립트 다운로드, 외부 API 호출을 하지 않습니다.',
    },
    verify: {
      en: 'Run the skills with your machine offline — everything still works.',
      ko: '인터넷을 끊은 상태에서 실행해 보세요. 그대로 동작합니다.',
    },
  },
  {
    scan: 'Credential access',
    practice: {
      en: 'No reads from the keychain, .ssh, .aws, browser credential stores, or any other credential location.',
      ko: '키체인, .ssh, .aws, 브라우저 인증 저장소 등 어떤 인증 정보도 읽지 않습니다.',
    },
    verify: {
      en: 'Search the package for those paths — none appear.',
      ko: '패키지에서 해당 경로들을 검색해 보세요. 전혀 나오지 않습니다.',
    },
  },
  {
    scan: 'Privilege escalation',
    practice: {
      en: 'No sudo, no chmod 777, no rm -rf, no curl | sh, no eval.',
      ko: 'sudo, chmod 777, rm -rf, curl | sh, eval을 사용하지 않습니다.',
    },
    verify: {
      en: 'Search for each of those strings — none appear in the package.',
      ko: '해당 문자열들을 하나씩 검색해 보세요. 패키지 어디에도 없습니다.',
    },
  },
] as const;

/** README §8 的两条可验证事实——比任何断言都强，因为读者能自己走一遍 */
export const VERIFIABLE_FACTS = [
  {
    id: 'no-executable-code',
    text: {
      en: 'The package contains no executable code. It is 32 Markdown documents, and you can read every instruction in them.',
      ko: '패키지에 실행 코드가 없습니다. 32개의 Markdown 문서뿐이며, 모든 지시를 직접 읽어 볼 수 있습니다.',
    },
  },
  {
    id: 'verify-script',
    text: {
      en: 'The package ships verify.py, an integrity check you run yourself. [PASS] means nothing has been tampered with.',
      ko: '패키지에 무결성 검사 도구 verify.py가 들어 있습니다. 직접 실행해 [PASS]가 나오면 변조되지 않은 것입니다.',
    },
  },
] as const;
```

- [ ] **Step 5: 补翻译键**

`src/i18n/en.json` 追加：

```json
  "security.title": "Security & privacy",
  "security.lead": "Student names and scanned textbook pages never leave your computer.",
  "security.col.scan": "Agensi security scan",
  "security.col.practice": "What we do",
  "security.col.verify": "How you can check",
  "security.facts": "Two things you can verify yourself"
```

`src/i18n/ko.json` 追加：

```json
  "security.title": "보안과 개인정보",
  "security.lead": "학생 이름과 교재 스캔본은 선생님 컴퓨터를 떠나지 않습니다.",
  "security.col.scan": "Agensi 보안 검사 항목",
  "security.col.practice": "저희가 하는 것",
  "security.col.verify": "직접 확인하는 방법",
  "security.facts": "직접 확인할 수 있는 두 가지"
```

- [ ] **Step 6: 写 `src/pages/[lang]/security.astro`**

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import { SECURITY_MATRIX, VERIFIABLE_FACTS } from '@/data/security-matrix';
import { useTranslations } from '@/i18n/t';
import type { Locale } from '@/i18n/config';

export { localeStaticPaths as getStaticPaths } from '@/i18n/paths';

const lang = Astro.params.lang as Locale;
const t = useTranslations(lang);
---

<BaseLayout
  lang={lang}
  title={`${t('security.title')} — TeachFlow-KR`}
  description={t('security.lead')}
  path="/security"
>
  <h1 class="pt-16 text-4xl font-semibold text-text-hi">{t('security.title')}</h1>
  <p class="mt-3 max-w-2xl text-lg text-text-body">{t('security.lead')}</p>

  <section class="mt-12">
    <h2 class="mb-4 text-xl font-semibold text-text-hi">{t('security.facts')}</h2>
    <ul class="grid gap-4 md:grid-cols-2">
      {VERIFIABLE_FACTS.map((fact) => (
        <li class="rounded-xl border border-accent-glow bg-surface p-5 text-text-body">
          {fact.text[lang]}
        </li>
      ))}
    </ul>
  </section>

  <section class="mt-12 pb-16">
    <div class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full border-collapse text-left text-sm">
        <thead class="bg-raised text-text-hi">
          <tr>
            <th scope="col" class="px-4 py-3 font-semibold">{t('security.col.scan')}</th>
            <th scope="col" class="px-4 py-3 font-semibold">{t('security.col.practice')}</th>
            <th scope="col" class="px-4 py-3 font-semibold">{t('security.col.verify')}</th>
          </tr>
        </thead>
        <tbody>
          {SECURITY_MATRIX.map((row) => (
            <tr class="border-t border-border align-top">
              <th scope="row" class="px-4 py-3 font-mono text-xs font-normal text-text-hi">
                {row.scan}
              </th>
              <td class="px-4 py-3 text-text-body">{row.practice[lang]}</td>
              <td class="px-4 py-3 text-text-mute">{row.verify[lang]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
</BaseLayout>
```

表格第一列用 `<th scope="row">` 而非 `<td>` —— 屏幕阅读器需要行头才能把"我们的做法"关联到扫描项上（验收要求可访问性 ≥ 95）。

- [ ] **Step 7: 构建并运行测试确认通过**

Run: `npm run build && npx vitest run`
Expected: PASS（含 security-matrix 与 security-claims）

- [ ] **Step 8: 提交**

```bash
git add src/data/security-matrix.ts "src/pages/[lang]/security.astro" src/i18n tests/unit/security-matrix.test.ts tests/build/security-claims.test.mjs
git commit -m "feat: add /security page mapping Agensi's eight scans to verifiable practices"
```

---

## Task 6: `/pricing` 页与价格组件

**Files:**
- Create: `src/components/PriceBlock.astro`
- Create: `src/pages/[lang]/pricing.astro`
- Test: `tests/build/pricing.test.mjs`

**Interfaces:**
- Consumes: `SITE`（Task 2）、`SKILLS`（Task 4）、`BaseLayout`（Task 3，用 `variant="legal"`）、`useTranslations`（Task 2）
- Produces: `PriceBlock.astro` —— Props: `{ lang: Locale }`。渲染 `SITE.price.display`，是全站**唯一**输出价格文字的组件。任何其他地方需要显示价格都必须复用它。

- [ ] **Step 1: 写失败的定价页构建测试 `tests/build/pricing.test.mjs`**

这页是 Stripe 审核员停留最久的一页。四条断言分别对应 spec §6.1 的四个硬性项。

```js
import { describe, it, expect } from 'vitest';
import fg from 'fast-glob';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');
const PAGES = ['en/pricing/index.html', 'ko/pricing/index.html'];

describe('/pricing', () => {
  it('states the price with an explicit currency code', () => {
    for (const page of PAGES) {
      expect(read(page)).toContain('USD 19.90');
    }
  });

  it('lists all six skills so the product description is concrete', () => {
    for (const page of PAGES) {
      const html = read(page);
      for (const id of [
        'lesson-workflow',
        'ppt-workflow',
        'audio-workflow',
        'word-workflow',
        'worksheet-workflow',
        'report-workflow',
      ]) {
        expect(html, `${page} omits ${id}`).toContain(id);
      }
    }
  });

  it('gives a direct-purchase path, not only the marketplace', () => {
    // spec §10.3：站内无结算时，若只有跳第三方的按钮，审核员会质疑账户用途
    for (const page of PAGES) {
      expect(read(page)).toContain('mailto:vichajser@gmail.com');
    }
  });

  it('links the refund and delivery policies from the pricing page', () => {
    expect(read('en/pricing/index.html')).toContain('/en/legal/refund');
    expect(read('en/pricing/index.html')).toContain('/en/legal/delivery');
    expect(read('ko/pricing/index.html')).toContain('/ko/legal/refund');
  });
});

describe('price notation across the whole build', () => {
  it('never writes the price with a bare dollar sign', async () => {
    const files = await fg('dist/**/*.html');
    const offenders = files.filter((file) =>
      /\$\s?19(\.9\d?)?\b/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run build && npx vitest run tests/build/pricing.test.mjs`
Expected: FAIL —— `ENOENT: dist/en/pricing/index.html`

- [ ] **Step 3: 写 `src/components/PriceBlock.astro`**

```astro
---
import { SITE } from '@/config/site';
import { useTranslations } from '@/i18n/t';
import type { Locale } from '@/i18n/config';

interface Props {
  lang: Locale;
}

const { lang } = Astro.props;
const t = useTranslations(lang);
---

<!--
  全站价格的唯一渲染出口。写作 "USD 19.90"，含币种代码——
  Stripe 要求购买币种无歧义，"$19.9" 会被视为币种不明。
-->
<div class="rounded-xl border border-border bg-surface p-6">
  <p class="text-4xl font-semibold tracking-tight text-text-hi">
    {SITE.price.display}
  </p>
  <p class="mt-2 text-sm text-text-body">{t('pricing.oneTime')}</p>
</div>
```

- [ ] **Step 4: 补翻译键**

`src/i18n/en.json` 追加：

```json
  "pricing.title": "Pricing",
  "pricing.product": "TeachFlow-KR Complete Bundle",
  "pricing.oneTime": "One-time purchase. No subscription, no auto-renewal.",
  "pricing.includes": "What you get",
  "pricing.includesLead": "All six skills, delivered as a zip of SKILL.md files and their references.",
  "pricing.howToBuy": "Two ways to buy",
  "pricing.viaMarketplace": "Buy on Agensi",
  "pricing.viaMarketplaceBody": "Pay on the Agensi marketplace and download immediately. Agensi is the merchant of record and handles invoicing and refunds for that purchase.",
  "pricing.viaDirect": "Buy directly from us",
  "pricing.viaDirectBody": "Email us and we invoice you directly. We send your download link within 2 business days of payment.",
  "pricing.contact": "Contact & support",
  "pricing.contactBody": "Email is our direct support channel. We reply within 2 business days.",
  "pricing.refundLink": "Refund & cancellation policy",
  "pricing.deliveryLink": "How digital delivery works",
  "pricing.requirements": "What you need to run it",
  "pricing.requirementsBody": "Claude with skill support, and a desktop computer. Everything runs locally; no internet connection is required while the skills run."
```

`src/i18n/ko.json` 追加：

```json
  "pricing.title": "가격",
  "pricing.product": "TeachFlow-KR 전체 패키지",
  "pricing.oneTime": "1회 구매. 구독도, 자동 갱신도 없습니다.",
  "pricing.includes": "포함된 것",
  "pricing.includesLead": "6개 스킬 전부. SKILL.md 파일과 참고 문서가 담긴 zip으로 제공됩니다.",
  "pricing.howToBuy": "구매 방법 두 가지",
  "pricing.viaMarketplace": "Agensi에서 구매",
  "pricing.viaMarketplaceBody": "Agensi 마켓플레이스에서 결제하고 바로 내려받습니다. 해당 구매의 판매 주체는 Agensi이며 청구와 환불도 Agensi가 처리합니다.",
  "pricing.viaDirect": "저희에게 직접 구매",
  "pricing.viaDirectBody": "이메일로 문의하시면 직접 청구서를 보내 드립니다. 결제 확인 후 영업일 기준 2일 이내에 다운로드 링크를 보내 드립니다.",
  "pricing.contact": "문의와 지원",
  "pricing.contactBody": "이메일이 직접 지원 창구입니다. 영업일 기준 2일 이내에 답변드립니다.",
  "pricing.refundLink": "환불 및 취소 정책",
  "pricing.deliveryLink": "디지털 상품 전달 방식",
  "pricing.requirements": "실행에 필요한 것",
  "pricing.requirementsBody": "스킬을 지원하는 Claude와 데스크톱 컴퓨터. 모든 작업은 로컬에서 이루어지며, 스킬 실행 중에는 인터넷 연결이 필요하지 않습니다."
```

- [ ] **Step 5: 写 `src/pages/[lang]/pricing.astro`**

用 `variant="legal"`（spec §5.5：合规区静音，取消辉光与动效）。

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import PriceBlock from '@/components/PriceBlock.astro';
import { SITE } from '@/config/site';
import { SKILLS } from '@/data/skills';
import { getCollection } from 'astro:content';
import { localizePath, type Locale } from '@/i18n/config';
import { useTranslations } from '@/i18n/t';

export { localeStaticPaths as getStaticPaths } from '@/i18n/paths';

const lang = Astro.params.lang as Locale;
const t = useTranslations(lang);

const skillEntries = await getCollection('skills', (e) => e.data.lang === lang);
const titleById = new Map(skillEntries.map((e) => [e.data.id, e.data.title]));
---

<BaseLayout
  lang={lang}
  title={`${t('pricing.title')} — TeachFlow-KR`}
  description={`${t('pricing.product')} — ${SITE.price.display}`}
  path="/pricing"
  variant="legal"
>
  <h1 class="pt-16 text-4xl font-semibold text-text-hi">{t('pricing.title')}</h1>

  <section class="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
    <div>
      <h2 class="text-2xl font-semibold text-text-hi">{t('pricing.product')}</h2>
      <p class="mt-2 text-text-body">{t('pricing.includesLead')}</p>

      <h3 class="mt-8 mb-3 text-lg font-semibold text-text-hi">{t('pricing.includes')}</h3>
      <ul class="space-y-2">
        {SKILLS.map((skill) => (
          <li class="rounded-lg border border-border bg-surface px-4 py-3">
            <p class="text-text-hi">{titleById.get(skill.id) ?? skill.id}</p>
            <p class="font-mono text-xs text-text-mute">
              {skill.id}{skill.outputs.length > 0 && ` — ${skill.outputs.join('  ')}`}
            </p>
          </li>
        ))}
      </ul>
    </div>

    <aside><PriceBlock lang={lang} /></aside>
  </section>

  <section class="mt-16">
    <h2 class="mb-4 text-2xl font-semibold text-text-hi">{t('pricing.howToBuy')}</h2>
    <div class="grid gap-4 md:grid-cols-2">
      <article class="rounded-xl border border-border bg-surface p-5">
        <h3 class="mb-2 text-lg font-semibold text-text-hi">{t('pricing.viaMarketplace')}</h3>
        <p class="text-sm text-text-body">{t('pricing.viaMarketplaceBody')}</p>
        <a
          href={SITE.agensiListingUrl}
          rel="noopener"
          class="mt-3 inline-block text-sm text-accent hover:underline"
        >{SITE.agensiListingUrl}</a>
      </article>

      <article class="rounded-xl border border-border bg-surface p-5">
        <h3 class="mb-2 text-lg font-semibold text-text-hi">{t('pricing.viaDirect')}</h3>
        <p class="text-sm text-text-body">{t('pricing.viaDirectBody')}</p>
        <a
          href={`mailto:${SITE.supportEmail}`}
          class="mt-3 inline-block font-mono text-sm text-accent hover:underline"
        >{SITE.supportEmail}</a>
      </article>
    </div>
  </section>

  <section class="mt-16">
    <h2 class="mb-2 text-2xl font-semibold text-text-hi">{t('pricing.requirements')}</h2>
    <p class="max-w-2xl text-text-body">{t('pricing.requirementsBody')}</p>
  </section>

  <section class="mt-16 pb-16">
    <h2 class="mb-2 text-2xl font-semibold text-text-hi">{t('pricing.contact')}</h2>
    <p class="text-text-body">{t('pricing.contactBody')}</p>
    <a
      href={`mailto:${SITE.supportEmail}`}
      class="mt-2 inline-block font-mono text-accent hover:underline"
    >{SITE.supportEmail}</a>

    <ul class="mt-6 space-y-1 text-sm">
      <li>
        <a href={localizePath('/legal/refund', lang)} class="text-accent hover:underline">
          {t('pricing.refundLink')}
        </a>
      </li>
      <li>
        <a href={localizePath('/legal/delivery', lang)} class="text-accent hover:underline">
          {t('pricing.deliveryLink')}
        </a>
      </li>
    </ul>
  </section>
</BaseLayout>
```

两条购买路径左右并列、同等版面权重 —— spec §10.3 要求直销路径不得弱于 Agensi 路径。

- [ ] **Step 6: 构建并运行测试确认通过**

Run: `npm run build && npx vitest run`
Expected: PASS。`price notation across the whole build` 这条会扫描全部 HTML —— 若有任何页面写了 `$19.9`，它会把文件路径列出来。

- [ ] **Step 7: 提交**

```bash
git add src/components/PriceBlock.astro "src/pages/[lang]/pricing.astro" src/i18n tests/build/pricing.test.mjs
git commit -m "feat: add /pricing with both purchase paths and single-source price rendering"
```

---

## Task 7: 四个合规页 `/legal/*`

**Files:**
- Create: `src/layouts/LegalLayout.astro`
- Create: `src/content/legal/en/{terms,privacy,refund,delivery}.md`
- Create: `src/content/legal/ko/{terms,privacy,refund,delivery}.md`
- Create: `src/pages/[lang]/legal/terms.astro`
- Create: `src/pages/[lang]/legal/privacy.astro`
- Create: `src/pages/[lang]/legal/refund.astro`
- Create: `src/pages/[lang]/legal/delivery.astro`
- Test: `tests/build/legal.test.mjs`

**Interfaces:**
- Consumes: `BaseLayout`（Task 3）、内容集合 `legal`（Task 4 的 `src/content/config.ts` 已定义 schema）、`SITE`（Task 2）
- Produces: `LegalLayout.astro` —— Props: `{ lang: Locale; slug: 'terms' | 'privacy' | 'refund' | 'delivery' }`。自行从 `legal` 集合取对应语言的条目、渲染标题与更新日期、包裹正文；四个页面文件各自只有三行。

- [ ] **Step 1: 写失败的合规页构建测试 `tests/build/legal.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = (p) => resolve(process.cwd(), 'dist', p);
const read = (p) => readFileSync(dist(p), 'utf8');

const SLUGS = ['terms', 'privacy', 'refund', 'delivery'];

describe('/legal pages', () => {
  it('exists in both locales', () => {
    for (const lang of ['en', 'ko']) {
      for (const slug of SLUGS) {
        expect(existsSync(dist(`${lang}/legal/${slug}/index.html`)), `${lang}/${slug}`)
          .toBe(true);
      }
    }
  });
});

describe('/legal/refund', () => {
  it('links to Agensi terms rather than restating their day count', () => {
    // Agensi 自家 /terms 与 /stripe-terms 互相矛盾（30 天 vs 14 天），
    // 复述等于把别人的错误抄进我们的法律页。
    const html = read('en/legal/refund/index.html');
    expect(html).toContain('https://www.agensi.io/terms');
    expect(html).not.toMatch(/30[- ]day/i);
  });

  it('states our own 14-day term for the direct-purchase path', () => {
    expect(read('en/legal/refund/index.html')).toMatch(/14 days/i);
  });

  it('covers the EU/UK statutory right of withdrawal', () => {
    const html = read('en/legal/refund/index.html');
    expect(html).toMatch(/Consumer Contracts Regulations 2013/);
    expect(html).toMatch(/withdraw/i);
  });

  it('says there is no subscription to cancel', () => {
    expect(read('en/legal/refund/index.html')).toMatch(/no subscription/i);
  });
});

describe('/legal/delivery', () => {
  it('explains both delivery paths', () => {
    const html = read('en/legal/delivery/index.html');
    expect(html).toMatch(/24 hours/i);        // Agensi 签名链接有效期
    expect(html).toMatch(/2 business days/i); // 直销路径承诺
    expect(html).toMatch(/no physical/i);     // 无实体配送
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run build && npx vitest run tests/build/legal.test.mjs`
Expected: FAIL —— 八个页面全部不存在。

- [ ] **Step 3: 写 `src/layouts/LegalLayout.astro`**

```astro
---
import { getCollection, render } from 'astro:content';
import BaseLayout from '@/layouts/BaseLayout.astro';
import type { Locale } from '@/i18n/config';

interface Props {
  lang: Locale;
  slug: 'terms' | 'privacy' | 'refund' | 'delivery';
}

const { lang, slug } = Astro.props;

const entries = await getCollection(
  'legal',
  (e) => e.data.lang === lang && e.data.slug === slug,
);
const entry = entries[0];
if (!entry) throw new Error(`Missing ${lang} legal content for "${slug}"`);

const { Content } = await render(entry);
---

<BaseLayout
  lang={lang}
  title={`${entry.data.title} — TeachFlow-KR`}
  description={entry.data.description}
  path={`/legal/${slug}`}
  variant="legal"
>
  <article class="mx-auto max-w-3xl pt-16 pb-24">
    <h1 class="text-3xl font-semibold text-text-hi">{entry.data.title}</h1>
    <p class="mt-2 text-sm text-text-mute">
      <time datetime={entry.data.updated}>{entry.data.updated}</time>
    </p>
    <div
      class="mt-8 space-y-4 leading-relaxed text-text-body [&_a]:text-accent [&_a:hover]:underline [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-text-hi [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-text-hi"
    >
      <Content />
    </div>
  </article>
</BaseLayout>
```

- [ ] **Step 4: 写 `src/content/legal/en/refund.md`**

三条路径的措辞是本任务风险最高的部分，逐字给出。

```markdown
---
slug: refund
lang: en
title: Refund & Cancellation Policy
description: How refunds work for TeachFlow-KR, and your statutory right of withdrawal.
updated: 2026-09-18
---

TeachFlow-KR is a one-time purchase. There is **no subscription and no auto-renewal**,
so there is nothing to cancel — you are never billed a second time.

How a refund is handled depends on where you bought it.

## If you bought on Agensi

Agensi is the merchant of record for that purchase. Agensi takes the payment, issues
your invoice, and handles refunds and chargebacks. Their refund policy applies, and
refund requests go to Agensi rather than to us.

Read their current terms at <https://www.agensi.io/terms>.

We do not restate their refund window here: their terms can change, and the version
on their site is always the one that governs your purchase.

## If you bought directly from us

Email <vichajser@gmail.com> within **14 days** of your purchase and we will refund you
in full, provided you have not yet downloaded the package. Once the files are
downloaded we cannot take them back, which is why the window is tied to download
rather than to time alone.

Tell us the email address you paid from. We process approved refunds within 5 business
days, back to the original payment method.

## If you are a consumer in the UK or the EU

You have a statutory right to withdraw from a distance contract within 14 days.

For digital content delivered as a download, that right ends once the download begins,
under the UK Consumer Contracts Regulations 2013 (and the equivalent provision of EU
Directive 2011/83/EU, Article 16(m)). Before you download, we ask you to confirm that
you agree to immediate delivery and that you understand your right of withdrawal ends
at that point.

This is your statutory right. Nothing above limits it.

## Questions

Email <vichajser@gmail.com>. We reply within 2 business days.
```

`src/content/legal/ko/refund.md` 为同一内容的韩文版，`lang: ko`，标题 `환불 및 취소 정책`。法条名称 `UK Consumer Contracts Regulations 2013` 与 `EU Directive 2011/83/EU` 保留英文原名，另附韩文说明 —— 法条名翻译会导致无法检索。

- [ ] **Step 5: 写 `src/content/legal/en/delivery.md`**

```markdown
---
slug: delivery
lang: en
title: Digital Delivery
description: How TeachFlow-KR reaches you after purchase, and what you need to run it.
updated: 2026-09-18
---

TeachFlow-KR is digital. There is **no physical shipment** and nothing is posted to you.

You receive a zip archive containing six skills — each one a `SKILL.md` file plus its
reference documents. The package contains no executable code.

## If you bought on Agensi

Agensi gives you a signed download link immediately after payment. The link is valid
for **24 hours**, and you can generate a fresh one at any time from your Agensi
dashboard. Each download is fingerprinted to your account. When we publish a new
version, you can download it again at no extra cost.

Agensi does not deliver by email — your downloads live in your dashboard.

## If you bought directly from us

We email your download link within **2 business days** of confirming payment, to the
address you paid from. If it has not arrived, email <vichajser@gmail.com> and we will
resend it.

## What you need to run it

- Claude, with skill support enabled
- A desktop computer (macOS or Windows)
- Your textbook pages as PDF or images

The skills run entirely on your own machine. **No internet connection is required while
they run**, and nothing you feed them is sent anywhere. See our
[security page](/en/security) for the detail.

## If something is wrong with the files

Email <vichajser@gmail.com>. We reply within 2 business days. If the package is
defective, we will replace it or refund you — see our
[refund policy](/en/legal/refund).
```

`src/content/legal/ko/delivery.md` 为韩文版，内部链接改为 `/ko/security` 与 `/ko/legal/refund`。

- [ ] **Step 6: 写 `terms.md` 与 `privacy.md`（英韩各两份）**

`terms.md` 必须涵盖：授权范围（购买者本人及其任教班级使用；不得转售或再分发 skill 文件）、产出物归教师所有（教师用 skill 生成的教案、幻灯片、学习单归教师）、第三方教材版权归原出版社（本产品不授予任何教材权利）、无担保条款、`CROSSXTOP LTD` 主体与英格兰及威尔士法律管辖。

`privacy.md` 必须涵盖：数据控制者为 `CROSSXTOP LTD`（含注册号与地址）；本站为纯静态站点，**不设分析工具、不设 cookie、不做第三方请求**（字体自托管）；我们只在你主动邮件联系时收到你的邮箱与邮件内容，用于回复与开票，保存期限与英国税务记录要求一致；**skill 本身不上传任何数据 —— 教材与学生信息留在教师本机**；GDPR 下的访问、更正、删除、可携权及行使方式（邮件 `vichajser@gmail.com`）；向 ICO 投诉的权利。

隐私页必须与 `/security` 页一致：两页对"数据不外传"的表述不得互相矛盾。

- [ ] **Step 7: 写四个页面文件**

`src/pages/[lang]/legal/refund.astro`：

```astro
---
import LegalLayout from '@/layouts/LegalLayout.astro';
import type { Locale } from '@/i18n/config';

export { localeStaticPaths as getStaticPaths } from '@/i18n/paths';
---

<LegalLayout lang={Astro.params.lang as Locale} slug="refund" />
```

`terms.astro`、`privacy.astro`、`delivery.astro` 结构相同，仅 `slug` 分别为 `"terms"`、`"privacy"`、`"delivery"`。四个文件各自完整写出，不要用"同上"。

- [ ] **Step 8: 构建并运行测试确认通过**

Run: `npm run build && npx vitest run`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add src/layouts/LegalLayout.astro src/content/legal "src/pages/[lang]/legal" tests/build/legal.test.mjs
git commit -m "feat: add bilingual terms, privacy, refund and delivery pages"
```

---

## Task 8: 六 skill 关系图 —— 数据层与静态 SVG

**Files:**
- Create: `src/components/FlowDiagram/nodes.ts`
- Create: `src/components/FlowDiagram/FlowDiagram.astro`
- Test: `tests/unit/flow-nodes.test.ts`

**Interfaces:**
- Consumes: `SKILLS` / `SkillId` / `SkillStage` / `STAGE_COLOR`（Task 4）、`Locale`（Task 2）、`useTranslations`（Task 2）
- Produces:
  - `interface FlowNode { id: SkillId; stage: SkillStage; x: number; y: number; w: number; h: number; outputs: string[] }`
  - `interface FlowEdge { from: SkillId | 'input'; to: SkillId; }`
  - `VIEWBOX: { w: 960; h: 640 }`
  - `FLOW_NODES: readonly FlowNode[]`、`FLOW_EDGES: readonly FlowEdge[]`
  - `INPUT_NODE: { x: number; y: number; w: number; h: number }`
  - `edgePath(edge: FlowEdge): string` —— 返回 SVG `d` 属性（三次贝塞尔）
  - `FlowDiagram.astro` —— Props: `{ lang: Locale }`。输出的 SVG **本身即终态静态图**：不加任何 class 时就是完整可读的关系图。动画由 Task 9 的脚本叠加，脚本不存在时页面依然正确。

这个顺序是刻意的：先让静态图正确，再叠动画。反过来做的话，JS 关闭时会得到一张半成品图。

- [ ] **Step 1: 写失败的布局数据测试 `tests/unit/flow-nodes.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  VIEWBOX,
  FLOW_NODES,
  FLOW_EDGES,
  INPUT_NODE,
  edgePath,
} from '@/components/FlowDiagram/nodes';
import { SKILLS } from '@/data/skills';

describe('FLOW_NODES', () => {
  it('has a node for every shipped skill and nothing else', () => {
    expect(FLOW_NODES.map((n) => n.id).sort()).toEqual(
      SKILLS.map((s) => s.id).sort(),
    );
  });

  it('keeps every node inside the viewBox', () => {
    for (const node of FLOW_NODES) {
      expect(node.x, `${node.id} left edge`).toBeGreaterThanOrEqual(0);
      expect(node.y, `${node.id} top edge`).toBeGreaterThanOrEqual(0);
      expect(node.x + node.w, `${node.id} right edge`).toBeLessThanOrEqual(VIEWBOX.w);
      expect(node.y + node.h, `${node.id} bottom edge`).toBeLessThanOrEqual(VIEWBOX.h);
    }
  });

  it('stacks the three stages top to bottom without overlap', () => {
    const bottomOf = (stage: number) =>
      Math.max(...FLOW_NODES.filter((n) => n.stage === stage).map((n) => n.y + n.h));
    const topOf = (stage: number) =>
      Math.min(...FLOW_NODES.filter((n) => n.stage === stage).map((n) => n.y));

    expect(bottomOf(1)).toBeLessThan(topOf(2));
    expect(bottomOf(2)).toBeLessThan(topOf(3));
  });

  it('lays the four stage-2 nodes side by side, not overlapping', () => {
    const stage2 = FLOW_NODES.filter((n) => n.stage === 2).sort((a, b) => a.x - b.x);
    expect(stage2).toHaveLength(4);
    for (let i = 1; i < stage2.length; i++) {
      expect(stage2[i]!.x).toBeGreaterThanOrEqual(stage2[i - 1]!.x + stage2[i - 1]!.w);
    }
  });
});

describe('FLOW_EDGES', () => {
  it('feeds the textbook input into lesson-workflow', () => {
    expect(FLOW_EDGES).toContainEqual({ from: 'input', to: 'lesson-workflow' });
  });

  it('fans lesson-workflow out to all four stage-2 skills', () => {
    const targets = FLOW_EDGES.filter((e) => e.from === 'lesson-workflow').map(
      (e) => e.to,
    );
    expect(targets.sort()).toEqual([
      'audio-workflow',
      'ppt-workflow',
      'word-workflow',
      'worksheet-workflow',
    ]);
  });

  it('funnels all four stage-2 skills into report-workflow', () => {
    const sources = FLOW_EDGES.filter((e) => e.to === 'report-workflow').map(
      (e) => e.from,
    );
    expect(sources).toHaveLength(4);
  });

  it('references only nodes that exist', () => {
    const ids = new Set<string>([...FLOW_NODES.map((n) => n.id), 'input']);
    for (const edge of FLOW_EDGES) {
      expect(ids.has(edge.from), `unknown edge source ${edge.from}`).toBe(true);
      expect(ids.has(edge.to), `unknown edge target ${edge.to}`).toBe(true);
    }
  });
});

describe('edgePath', () => {
  it('produces a cubic bezier starting at the source and ending at the target', () => {
    const d = edgePath({ from: 'input', to: 'lesson-workflow' });
    expect(d).toMatch(/^M [\d.]+ [\d.]+ C /);
  });

  it('never returns NaN coordinates', () => {
    for (const edge of FLOW_EDGES) {
      expect(edgePath(edge), `${edge.from} → ${edge.to}`).not.toContain('NaN');
    }
  });
});
```

`INPUT_NODE` 的位置也会被 `edgePath` 用到，测试通过 `edgePath` 间接覆盖它。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/flow-nodes.test.ts`
Expected: FAIL —— `Failed to resolve import "@/components/FlowDiagram/nodes"`

- [ ] **Step 3: 写 `src/components/FlowDiagram/nodes.ts`**

```ts
import { SKILLS, STAGE_COLOR, type SkillId, type SkillStage } from '@/data/skills';

export const VIEWBOX = { w: 960, h: 640 } as const;

export interface FlowNode {
  id: SkillId;
  stage: SkillStage;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 该节点产出的文件扩展名，取自 SKILLS */
  outputs: readonly string[];
  /** 该节点需要的上游输入，Task 13 的悬停侧卡要用 */
  needs: readonly string[];
}

export interface FlowEdge {
  from: SkillId | 'input';
  to: SkillId;
}

/** 教材 PDF + 학습자 정보 —— 演出第一拍从这里落下 */
export const INPUT_NODE = { x: 380, y: 16, w: 200, h: 56 } as const;

const NODE_H = 88;
const STAGE2_W = 200;
const STAGE2_GAP = 20;
const STAGE2_Y = 280;

// 四个二级节点水平居中排布：4×200 + 3×20 = 860，左边距 (960-860)/2 = 50
const stage2X = (index: number) => 50 + index * (STAGE2_W + STAGE2_GAP);

const STAGE2_ORDER: SkillId[] = [
  'ppt-workflow',
  'audio-workflow',
  'word-workflow',
  'worksheet-workflow',
];

const outputsOf = (id: SkillId) =>
  SKILLS.find((s) => s.id === id)?.outputs ?? [];

/** 一级节点的产物就是二级节点的输入；四个二级节点的产物汇总成三级节点的输入 */
const STAGE1_OUTPUT = outputsOf('lesson-workflow');
const STAGE2_OUTPUTS = STAGE2_ORDER.flatMap(outputsOf);

export const FLOW_NODES: readonly FlowNode[] = [
  {
    id: 'lesson-workflow',
    stage: 1,
    x: 300,
    y: 120,
    w: 360,
    h: NODE_H,
    outputs: STAGE1_OUTPUT,
    needs: ['textbook.pdf'],
  },
  ...STAGE2_ORDER.map((id, index) => ({
    id,
    stage: 2 as SkillStage,
    x: stage2X(index),
    y: STAGE2_Y,
    w: STAGE2_W,
    h: NODE_H,
    outputs: outputsOf(id),
    needs: STAGE1_OUTPUT,
  })),
  {
    id: 'report-workflow',
    stage: 3,
    x: 330,
    y: 470,
    w: 300,
    h: NODE_H,
    outputs: outputsOf('report-workflow'),
    needs: STAGE2_OUTPUTS,
  },
] as const;

export const FLOW_EDGES: readonly FlowEdge[] = [
  { from: 'input', to: 'lesson-workflow' },
  ...STAGE2_ORDER.map((id) => ({ from: 'lesson-workflow' as const, to: id })),
  ...STAGE2_ORDER.map((id) => ({ from: id, to: 'report-workflow' as const })),
] as const;

const boxOf = (ref: SkillId | 'input') => {
  if (ref === 'input') return INPUT_NODE;
  const node = FLOW_NODES.find((n) => n.id === ref);
  if (!node) throw new Error(`Unknown flow node: ${ref}`);
  return node;
};

/** 从源节点底边中点到目标节点顶边中点的垂直三次贝塞尔 */
export function edgePath(edge: FlowEdge): string {
  const from = boxOf(edge.from);
  const to = boxOf(edge.to);

  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + to.w / 2;
  const y2 = to.y;
  const lift = (y2 - y1) / 2;

  return `M ${x1} ${y1} C ${x1} ${y1 + lift}, ${x2} ${y2 - lift}, ${x2} ${y2}`;
}

export function nodeColor(stage: SkillStage): string {
  return STAGE_COLOR[stage];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/flow-nodes.test.ts`
Expected: PASS（9 passed）

- [ ] **Step 5: 补动画节点的翻译键**

节点标签必须走 i18n，不烧进 SVG（spec §4.4）。

`src/i18n/en.json` 追加：

```json
  "flow.title": "How the six skills fit together",
  "flow.input": "Textbook PDF + learner profile",
  "flow.stage1": "Plan the unit",
  "flow.stage2": "Build the materials",
  "flow.stage3": "After class",
  "flow.constraint": "Constraints flow downward",
  "flow.node.lesson-workflow": "Lesson plan",
  "flow.node.ppt-workflow": "Slides",
  "flow.node.audio-workflow": "Listening",
  "flow.node.word-workflow": "Vocabulary",
  "flow.node.worksheet-workflow": "Worksheets",
  "flow.node.report-workflow": "Parent notice"
```

`src/i18n/ko.json` 追加：

```json
  "flow.title": "여섯 스킬이 맞물리는 방식",
  "flow.input": "교재 PDF + 학습자 정보",
  "flow.stage1": "단원 설계",
  "flow.stage2": "수업 자료 제작",
  "flow.stage3": "수업 후",
  "flow.constraint": "상위 단계의 제약이 아래로 흐릅니다",
  "flow.node.lesson-workflow": "수업 지도안",
  "flow.node.ppt-workflow": "수업 슬라이드",
  "flow.node.audio-workflow": "듣기 자료",
  "flow.node.word-workflow": "어휘 학습표",
  "flow.node.worksheet-workflow": "수준별 학습지",
  "flow.node.report-workflow": "학부모 안내문"
```

- [ ] **Step 6: 写 `src/components/FlowDiagram/FlowDiagram.astro`**

关键：这段 SVG 不依赖任何 JS 就是完整的终态图。`textLength` + `lengthAdjust` 让韩语长标签自适应节点宽度而不溢出（spec §4.4）。

```astro
---
import {
  VIEWBOX,
  FLOW_NODES,
  FLOW_EDGES,
  INPUT_NODE,
  edgePath,
  nodeColor,
} from './nodes';
import { useTranslations } from '@/i18n/t';
import type { TranslationKey } from '@/i18n/t';
import type { Locale } from '@/i18n/config';

interface Props {
  lang: Locale;
}

const { lang } = Astro.props;
const t = useTranslations(lang);

const label = (id: string) => t(`flow.node.${id}` as TranslationKey);
---

<figure class="my-16" data-flow-diagram>
  <figcaption class="mb-6 text-2xl font-semibold text-text-hi">
    {t('flow.title')}
  </figcaption>

  <svg
    viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
    role="img"
    aria-label={t('flow.title')}
    class="w-full"
  >
    <g data-flow-edges fill="none" stroke-width="2" stroke-linecap="round">
      {FLOW_EDGES.map((edge) => (
        <path
          d={edgePath(edge)}
          data-edge={`${edge.from}->${edge.to}`}
          stroke={edge.to === 'report-workflow' ? nodeColor(3) : nodeColor(2)}
          opacity="0.55"
        />
      ))}
    </g>

    <g data-flow-input>
      <rect
        x={INPUT_NODE.x}
        y={INPUT_NODE.y}
        width={INPUT_NODE.w}
        height={INPUT_NODE.h}
        rx="10"
        fill="#0E1626"
        stroke="#1F2C4A"
      />
      <text
        x={INPUT_NODE.x + INPUT_NODE.w / 2}
        y={INPUT_NODE.y + INPUT_NODE.h / 2 + 5}
        text-anchor="middle"
        fill="#C3CFE4"
        font-size="14"
        textLength={INPUT_NODE.w - 24}
        lengthAdjust="spacingAndGlyphs"
      >{t('flow.input')}</text>
    </g>

    {FLOW_NODES.map((node) => (
      <g data-flow-node={node.id} data-stage={node.stage}>
        <rect
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          rx="12"
          fill="#0E1626"
          stroke={nodeColor(node.stage)}
          stroke-width="1.5"
        />
        <text
          x={node.x + node.w / 2}
          y={node.y + 34}
          text-anchor="middle"
          fill="#F2F6FF"
          font-size="16"
          font-weight="600"
          textLength={node.w - 32}
          lengthAdjust="spacingAndGlyphs"
        >{label(node.id)}</text>
        <text
          x={node.x + node.w / 2}
          y={node.y + 60}
          text-anchor="middle"
          fill="#7C8AA6"
          font-size="12"
          font-family="ui-monospace, monospace"
        >{node.outputs.join('  ')}</text>
      </g>
    ))}
  </svg>

  <!--
    SVG 图形在移动端会缩得看不清，且屏幕阅读器读不出 <text> 的结构关系。
    这份列表两者都兼顾：md 以上隐藏，md 以下作为主呈现。
  -->
  <ol class="mt-6 space-y-2 md:hidden">
    {FLOW_NODES.map((node) => (
      <li
        class="rounded-lg border-l-2 bg-surface px-4 py-3"
        style={`border-color: ${nodeColor(node.stage)}`}
      >
        <p class="text-text-hi">{label(node.id)}</p>
        <p class="font-mono text-xs text-text-mute">{node.outputs.join('  ')}</p>
      </li>
    ))}
  </ol>
</figure>
```

- [ ] **Step 7: 构建确认无错**

Run: `npm run build`
Expected: 构建成功。此时 FlowDiagram 尚未挂到任何页面上，只验证它能编译。

- [ ] **Step 8: 提交**

```bash
git add src/components/FlowDiagram src/i18n tests/unit/flow-nodes.test.ts
git commit -m "feat: add flow diagram layout data and static SVG that reads correctly without JS"
```

---

## Task 9: 关系图动画 island

**Files:**
- Create: `src/components/FlowDiagram/flow-diagram.ts`
- Modify: `src/components/FlowDiagram/FlowDiagram.astro`（挂载脚本与动画初态 CSS）
- Test: `tests/build/no-js.test.mjs`

**Interfaces:**
- Consumes: Task 8 的 SVG DOM 结构 —— `[data-flow-diagram]`、`[data-flow-input]`、`[data-flow-node="<id>"]`、`[data-edge="<from>-><to>"]`
- Produces: 一个 `client:visible` 脚本。演出四拍（spec §4.1），完成后停在终态。**不导出任何供其他模块使用的符号** —— 它是叶子节点。

- [ ] **Step 1: 写失败的零 JS 测试 `tests/build/no-js.test.mjs`**

spec §4.4 要求"仅首页加载此段 JS；其余页面保持零 JS"。这条测试是该约束的唯一守卫。

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');

const SCRIPT_TAG = /<script\b(?![^>]*\btype=["']application\/ld\+json["'])/i;

describe('JS budget', () => {
  it('ships script only on the home page', () => {
    for (const page of [
      'en/skills/index.html',
      'en/pricing/index.html',
      'en/security/index.html',
      'en/legal/refund/index.html',
      'ko/skills/index.html',
      'ko/pricing/index.html',
    ]) {
      expect(read(page), `${page} should ship no script`).not.toMatch(SCRIPT_TAG);
    }
  });

  it('renders the full diagram in HTML, not from script', () => {
    // JS 关闭时首页仍须显示完整关系图（spec §8）
    const html = read('en/index.html');
    for (const id of [
      'lesson-workflow',
      'ppt-workflow',
      'audio-workflow',
      'word-workflow',
      'worksheet-workflow',
      'report-workflow',
    ]) {
      expect(html, `diagram is missing node ${id}`).toContain(`data-flow-node="${id}"`);
    }
  });
});
```

这条测试依赖 Task 10 把 FlowDiagram 挂上首页。本任务先让它跑起来并接受 `en/index.html` 那条失败；Task 10 完成后它必须全绿。

- [ ] **Step 2: 写 `src/components/FlowDiagram/flow-diagram.ts`**

```ts
/**
 * 六 skill 关系图的四拍演出（spec §4.1）。
 *
 * 设计前提：SVG 在 HTML 里已经是终态。本脚本做的是**先把元素藏起来，再按拍放出来**。
 * 因此脚本失败、被拦截或未加载时，页面自然停在终态——这是想要的结果，不是降级。
 */
const BEAT_MS = 700;

type Cleanup = () => void;

function hide(elements: Element[]): Cleanup {
  for (const el of elements) {
    (el as HTMLElement).style.opacity = '0';
  }
  return () => {
    for (const el of elements) {
      (el as HTMLElement).style.opacity = '';
    }
  };
}

function reveal(el: Element, delayMs: number): void {
  const style = (el as HTMLElement).style;
  style.transition = `opacity 420ms ease-out ${delayMs}ms, transform 420ms ease-out ${delayMs}ms`;
  style.opacity = '1';
  style.transform = 'none';
}

function drawEdge(path: SVGPathElement, delayMs: number): void {
  const length = path.getTotalLength();
  path.style.strokeDasharray = `${length}`;
  path.style.strokeDashoffset = `${length}`;
  path.style.transition = `stroke-dashoffset 600ms ease-out ${delayMs}ms`;
  // 强制回流，确保初值生效后再改成 0，否则浏览器会合并两次赋值、动画不播。
  void path.getBoundingClientRect();
  path.style.strokeDashoffset = '0';
}

function play(root: Element): void {
  const q = <T extends Element>(selector: string) =>
    Array.from(root.querySelectorAll<T>(selector));

  const edge = (from: string, to: string) =>
    root.querySelector<SVGPathElement>(`[data-edge="${from}->${to}"]`);

  const node = (id: string) => root.querySelector(`[data-flow-node="${id}"]`);
  const input = root.querySelector('[data-flow-input]');

  // 拍 1：输入落下
  if (input) {
    (input as HTMLElement).style.transform = 'translateY(-24px)';
    reveal(input, 0);
  }

  // 拍 2：一级节点点亮，输入连线自绘
  const lesson = node('lesson-workflow');
  const inputEdge = edge('input', 'lesson-workflow');
  if (inputEdge) drawEdge(inputEdge, BEAT_MS);
  if (lesson) reveal(lesson, BEAT_MS);

  // 拍 3：四条线同时生长，四个二级节点**同时**亮起——视觉上表达"互相独立、按需选用"
  const stage2 = [
    'ppt-workflow',
    'audio-workflow',
    'word-workflow',
    'worksheet-workflow',
  ];
  for (const id of stage2) {
    const e = edge('lesson-workflow', id);
    if (e) drawEdge(e, BEAT_MS * 2);
    const n = node(id);
    if (n) reveal(n, BEAT_MS * 2 + 200);
  }

  // 拍 4：四线收拢汇入课后节点
  for (const id of stage2) {
    const e = edge(id, 'report-workflow');
    if (e) drawEdge(e, BEAT_MS * 3);
  }
  const report = node('report-workflow');
  if (report) reveal(report, BEAT_MS * 3 + 200);

  // 演出结束后清掉内联 transition，让后续 hover 交互不受影响
  window.setTimeout(() => {
    for (const el of q<SVGElement>('[data-flow-node], [data-flow-input], [data-edge]')) {
      el.style.transition = '';
    }
  }, BEAT_MS * 4 + 800);
}

function init(): void {
  const root = document.querySelector('[data-flow-diagram]');
  if (!root) return;

  // spec §8：prefers-reduced-motion 下直接渲染终态，不做任何位移
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const animated = Array.from(
    root.querySelectorAll('[data-flow-node], [data-flow-input]'),
  );
  const restore = hide(animated);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.disconnect();
        restore();
        play(root);
      }
    },
    { threshold: 0.35 },
  );

  observer.observe(root);

  // 兜底：若 4 秒内没触发（例如 IntersectionObserver 被禁用），直接还原终态。
  window.setTimeout(() => {
    observer.disconnect();
    restore();
  }, 4000);
}

init();
```

`hide()` 在 `play()` 之前被 `restore()` 撤销，`reveal()` 再逐个把 opacity 设回 1 —— 这样元素从"完全无内联样式的终态"出发，动画只在其上叠加，不会留下残留样式。

- [ ] **Step 3: 在 `FlowDiagram.astro` 底部挂载脚本**

在 `</figure>` 之前加：

```astro
<script>
  import './flow-diagram.ts';
</script>
```

Astro 会把它打包为模块脚本、随首页一起输出。因为只有首页引用 `FlowDiagram`，其余页面不会带上它。

- [ ] **Step 4: 手动验证三种状态**

Run: `npm run dev`，在浏览器中逐项确认：

1. 正常状态 —— 滚动到图上时四拍依次播放，结束后停住不循环
2. 关闭 JS（DevTools → Settings → Debugger → Disable JavaScript）→ 刷新 —— 图完整显示，无空白
3. 开启 reduced motion（macOS 系统设置 → 辅助功能 → 显示 → 减弱动态效果）→ 刷新 —— 图直接是终态，**无任何位移**

三项都确认后再继续。这是唯一必须人工验证的任务。

- [ ] **Step 5: 提交**

```bash
git add src/components/FlowDiagram tests/build/no-js.test.mjs
git commit -m "feat: animate the flow diagram on scroll, with static fallback for no-JS and reduced motion"
```

---

## Task 10: 首页

**Files:**
- Modify: `src/pages/[lang]/index.astro`（替换 Task 3 的占位内容）
- Test: `tests/build/home.test.mjs`

**Interfaces:**
- Consumes: `BaseLayout`（Task 3）、`FlowDiagram`（Task 8/9）、`SkillCard`（Task 4）、`SKILLS`（Task 4）、`SITE`（Task 2）、内容集合 `skills`（Task 4）
- Produces: 无新导出。首页是消费端。

- [ ] **Step 1: 写失败的首页测试 `tests/build/home.test.mjs`**

最后一条对应 spec §9.2 的"Stripe 审核模拟"：审核员两分钟内要能从首页找到商品、价格、退款政策、客服邮箱、主体信息。前四项靠首页可达的链接，主体信息靠页脚。

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';

const read = (p) => readFileSync(resolve(process.cwd(), 'dist', p), 'utf8');

describe('home page', () => {
  it('leads with the product, not with a coming-soon notice', () => {
    for (const page of ['en/index.html', 'ko/index.html']) {
      const html = read(page);
      expect(html).not.toMatch(/coming soon/i);
      expect(html).not.toMatch(/under construction/i);
    }
  });

  it('shows all six skills', () => {
    const html = read('en/index.html');
    for (const id of [
      'lesson-workflow',
      'ppt-workflow',
      'audio-workflow',
      'word-workflow',
      'worksheet-workflow',
      'report-workflow',
    ]) {
      expect(html, `home page omits ${id}`).toContain(id);
    }
  });

  it('reaches price, refund policy and support within one click', () => {
    const root = parse(read('en/index.html'));
    const hrefs = root.querySelectorAll('a').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/en/pricing');
    expect(hrefs).toContain('/en/legal/refund');
    expect(hrefs).toContain('mailto:vichajser@gmail.com');
  });

  it('states the price on the home page itself', () => {
    expect(read('en/index.html')).toContain('USD 19.90');
  });
});
```

- [ ] **Step 2: 补首页翻译键**

`src/i18n/en.json` 追加：

```json
  "home.heroTitle": "One textbook unit in. A week of lessons out.",
  "home.heroBody": "Six Claude Skills that take your textbook PDF and produce the lesson plan, the slides, the listening audio, the vocabulary table, three levels of worksheets, and the parent notice — in the language each of them belongs in.",
  "home.ctaPricing": "See pricing",
  "home.ctaSamples": "See real output",
  "home.skillsTitle": "The six skills",
  "home.samplesTitle": "What it actually produces",
  "home.samplesBody": "Real files from a real textbook unit. Download them and look before you buy.",
  "home.privacyTitle": "Your students' data stays on your computer",
  "home.privacyBody": "The skills make no network requests. Textbook scans and student names never leave your machine.",
  "home.privacyLink": "How you can verify that",
  "home.buyTitle": "TeachFlow-KR Complete Bundle",
  "home.buyBody": "All six skills, one payment, no subscription."
```

`src/i18n/ko.json` 追加：

```json
  "home.heroTitle": "교재 한 단원을 넣으면, 한 주 분량의 수업이 나옵니다.",
  "home.heroBody": "교재 PDF에서 수업 지도안, 슬라이드, 듣기 음원, 어휘 학습표, 세 수준의 학습지, 학부모 안내문까지 만들어 내는 6개의 Claude Skill. 각 산출물은 원래 쓰여야 할 언어로 나옵니다.",
  "home.ctaPricing": "가격 보기",
  "home.ctaSamples": "실제 산출물 보기",
  "home.skillsTitle": "여섯 개의 스킬",
  "home.samplesTitle": "실제로 나오는 결과물",
  "home.samplesBody": "실제 교재 단원으로 만든 진짜 파일입니다. 구매 전에 내려받아 확인해 보세요.",
  "home.privacyTitle": "학생 정보는 선생님 컴퓨터를 떠나지 않습니다",
  "home.privacyBody": "스킬은 네트워크 요청을 하지 않습니다. 교재 스캔본과 학생 이름이 밖으로 나가지 않습니다.",
  "home.privacyLink": "직접 확인하는 방법",
  "home.buyTitle": "TeachFlow-KR 전체 패키지",
  "home.buyBody": "6개 스킬 전부, 1회 결제, 구독 없음."
```

- [ ] **Step 3: 重写 `src/pages/[lang]/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '@/layouts/BaseLayout.astro';
import FlowDiagram from '@/components/FlowDiagram/FlowDiagram.astro';
import SkillCard from '@/components/SkillCard.astro';
import PriceBlock from '@/components/PriceBlock.astro';
import { SITE } from '@/config/site';
import { SKILLS } from '@/data/skills';
import { localizePath, type Locale } from '@/i18n/config';
import { useTranslations } from '@/i18n/t';

export { localeStaticPaths as getStaticPaths } from '@/i18n/paths';

const lang = Astro.params.lang as Locale;
const t = useTranslations(lang);

const entries = await getCollection('skills', (e) => e.data.lang === lang);
const byId = new Map(entries.map((e) => [e.data.id, e.data]));
---

<BaseLayout
  lang={lang}
  title="TeachFlow-KR"
  description={t('home.heroBody')}
  path="/"
>
  <section class="pt-20 pb-8">
    <h1 class="max-w-3xl text-5xl font-semibold leading-tight tracking-tight text-text-hi">
      {t('home.heroTitle')}
    </h1>
    <p class="mt-6 max-w-2xl text-lg text-text-body">{t('home.heroBody')}</p>

    <div class="mt-8 flex flex-wrap gap-3">
      <a
        href={localizePath('/pricing', lang)}
        class="rounded-lg bg-accent px-5 py-3 font-medium text-white shadow-[0_0_40px_rgba(46,125,255,0.35)] transition-transform hover:-translate-y-0.5"
      >{t('home.ctaPricing')}</a>
      <a
        href={localizePath('/samples', lang)}
        class="rounded-lg border border-border px-5 py-3 font-medium text-text-hi transition-colors hover:border-accent"
      >{t('home.ctaSamples')}</a>
    </div>
  </section>

  <FlowDiagram lang={lang} />

  <section class="py-12">
    <h2 class="mb-6 text-2xl font-semibold text-text-hi">{t('home.skillsTitle')}</h2>
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {SKILLS.map((skill) => {
        const data = byId.get(skill.id);
        if (!data) throw new Error(`Missing ${lang} content for skill ${skill.id}`);
        return (
          <SkillCard
            lang={lang}
            skill={skill}
            title={data.title}
            tagline={data.tagline}
            href={`${localizePath('/skills', lang)}#${skill.id}`}
          />
        );
      })}
    </div>
  </section>

  <section class="py-12">
    <h2 class="mb-2 text-2xl font-semibold text-text-hi">{t('home.privacyTitle')}</h2>
    <p class="max-w-2xl text-text-body">{t('home.privacyBody')}</p>
    <a
      href={localizePath('/security', lang)}
      class="mt-3 inline-block text-accent hover:underline"
    >{t('home.privacyLink')}</a>
  </section>

  <section class="grid gap-6 py-12 md:grid-cols-[minmax(0,1fr)_320px]">
    <div>
      <h2 class="text-2xl font-semibold text-text-hi">{t('home.buyTitle')}</h2>
      <p class="mt-2 text-text-body">{t('home.buyBody')}</p>
      <ul class="mt-4 space-y-1 text-sm">
        <li>
          <a href={localizePath('/pricing', lang)} class="text-accent hover:underline">
            {t('home.ctaPricing')}
          </a>
        </li>
        <li>
          <a href={localizePath('/legal/refund', lang)} class="text-accent hover:underline">
            {t('footer.refund')}
          </a>
        </li>
        <li>
          <a
            href={`mailto:${SITE.supportEmail}`}
            class="font-mono text-accent hover:underline"
          >{SITE.supportEmail}</a>
        </li>
      </ul>
    </div>
    <aside><PriceBlock lang={lang} /></aside>
  </section>
</BaseLayout>
```

首页同时给出价格、退款政策链接与客服邮箱 —— 审核员不必翻页即可核对（spec §9.2 的两分钟检验）。

- [ ] **Step 4: 构建并运行全部测试**

Run: `npm run build && npx vitest run`
Expected: PASS，含 Task 9 那条 `renders the full diagram in HTML` —— 首页现在挂上了 FlowDiagram。

- [ ] **Step 5: 提交**

```bash
git add "src/pages/[lang]/index.astro" src/i18n tests/build/home.test.mjs
git commit -m "feat: build the home page around the flow diagram and one-click compliance paths"
```

---

## Task 11: `/samples`、`/docs`、`/faq` 与 404

**Files:**
- Create: `src/data/samples.ts`
- Create: `src/components/SampleCard.astro`
- Create: `src/pages/[lang]/samples.astro`
- Create: `src/pages/[lang]/docs.astro`
- Create: `src/pages/[lang]/faq.astro`
- Create: `src/pages/[lang]/404.astro`
- Create: `src/pages/404.astro`
- Create: `src/content/faq/en/*.md`、`src/content/faq/ko/*.md`
- Test: `tests/unit/samples.test.ts`

**Interfaces:**
- Consumes: `BaseLayout`（Task 3）、`SKILLS` / `stageClass`（Task 4）、内容集合 `faq`（Task 4）
- Produces:
  - `interface Sample { id: string; skillId: SkillId; file: string | null; previewImage: string | null; durationSeconds: number | null; title: Record<Locale, string> }`
  - `SAMPLES: readonly Sample[]`
  - `isReady(sample: Sample): boolean` —— `file !== null`
  - `SampleCard.astro` —— Props: `{ lang: Locale; sample: Sample }`。`file` 为 `null` 时渲染"样例准备中"占位，**不输出坏链**。

样例产物由并行工作流生成（spec §7），本任务只建结构与占位。

- [ ] **Step 1: 写失败的样例数据测试 `tests/unit/samples.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { SAMPLES, isReady } from '@/data/samples';
import { SKILLS } from '@/data/skills';

describe('SAMPLES', () => {
  it('covers every skill that produces a downloadable file', () => {
    const producing = SKILLS.filter((s) => s.outputs.length > 0).map((s) => s.id);
    const covered = new Set(SAMPLES.map((s) => s.skillId));
    for (const id of producing) {
      expect(covered.has(id), `no sample entry for ${id}`).toBe(true);
    }
  });

  it('has a unique id per sample', () => {
    const ids = SAMPLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('titles every sample in both locales', () => {
    for (const sample of SAMPLES) {
      expect(sample.title.en.length, `${sample.id}.en`).toBeGreaterThan(0);
      expect(sample.title.ko.length, `${sample.id}.ko`).toBeGreaterThan(0);
    }
  });

  it('points ready samples at a path under /samples/', () => {
    for (const sample of SAMPLES.filter(isReady)) {
      expect(sample.file, `${sample.id}`).toMatch(/^\/samples\//);
    }
  });

  it('carries no timing figure for a sample that has not been generated', () => {
    // spec §4.5：数字必须有依据，取自实际运行耗时。未生成 = 无依据。
    for (const sample of SAMPLES.filter((s) => !isReady(s))) {
      expect(sample.durationSeconds, `${sample.id}`).toBeNull();
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/samples.test.ts`
Expected: FAIL —— `Failed to resolve import "@/data/samples"`

- [ ] **Step 3: 写 `src/data/samples.ts`**

```ts
import type { SkillId } from '@/data/skills';
import type { Locale } from '@/i18n/config';

export interface Sample {
  id: string;
  skillId: SkillId;
  /** public/samples/ 下的路径。未生成时为 null——渲染占位而不是坏链。 */
  file: string | null;
  previewImage: string | null;
  /** 实际运行该 skill 的耗时（秒）。无测量记录时为 null，页面不显示数字。 */
  durationSeconds: number | null;
  title: Record<Locale, string>;
}

/**
 * 样例产物由独立工作流生成（spec §7），与建站并行。
 * 生成后把 file / previewImage / durationSeconds 填上即可，页面自动从占位切换为真卡片。
 *
 * 隐私约束（spec §7.4）：样例文件中不得出现任何真实学生姓名或学校名。
 */
export const SAMPLES: readonly Sample[] = [
  {
    id: 'unit07-slides',
    skillId: 'ppt-workflow',
    file: null,
    previewImage: null,
    durationSeconds: null,
    title: { en: 'Unit 7 lesson slides (.pptx)', ko: '7단원 수업 슬라이드 (.pptx)' },
  },
  {
    id: 'unit07-listening',
    skillId: 'audio-workflow',
    file: null,
    previewImage: null,
    durationSeconds: null,
    title: { en: 'Unit 7 listening audio (.mp3)', ko: '7단원 듣기 음원 (.mp3)' },
  },
  {
    id: 'unit07-vocabulary',
    skillId: 'word-workflow',
    file: null,
    previewImage: null,
    durationSeconds: null,
    title: { en: 'Unit 7 vocabulary table (.xlsx)', ko: '7단원 어휘 학습표 (.xlsx)' },
  },
  {
    id: 'unit07-worksheets',
    skillId: 'worksheet-workflow',
    file: null,
    previewImage: null,
    durationSeconds: null,
    title: { en: 'Unit 7 worksheets (.docx ×3)', ko: '7단원 수준별 학습지 (.docx ×3)' },
  },
  {
    id: 'unit07-parent-notice',
    skillId: 'report-workflow',
    file: null,
    previewImage: null,
    durationSeconds: null,
    title: { en: 'Unit 7 parent notice (.png)', ko: '7단원 학부모 안내문 (.png)' },
  },
] as const;

export function isReady(sample: Sample): boolean {
  return sample.file !== null;
}
```

`lesson-workflow` 的产物（차시 분할、수업 지도안）是 Markdown 文本而非可下载文件，测试只要求"产出文件的 skill"有条目，因此它不在此列表中。若后续决定把지도안也做成可下载 PDF，再加条目。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/samples.test.ts`
Expected: PASS（5 passed）

- [ ] **Step 5: 补翻译键**

`src/i18n/en.json` 追加：

```json
  "samples.title": "Real output",
  "samples.lead": "Files produced from an actual textbook unit. No student names appear in any of them.",
  "samples.pending": "Sample in preparation",
  "samples.download": "Download",
  "samples.generatedIn": "Generated in",
  "samples.seconds": "seconds",
  "docs.title": "Install & get started",
  "faq.title": "Frequently asked questions",
  "notFound.title": "Page not found",
  "notFound.body": "That page does not exist. Try the home page.",
  "notFound.home": "Go to the home page"
```

`src/i18n/ko.json` 追加：

```json
  "samples.title": "실제 산출물",
  "samples.lead": "실제 교재 단원으로 만든 파일입니다. 어떤 파일에도 학생 실명은 들어 있지 않습니다.",
  "samples.pending": "샘플 준비 중",
  "samples.download": "내려받기",
  "samples.generatedIn": "생성 시간",
  "samples.seconds": "초",
  "docs.title": "설치와 시작하기",
  "faq.title": "자주 묻는 질문",
  "notFound.title": "페이지를 찾을 수 없습니다",
  "notFound.body": "해당 페이지가 존재하지 않습니다. 홈으로 돌아가 주세요.",
  "notFound.home": "홈으로 가기"
```

- [ ] **Step 6: 写 `src/components/SampleCard.astro`**

```astro
---
import { SKILLS, stageClass } from '@/data/skills';
import { isReady, type Sample } from '@/data/samples';
import { useTranslations } from '@/i18n/t';
import type { Locale } from '@/i18n/config';

interface Props {
  lang: Locale;
  sample: Sample;
}

const { lang, sample } = Astro.props;
const t = useTranslations(lang);

const skill = SKILLS.find((s) => s.id === sample.skillId);
if (!skill) throw new Error(`Sample ${sample.id} references unknown skill`);

const ready = isReady(sample);
---

<article
  class:list={[
    'rounded-xl border bg-surface p-5',
    ready ? stageClass(skill.stage) : 'border-border opacity-70',
  ]}
>
  {sample.previewImage && (
    <img
      src={sample.previewImage}
      alt={sample.title[lang]}
      loading="lazy"
      class="mb-4 w-full rounded-lg border border-border"
    />
  )}

  <h3 class="text-lg font-semibold text-text-hi">{sample.title[lang]}</h3>
  <p class="mt-1 font-mono text-xs text-text-mute">{sample.skillId}</p>

  {sample.durationSeconds !== null && (
    <p class="mt-2 text-sm text-text-body">
      {t('samples.generatedIn')} {sample.durationSeconds} {t('samples.seconds')}
    </p>
  )}

  {ready ? (
    <a
      href={sample.file!}
      download
      class="mt-4 inline-block rounded-lg border border-accent px-4 py-2 text-sm text-text-hi hover:bg-raised"
    >{t('samples.download')}</a>
  ) : (
    <p class="mt-4 text-sm text-text-mute">{t('samples.pending')}</p>
  )}
</article>
```

未就绪时渲染文字而非 `<a href="">` —— 死链会让 Task 13 的构建校验失败，也会让审核员认为站点未完成。

- [ ] **Step 7: 写 `src/pages/[lang]/samples.astro`**

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import SampleCard from '@/components/SampleCard.astro';
import { SAMPLES } from '@/data/samples';
import { useTranslations } from '@/i18n/t';
import type { Locale } from '@/i18n/config';

export { localeStaticPaths as getStaticPaths } from '@/i18n/paths';

const lang = Astro.params.lang as Locale;
const t = useTranslations(lang);
---

<BaseLayout
  lang={lang}
  title={`${t('samples.title')} — TeachFlow-KR`}
  description={t('samples.lead')}
  path="/samples"
>
  <h1 class="pt-16 text-4xl font-semibold text-text-hi">{t('samples.title')}</h1>
  <p class="mt-3 max-w-2xl text-text-body">{t('samples.lead')}</p>

  <div class="mt-10 grid gap-4 pb-16 md:grid-cols-2 lg:grid-cols-3">
    {SAMPLES.map((sample) => <SampleCard lang={lang} sample={sample} />)}
  </div>
</BaseLayout>
```

- [ ] **Step 8: 写 `src/pages/[lang]/docs.astro`**

内容为 README 第 2 章的浓缩：下载 zip → 解压到 Claude 的 skills 目录 → 重启 → 建单元文件夹并放入教材 PDF → 用自然语言提出第一个请求。写成有序步骤，每步一句话。**回 README §2 核对实际路径与措辞后再写**，不要凭印象写目录名。

页面结构与 `security.astro` 相同：`BaseLayout` + `path="/docs"` + `t('docs.title')`。内容直接写在 `.astro` 里（步骤短，不值得开内容集合）。

- [ ] **Step 9: 写 FAQ 内容与 `src/pages/[lang]/faq.astro`**

FAQ 条目取自 README §6，每条一个 md 文件，frontmatter 为 `{ lang, order, question }`，正文为答案。至少涵盖：

1. 한국어로 나오는 부분과 영어로 나오는 부분이 정해져 있나요？（产物语言分配规则 —— 这条也是 spec §7.1 的依据）
2. 교재 저작권은 괜찮나요？
3. 학생 정보가 밖으로 나가나요？（答案指向 `/security`）
4. 어떤 교재든 되나요？
5. 산출물을 그대로 써도 되나요？（答案：不行，每个 skill 都有教师确认事项）

`faq.astro` 按 `order` 排序渲染，用 `<details>`/`<summary>` 折叠 —— 原生元素，零 JS。

- [ ] **Step 10: 写两个 404 页**

`src/pages/[lang]/404.astro` 保持语言上下文：

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import { localizePath, type Locale } from '@/i18n/config';
import { useTranslations } from '@/i18n/t';

export { localeStaticPaths as getStaticPaths } from '@/i18n/paths';

const lang = Astro.params.lang as Locale;
const t = useTranslations(lang);
---

<BaseLayout
  lang={lang}
  title={`${t('notFound.title')} — TeachFlow-KR`}
  description={t('notFound.body')}
  path="/404"
>
  <section class="py-32">
    <h1 class="text-4xl font-semibold text-text-hi">{t('notFound.title')}</h1>
    <p class="mt-3 text-text-body">{t('notFound.body')}</p>
    <a
      href={localizePath('/', lang)}
      class="mt-6 inline-block rounded-lg bg-accent px-5 py-3 font-medium text-white"
    >{t('notFound.home')}</a>
  </section>
</BaseLayout>
```

`src/pages/404.astro` 用于未知语言前缀（spec §8：重定向至 `/en`），结构同上但 `lang` 固定为 `'en'`、不导出 `getStaticPaths`。

- [ ] **Step 11: 构建并运行全部测试**

Run: `npm run build && npx vitest run`
Expected: PASS

- [ ] **Step 12: 提交**

```bash
git add src/data/samples.ts src/components/SampleCard.astro "src/pages/[lang]" src/pages/404.astro src/content/faq src/i18n tests/unit/samples.test.ts
git commit -m "feat: add samples gallery, docs, FAQ and localized 404 pages"
```

---

## Task 12: 字体、质感与两处轻动效

对应 spec §5.3（质感四项）、§5.4（字体）、§4.5 第 1 项（Hero 扇形展开）与第 2 项（画廊卡片 hover）。第 3 项"节省时间计数器"**不在本任务内**：它依赖实际运行耗时，而 `SAMPLES` 里 `durationSeconds` 目前全为 `null`。样例生成工作流回填数字后再单独加，届时 `SampleCard` 已能显示单条耗时，首页计数器只是求和。没有数据就不做，是 Global Constraints 里那条纪律的直接后果。

**Files:**
- Create: `src/styles/fonts.css`
- Modify: `src/styles/global.css`
- Modify: `src/layouts/BaseLayout.astro`
- Create: `src/components/HeroFan.astro`
- Modify: `src/pages/[lang]/index.astro`
- Modify: `src/components/SampleCard.astro`
- Test: `tests/build/motion-budget.test.mjs`

**Interfaces:**
- Consumes: `SKILLS`（Task 4）、`BaseLayout`（Task 3）、`SampleCard`（Task 11）
- Produces: `HeroFan.astro` —— Props: `{ lang: Locale }`。纯 CSS 动画，不引入 JS。

- [ ] **Step 1: 写 `src/styles/fonts.css`**

woff2 文件由用户放入 `public/fonts/`（见 Global Constraints）。文件缺失时 `font-display: swap` 会直接用系统栈，页面不会空白——所以本步骤在字体到位前也能构建通过。

```css
/* Inter — 英文正文与标题 */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-latin-400.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2212;
}
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-latin-600.woff2') format('woff2');
  font-weight: 600;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2212;
}

/* Pretendard — 韩文 */
@font-face {
  font-family: 'Pretendard';
  src: url('/fonts/pretendard-korean-400.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Pretendard';
  src: url('/fonts/pretendard-korean-600.woff2') format('woff2');
  font-weight: 600;
  font-display: swap;
}

/* JetBrains Mono — 产物文件名，两语共用 */
@font-face {
  font-family: 'JetBrains Mono';
  src: url('/fonts/jetbrains-mono-400.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
```

- [ ] **Step 2: 在 `global.css` 中接上字体栈与网格底纹**

在 `@theme` 块之后追加。`@import './fonts.css';` 必须放在文件最顶部（`@import` 只能出现在其他规则之前）。

```css
:root {
  --font-sans-en: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-sans-ko: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
}

html:lang(en) { font-family: var(--font-sans-en); }
html:lang(ko) { font-family: var(--font-sans-ko); }

/* 韩语在同字号下视觉重量大于英文，标题下调一档（spec §5.4） */
html:lang(ko) h1 { font-size: 2.75rem; }
html:lang(ko) h2 { font-size: 1.375rem; }

.font-mono,
code,
kbd,
samp { font-family: var(--font-mono); }

/* 质感 1：网格底纹，向下渐隐，纯 CSS，不加 DOM 节点 */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image: radial-gradient(circle, var(--color-border) 1px, transparent 1px);
  background-size: 32px 32px;
  opacity: 0.04;
  mask-image: linear-gradient(to bottom, black 0%, transparent 70%);
}

/* 质感 3：渐变描边。用伪元素而非 border-image——border-image 不跟随 border-radius */
.edge-gradient {
  position: relative;
  border: 1px solid transparent;
  background-clip: padding-box;
}
.edge-gradient::after {
  content: '';
  position: absolute;
  inset: -1px;
  z-index: -1;
  border-radius: inherit;
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-glow));
}

/* 合规区静音：body[data-quiet] 下连底纹也去掉 */
body[data-quiet]::before { display: none; }
```

`body[data-quiet] *` 那条禁用阴影与动画的规则已在 Task 3 写入，本步骤只补底纹这一条。

- [ ] **Step 3: 在 `BaseLayout.astro` 中 preload 关键字体**

`<head>` 内、`<SeoHead />` 之后加两行。只 preload 当前语言的正文字重，不 preload 全部五个文件——preload 过多反而挤占首屏带宽。

```astro
{lang === 'en' && (
  <link rel="preload" href="/fonts/inter-latin-400.woff2" as="font" type="font/woff2" crossorigin />
)}
{lang === 'ko' && (
  <link rel="preload" href="/fonts/pretendard-korean-400.woff2" as="font" type="font/woff2" crossorigin />
)}
```

- [ ] **Step 4: 写 `src/components/HeroFan.astro`**

spec §4.5 第 1 项：教材图标扇形展开为 6 个产物缩略图，**循环一次即停**。纯 CSS `animation` + `animation-fill-mode: forwards`，无 JS，因此不计入首页 JS 预算。

```astro
---
import { SKILLS } from '@/data/skills';
import type { Locale } from '@/i18n/config';

interface Props {
  lang: Locale;
}

const { lang } = Astro.props;

// 六个产物标签沿 -50°..50° 均匀铺开
const ANGLE_SPAN = 100;
const fanned = SKILLS.map((skill, i) => ({
  skill,
  angle: -ANGLE_SPAN / 2 + (ANGLE_SPAN / (SKILLS.length - 1)) * i,
  delay: 200 + i * 90,
}));
---

<div class="hero-fan" aria-hidden="true" lang={lang}>
  <span class="hero-fan__source">PDF</span>
  {fanned.map(({ skill, angle, delay }) => (
    <span
      class="hero-fan__leaf font-mono"
      style={`--angle: ${angle}deg; --delay: ${delay}ms;`}
    >{skill.outputs[0] ?? '.md'}</span>
  ))}
</div>

<style>
  .hero-fan {
    position: relative;
    height: 180px;
    display: grid;
    place-items: center;
  }

  .hero-fan__source {
    font-size: 0.75rem;
    letter-spacing: 0.2em;
    color: var(--color-text-mute);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
  }

  .hero-fan__leaf {
    position: absolute;
    font-size: 0.7rem;
    color: var(--color-text-body);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    padding: 0.25rem 0.6rem;
    opacity: 0;
    transform: rotate(var(--angle)) translateY(0) rotate(calc(-1 * var(--angle)));
    animation: fan-out 600ms ease-out var(--delay) forwards;
  }

  @keyframes fan-out {
    to {
      opacity: 1;
      transform: rotate(var(--angle)) translateY(-88px) rotate(calc(-1 * var(--angle)));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hero-fan__leaf {
      animation: none;
      opacity: 1;
      transform: rotate(var(--angle)) translateY(-88px) rotate(calc(-1 * var(--angle)));
    }
  }
</style>
```

内层的反向 `rotate` 让标签始终水平——否则边缘的两个会侧躺，韩语混排时尤其难读。`aria-hidden="true"` 是因为这些文件扩展名在下方 `/skills` 区已有语义化呈现，屏幕阅读器重复朗读没有价值。

- [ ] **Step 5: 把 `HeroFan` 挂上首页**

`src/pages/[lang]/index.astro` 的 hero `<section>` 改为两栏：左侧标题与 CTA 不变，右侧放 `<HeroFan lang={lang} />`。

```astro
  <section class="grid items-center gap-8 pt-20 pb-8 md:grid-cols-[minmax(0,1fr)_280px]">
    <div>
      <!-- 原有 h1 / p / CTA 三块原样移入 -->
    </div>
    <HeroFan lang={lang} />
  </section>
```

同时在 frontmatter 加 `import HeroFan from '@/components/HeroFan.astro';`。

- [ ] **Step 6: 给样例卡加 hover 升起，并把渐变描边用到定价卡上**

`SampleCard.astro` 的 `<article>` class 列表追加：

```
'transition-transform transition-shadow duration-200 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(46,125,255,0.18)]'
```

`PriceBlock.astro` 的外层容器加 `edge-gradient` 类。

spec §4.5 第 2 项还写了"点击开灯箱"。**本实现改为：缩略图直接链接到原图**（`<a href={sample.previewImage}>` 包住 `<img>`）。灯箱需要 JS，而零 JS 是 `/samples` 的硬约束（Task 9 的 `no-js.test.mjs` 会直接判失败）。点开原图在新标签页是同等有效的"看大图"路径，且对键盘与屏幕阅读器更友好。这是一处有意偏离，记在此处以免后来者以为是漏做。

- [ ] **Step 7: 写 `tests/build/motion-budget.test.mjs`**

spec §4.5 写死"除此之外全站不做动效"。这条测试守住上限，防止后续任务随手加 `animate-*`。

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';

describe('motion budget', () => {
  it('runs no animation on the compliance pages', async () => {
    const files = await fg(['dist/*/pricing/index.html', 'dist/*/legal/**/index.html']);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const html = readFileSync(resolve(file), 'utf8');
      expect(html, `${file} should be quiet`).toContain('data-quiet');
    }
  });

  it('keeps the grid texture out of the DOM', async () => {
    // 底纹是 body::before，纯 CSS。出现 div.grid-texture 之类说明有人加了 DOM 节点。
    const files = await fg(['dist/**/index.html']);
    for (const file of files) {
      expect(readFileSync(resolve(file), 'utf8')).not.toMatch(/class="[^"]*grid-texture/);
    }
  });
});
```

- [ ] **Step 8: 构建并运行全部测试**

Run: `npm run build && npx vitest run`
Expected: PASS

- [ ] **Step 9: 人工验证**

浏览器打开首页：Hero 扇形只演一次、不循环；样例卡 hover 升起；`/pricing` 与 `/legal/refund` 完全静止、无辉光；开系统"减少动态效果"后重载首页，扇形直接是终态。

- [ ] **Step 10: 提交**

```bash
git add src/styles "src/pages/[lang]/index.astro" src/components src/layouts tests/build/motion-budget.test.mjs
git commit -m "feat: add self-hosted fonts, grid texture and the two permitted micro-animations"
```

---

## Task 13: 关系图的约束流动与悬停交互

对应 spec §4.2（约束向下流动的发光胶囊）与 §4.3（悬停高亮 + 侧卡）。这是首页 island 的第二批行为，全部挂在 Task 9 已建立的 `data-flow-*` 钩子上，不改 SVG 结构。

**Files:**
- Modify: `src/components/FlowDiagram/FlowDiagram.astro`
- Modify: `src/components/FlowDiagram/flow-diagram.ts`
- Modify: `src/i18n/en.json`、`src/i18n/ko.json`
- Test: `tests/build/flow-hooks.test.mjs`

**Interfaces:**
- Consumes: `FLOW_NODES` / `FLOW_EDGES` / `edgePath`（Task 8）、`play(root)` / `BEAT_MS`（Task 9）、`SAMPLES`（Task 11）
- Produces: 在 `flow-diagram.ts` 中新增并导出 `runConstraintPulse(root: HTMLElement): void` 与 `bindHover(root: HTMLElement): void`，均由既有 `init()` 调用。

- [ ] **Step 1: 补翻译键**

`en.json`：

```json
  "flow.constraint.core": "core flow",
  "flow.constraint.order": "stage order",
  "flow.card.needs": "Needs",
  "flow.card.makes": "Produces",
  "flow.card.sample": "See the sample"
```

`ko.json`：

```json
  "flow.constraint.core": "핵심 흐름",
  "flow.constraint.order": "단계 순서",
  "flow.card.needs": "필요한 것",
  "flow.card.makes": "만들어 내는 것",
  "flow.card.sample": "샘플 보기"
```

- [ ] **Step 2: 在 `FlowDiagram.astro` 中加胶囊与侧卡的静态标记**

胶囊放在 SVG 内，初始 `opacity: 0`，无 JS 时不可见——它表达的是"约束沿流程向下传递"这一过程，静态帧没有意义，因此静默隐藏而非渲染终态。这与节点/连线的处理不同，原因写在注释里。

SVG 末尾追加：

```astro
  <g data-flow-capsule opacity="0">
    <rect rx="12" width="132" height="26" fill="var(--color-raised)"
          stroke="var(--color-accent-glow)" stroke-width="1" />
    <text x="66" y="17" text-anchor="middle" font-size="12"
          fill="var(--color-accent-glow)" data-flow-capsule-label>
      {t('flow.constraint.core')}
    </text>
  </g>
```

侧卡放在 SVG 外、图容器内，每个节点一张，默认 `hidden`：

```astro
<div class="pointer-events-none absolute inset-y-0 right-0 hidden w-64 md:block">
  {FLOW_NODES.map((node) => (
    <article
      data-flow-card={node.id}
      hidden
      class="pointer-events-auto rounded-xl border border-border bg-surface p-4 text-sm"
    >
      <h3 class="font-semibold text-text-hi">{t(`flow.node.${node.id}`)}</h3>
      <p class="mt-2 text-text-mute">{t('flow.card.needs')}</p>
      <p class="font-mono text-xs text-text-body">{node.needs.join(' · ')}</p>
      <p class="mt-2 text-text-mute">{t('flow.card.makes')}</p>
      <p class="font-mono text-xs text-text-body">{node.outputs.join(' · ')}</p>
      {sampleHrefFor(node.id) && (
        <a href={sampleHrefFor(node.id)} class="mt-3 inline-block text-accent hover:underline">
          {t('flow.card.sample')}
        </a>
      )}
    </article>
  ))}
</div>
```

外层容器需加 `relative`。`sampleHrefFor` 在 frontmatter 里定义：查 `SAMPLES` 中 `skillId === nodeId` 且 `isReady` 的第一条，返回 `` `${localizePath('/samples', lang)}#${sample.id}` ``，否则返回 `null`——样例未生成时不给链接，与 Task 11 同一条纪律。

`node.needs` 与 `node.outputs` 由 Task 8 的 `FlowNode` 提供，本任务只读不改。

- [ ] **Step 3: 在 `flow-diagram.ts` 中实现 `runConstraintPulse`**

在 `play()` 的四拍结束后调用。胶囊沿 `lesson → 四个二级节点 → report` 的主干路径滑下，经过某节点时该节点边框闪一下。

```ts
const CAPSULE_MS = 1400;

export function runConstraintPulse(root: HTMLElement): void {
  const capsule = root.querySelector<SVGGElement>('[data-flow-capsule]');
  if (!capsule) return;

  const stops = ['lesson-workflow', 'ppt-workflow', 'report-workflow'];
  capsule.setAttribute('opacity', '1');

  stops.forEach((id, i) => {
    window.setTimeout(() => {
      const node = root.querySelector<SVGGElement>(`[data-flow-node="${id}"]`);
      if (!node) return;
      const box = node.getBBox();
      capsule.setAttribute(
        'transform',
        `translate(${box.x + box.width / 2 - 66}, ${box.y - 34})`,
      );
      node.classList.add('is-pulsing');
      window.setTimeout(() => node.classList.remove('is-pulsing'), 400);
    }, i * CAPSULE_MS);
  });

  window.setTimeout(() => capsule.setAttribute('opacity', '0'), stops.length * CAPSULE_MS);
}
```

`.is-pulsing` 的样式写在 `FlowDiagram.astro` 的 `<style>` 里：`filter: drop-shadow(0 0 12px var(--color-accent-glow));` 配 `transition: filter 200ms`。

- [ ] **Step 4: 实现 `bindHover`**

```ts
export function bindHover(root: HTMLElement): void {
  const nodes = Array.from(root.querySelectorAll<SVGGElement>('[data-flow-node]'));
  const edges = Array.from(root.querySelectorAll<SVGPathElement>('[data-edge]'));
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-flow-card]'));

  const clear = () => {
    nodes.forEach((n) => n.classList.remove('is-dimmed', 'is-focused'));
    edges.forEach((e) => e.classList.remove('is-dimmed', 'is-focused'));
    cards.forEach((c) => { c.hidden = true; });
  };

  const focus = (id: string) => {
    nodes.forEach((n) => {
      const self = n.dataset.flowNode === id;
      n.classList.toggle('is-focused', self);
      n.classList.toggle('is-dimmed', !self);
    });
    edges.forEach((e) => {
      const key = e.dataset.edge ?? '';
      const touches = key.startsWith(`${id}->`) || key.endsWith(`->${id}`);
      e.classList.toggle('is-focused', touches);
      e.classList.toggle('is-dimmed', !touches);
    });
    cards.forEach((c) => { c.hidden = c.dataset.flowCard !== id; });
  };

  for (const node of nodes) {
    const id = node.dataset.flowNode;
    if (!id) continue;
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    node.addEventListener('mouseenter', () => focus(id));
    node.addEventListener('focus', () => focus(id));
    node.addEventListener('click', () => focus(id));   // 移动端：点击展开
  }

  root.addEventListener('mouseleave', clear);
  root.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') clear();
  });
}
```

`tabindex` 与 `role` 在 JS 里加而不是写进 SVG：无 JS 时这些节点不可交互，标成 `role="button"` 会向屏幕阅读器承诺一个不存在的行为。

`.is-dimmed { opacity: .35; }`、`.is-focused` 加辉光，写在同一个 `<style>` 里，均带 `transition: opacity 200ms`。

- [ ] **Step 5: 在 `init()` 中接上**

`prefers-reduced-motion` 时跳过 `play` 与 `runConstraintPulse`，但**仍调用 `bindHover`**——悬停高亮是信息获取手段，不是装饰，减少动态效果的用户同样需要它。把 `bindHover` 提到 reduced-motion 的早退分支之前。

- [ ] **Step 6: 写 `tests/build/flow-hooks.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';

const home = (lang) =>
  parse(readFileSync(resolve(process.cwd(), 'dist', lang, 'index.html'), 'utf8'));

describe('flow diagram hooks', () => {
  it('ships one card per node in both locales', () => {
    for (const lang of ['en', 'ko']) {
      const root = home(lang);
      expect(root.querySelectorAll('[data-flow-card]').length).toBe(6);
      expect(root.querySelectorAll('[data-flow-capsule]').length).toBe(1);
    }
  });

  it('hides the cards without JS', () => {
    for (const card of home('en').querySelectorAll('[data-flow-card]')) {
      expect(card.hasAttribute('hidden')).toBe(true);
    }
  });

  it('promises no button role before JS can deliver it', () => {
    expect(home('en').querySelectorAll('[data-flow-node][role="button"]').length).toBe(0);
  });

  it('localizes the capsule label', () => {
    expect(home('ko').toString()).toContain('핵심 흐름');
    expect(home('en').toString()).toContain('core flow');
  });
});
```

- [ ] **Step 7: 构建并运行全部测试**

Run: `npm run build && npx vitest run`
Expected: PASS

- [ ] **Step 8: 人工验证**

悬停每个节点：其余变暗、相连边高亮、侧卡出现且内容对应；Tab 键也能逐个聚焦并出卡；Esc 复位；窄屏下点击展开；开减少动态效果后悬停仍工作、但无胶囊滑动。

- [ ] **Step 9: 提交**

```bash
git add src/components/FlowDiagram src/i18n tests/build/flow-hooks.test.mjs
git commit -m "feat: add constraint pulse and node hover detail to the flow diagram"
```

---

## Task 14: 构建校验脚本与 Hetzner 部署配置

对应 spec §9.1（自动检查）与 §9.3（部署前必查）。`verify-build.mjs` 是站点上线前的最后一道闸门，跑在 `dist/` 上而非源码上——Stripe 审核员看到的是 `dist/`。

**Files:**
- Create: `scripts/verify-build.mjs`
- Create: `deploy/Caddyfile`
- Create: `deploy/README.md`
- Modify: `package.json`
- Modify: `README.md`（仓库根，项目说明）

**Interfaces:**
- Consumes: `dist/`（全部前置任务的构建产物）
- Produces: `npm run verify` —— 退出码 0 表示可部署；非 0 打印每条失败及其文件路径。

- [ ] **Step 1: 写 `scripts/verify-build.mjs`**

不是 vitest 测试，是可独立运行的脚本——部署流水线里只装生产依赖时也要能跑（`fast-glob` 与 `node-html-parser` 因此必须在 `dependencies` 而非 `devDependencies`，Task 1 已如此安排）。

```js
#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import fg from 'fast-glob';
import { parse } from 'node-html-parser';

const DIST = resolve(process.cwd(), 'dist');
const LOCALES = ['en', 'ko'];
const failures = [];

const fail = (check, detail) => failures.push(`${check}: ${detail}`);

const pages = await fg('**/index.html', { cwd: DIST });
if (pages.length === 0) fail('build', 'dist/ contains no pages — run `npm run build` first');

// 1. 两语页面数量一致，无缺页
const byLocale = Object.fromEntries(
  LOCALES.map((l) => [l, pages.filter((p) => p.startsWith(`${l}/`)).map((p) => p.slice(l.length + 1))]),
);
const [en, ko] = [new Set(byLocale.en), new Set(byLocale.ko)];
for (const page of en) if (!ko.has(page)) fail('locale-parity', `ko/${page} missing`);
for (const page of ko) if (!en.has(page)) fail('locale-parity', `en/${page} missing`);

// 2. hreflang / canonical 存在且互指
for (const page of pages) {
  const html = parse(readFileSync(join(DIST, page), 'utf8'));
  const canonical = html.querySelector('link[rel="canonical"]');
  if (!canonical) { fail('canonical', `${page} has none`); continue; }

  const alts = html.querySelectorAll('link[rel="alternate"][hreflang]')
    .map((l) => l.getAttribute('hreflang'));
  for (const expected of [...LOCALES, 'x-default']) {
    if (!alts.includes(expected)) fail('hreflang', `${page} missing hreflang="${expected}"`);
  }
}

// 3. 无死链。只查站内绝对路径；外链不在本脚本职责内。
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

// 4. 价格写法。全站唯一合法写法是 "USD 19.90"（Global Constraints）。
for (const file of await fg('**/*.html', { cwd: DIST })) {
  const text = readFileSync(join(DIST, file), 'utf8');
  if (/\$\s?19(\.9\d?)?\b/.test(text)) fail('price-notation', `${file} uses a $ price`);
}

// 5. 站点必须公开可访问（spec §9.3）
const robots = existsSync(join(DIST, 'robots.txt'))
  ? readFileSync(join(DIST, 'robots.txt'), 'utf8')
  : '';
if (/Disallow:\s*\/\s*$/m.test(robots)) fail('public-access', 'robots.txt disallows the whole site');
for (const page of pages) {
  const html = readFileSync(join(DIST, page), 'utf8');
  if (/name=["']robots["'][^>]*noindex/i.test(html)) fail('public-access', `${page} is noindex`);
  if (/coming soon|under construction/i.test(html)) fail('public-access', `${page} looks unfinished`);
}

// 6. 主体信息逐字一致（spec §9.3）
const FOOTER_FACTS = [
  'CROSSXTOP LTD',
  'Company No. 16339041',
  'Suite 10890, 61 Bridge Street, Kington, United Kingdom, HR5 3DJ',
  'vichajser@gmail.com',
];
for (const page of pages) {
  const html = readFileSync(join(DIST, page), 'utf8');
  for (const fact of FOOTER_FACTS) {
    if (!html.includes(fact)) fail('entity-details', `${page} missing "${fact}"`);
  }
}

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`✓ ${pages.length} pages verified`);
```

- [ ] **Step 2: 接上 npm script**

`package.json` 的 `scripts` 中 `verify` 一项（Task 1 已占位）改为：

```json
    "verify": "node scripts/verify-build.mjs"
```

- [ ] **Step 3: 跑一次，修掉它报的问题**

Run: `npm run build && npm run verify`
Expected: `✓ N pages verified`

第一次跑几乎一定会失败——这是它的价值所在。逐条修，不要放宽检查规则去迁就产物。唯一可以调整检查的情形：规则本身写错了（例如把某个确实不该有页脚的页面也纳入了 `entity-details`）。

- [ ] **Step 4: 写 `deploy/Caddyfile`**

```
{$SITE_DOMAIN} {
	root * /srv/teachflow/dist
	encode zstd gzip

	# 根路径进默认语言。302 而非 301——将来若加语言协商，301 会被浏览器长期缓存。
	redir / /en/ 302

	# 未知语言前缀同样回默认语言（spec §8）
	@unknown_locale not path /en/* /ko/* /fonts/* /samples/* /robots.txt /favicon.ico
	redir @unknown_locale /en/ 302

	@immutable path /_astro/* /fonts/*
	header @immutable Cache-Control "public, max-age=31536000, immutable"

	@html path *.html /
	header @html Cache-Control "public, max-age=0, must-revalidate"

	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}

	handle_errors {
		@en path /en/*
		rewrite @en /en/404/index.html
		@ko path /ko/*
		rewrite @ko /ko/404/index.html
		rewrite /404.html
		file_server
	}

	file_server
}
```

**不得添加 `basicauth`。** Stripe 审核员必须能匿名访问——这是预发布站点最常见的驳回原因（spec §6.1 末行）。此处特意留注记，防止部署时为"先不让人看到"而加上。

- [ ] **Step 5: 写 `deploy/README.md`**

内容：

1. 本地 `npm run build && npm run verify`
2. `rsync -avz --delete dist/ user@<hetzner-host>:/srv/teachflow/dist/`
3. `SITE_DOMAIN=<域名> caddy reload --config /etc/caddy/Caddyfile`
4. 域名确定后必改的两处：`src/config/site.ts` 的 `SITE.domain`、服务器上的 `SITE_DOMAIN` 环境变量
5. spec §9.3 清单逐条勾选，其中前三条已由 `npm run verify` 覆盖，**第三条「客服邮箱真实可达并已测试收信」必须人工做**——脚本只能检查邮箱字符串出现在页面上，不能检查它收得到信

- [ ] **Step 6: 写仓库根 `README.md`**

简短：项目是什么、`npm install` / `npm run dev` / `npm run build` / `npm run verify` 四条命令、目录结构一句话、指向 `docs/superpowers/specs/` 与 `docs/superpowers/plans/`。说明 `public/fonts/` 需要自行放入 woff2（列出五个文件名），以及样例文件由独立工作流生成。

- [ ] **Step 7: 提交**

```bash
git add scripts deploy package.json README.md
git commit -m "feat: add build verification and Hetzner deployment config"
```

---

## 收尾：全量验证

- [ ] **Step 1: 干净构建**

```bash
rm -rf dist .astro && npm run build && npx vitest run && npm run verify
```

三条全绿才算完成。

- [ ] **Step 2: Lighthouse 与对比度（spec §9.1 后两条）**

```bash
npx serve dist -l 4173
```

另开一个终端，对英韩各一套首页与 `/pricing` 跑 Lighthouse（Chrome DevTools 的 Lighthouse 面板即可，无需额外装包）。门槛：**性能 ≥ 90，可访问性 ≥ 95**。

常见扣分项与对策，按出现概率排序：

1. **文字对比度不足** —— 深底上的 `--color-text-mute` (#7C8AA6) 落在 `--color-surface` (#0E1626) 上约 5.4:1，正文尺寸下过 AA；但若被用在 12px 以下的小字上会被判失败。发现时把该处提到 `--color-text-body`，不要去调色板——色板是 spec §5.1 定死的。
2. **`aria-hidden` 元素内含可聚焦节点** —— `HeroFan` 整块 `aria-hidden`，其中不得出现 `<a>` 或 `<button>`。
3. **SVG 缺无障碍名** —— `FlowDiagram` 的 `<svg>` 需有 `role="img"` 与 `<title>`（走 i18n）；Task 8 若未加，此处补。
4. **字体导致 CLS** —— 若 `public/fonts/` 尚空，系统字体直接生效、无布局偏移；woff2 放入后需复测这一项。

不达标就修，修完重跑。分数写进提交信息，便于后续对比。

- [ ] **Step 3: 人工过一遍 spec §9.2**

- 英韩切换保持当前路径（在 `/legal/refund` 上切一次，应落到 `/ko/legal/refund`）
- 韩语长标签在动画节点内不溢出
- `prefers-reduced-motion` 下动画完全静止
- 移动端（375px 宽）关系图竖排可读
- **两分钟 Stripe 审核模拟**：计时，从首页出发找齐商品、价格、退款政策、客服邮箱、公司主体信息。找不齐就是页面导航有问题，不是审核员的问题。

- [ ] **Step 4: 推送由用户执行**

本计划全程不 push（Global Constraints）。执行完毕后告诉用户分支状态与提交数，由用户决定何时 `git push`。
