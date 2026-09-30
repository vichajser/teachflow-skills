// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import en from './src/i18n/en.json';
import ko from './src/i18n/ko.json';

/**
 * Markdown 表格包一层可横向滚动、**可聚焦**的容器。
 *
 * 两个问题一起修，必须一起修：
 * 1. 溢出：`.md-body table` 只有 `width:100%`，没有滚动容器。实测 320px 下
 *    `/en/skills/` 的 `scrollWidth=349 / clientWidth=320`，**整份文档**横向
 *    溢出 29px（收敛区间 320–344px）。WCAG 1.4.10 允许数据表横滚，
 *    豁免的是**表格自己滚**，不是把整页拖宽。
 * 2. 键盘不可达：只给容器 `overflow-x:auto` 而不给 `tabindex`，鼠标能拖、
 *    键盘用户拿不到焦点，被截掉的列永远看不到（axe `scrollable-region-focusable`,
 *    WCAG 2.1.1）。先修 1 再忘了 2，等于把 `/security` 上已有的这个缺陷
 *    复制到 `/skills`。
 *
 * 写成本地 rehype 插件而不是装 `rehype-wrap` 一类的包：禁止新增依赖，
 * 而这件事只是一次 HAST 遍历。`unist-util-visit` 同理，自己递归即可。
 *
 * `aria-label` 先看 frontmatter 的 `lang`（三个集合的 schema 都有这个必填字段），
 * 拿不到再退回文件路径里的 `/{en,ko}/` 目录段。不硬编码英文。
 * 字典在这里直接 import——它就是同一份 JSON，不存在第二处真相。
 */
function rehypeScrollableTables() {
  return (tree, file) => {
    const fm = file?.data?.astro?.frontmatter ?? {};
    const lang =
      fm.lang === 'ko' || /(?:^|[\\/])ko[\\/]/.test(file?.path ?? '') ? 'ko' : 'en';
    const label = (lang === 'ko' ? ko : en)['a11y.scrollableTable'];

    const walk = (node) => {
      if (!Array.isArray(node.children)) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'element' && child.tagName === 'table') {
          node.children[i] = {
            type: 'element',
            tagName: 'div',
            properties: {
              className: ['table-scroll'],
              tabIndex: 0,
              role: 'region',
              'aria-label': label,
            },
            children: [child],
          };
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}

// 域名尚未购买：占位域名只允许出现在这里与 src/config/site.ts。
// 确定域名后，两处同步改动即可，其余代码不得硬编码域名。

// ---- sitemap lastmod：从 git 历史取每个页面真实的最后修改时间 ----------------
//
// 单一的 `lastmod: new Date()` 选项会把"构建时间"钉给所有页面——每次构建
// 全站 lastmod 都刷新，搜索引擎很快学会忽略它。`serialize` 按页喂：
// 一个 URL 的 lastmod = 改过它任何原料的最后一次提交时间（路由文件、
// 本语言字典、页面消费的内容集合、共享布局/组件/样式/常量）。
//
// git 不可用（如源码以 tarball 解包）或文件从未提交时，返回 null，
// 该 URL 静默不带 lastmod——sitemap 不因此失效。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const SHARED_SRC = [
  'src/layouts/BaseLayout.astro',
  'src/layouts/LegalLayout.astro',
  'src/components',
  'src/config/site.ts',
  'src/styles/global.css',
];

/** sitemap URL → 这页的原料文件。path 形如 '/en/faq'、'/'。 */
function pageSources(path) {
  if (path === '' || path === '/') return ['src/pages/index.astro', ...SHARED_SRC];

  const m = path.match(/^\/(en|ko)(?:\/(.+))?$/);
  if (!m) return [...SHARED_SRC];

  const lang = m[1];
  const rest = m[2] ?? '';
  const files = rest
    ? [`src/pages/[lang]/${rest}.astro`, `src/pages/[lang]/${rest}/index.astro`]
    : ['src/pages/[lang]/index.astro'];
  files.push(`src/i18n/${lang}.json`);

  // 页面消费的内容集合：内容变了，页面就是变了，lastmod 必须跟着走。
  if (rest === '') files.push(`src/content/skills/${lang}`); // 首页的技能卡
  if (rest === 'faq') files.push(`src/content/faq/${lang}`);
  if (rest === 'skills') files.push(`src/content/skills/${lang}`, 'src/data/skills.ts');
  if (rest === 'samples') files.push('src/data/samples.ts');
  if (rest === 'security') files.push('src/data/security-matrix.ts');
  if (rest.startsWith('legal/')) files.push(`src/content/legal/${lang}`);

  return [...files, ...SHARED_SRC];
}

function gitLastCommit(paths) {
  const real = paths.filter((p) => existsSync(p));
  if (real.length === 0) return null;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...real], {
      encoding: 'utf8',
    });
    return out.trim() ? new Date(out.trim()) : null;
  } catch {
    return null;
  }
}

export default defineConfig({
  site: 'https://tryteachflow.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  // robots.txt 承诺了 /sitemap-index.xml，这里负责真的生成它。
  //
  // filter 不是多余的：@astrojs/sitemap 的 isStatusCodePage() 从
  // `opts.i18n.locales` 推导要排除的错误页名单，而本项目刻意不启用 Astro 的
  // i18n 配置块（语言路由由 `src/pages/[lang]/` 显式生成）。名单因此塌成裸
  // `{"404","500"}`，只挡得住根 `/404`，`/en/404` 与 `/ko/404` 照收不误。
  // 守卫在 tests/build/seo.test.mjs。
  //
  // `/buy/success` 是购后确认页，不是搜索目的地：把它提交给搜索引擎只会在
  // 索引里堆一个转化漏斗终点。页面照常构建（tests/build/pages.test.mjs 仍
  // 要求它在两语都存在），只是不再出现在 sitemap。
  integrations: [
    sitemap({
      filter: (page) => !/\/(404|500)\/?$/.test(page) && !/\/buy\/success\/?$/.test(page),
      serialize: (item) => {
        const path = item.url.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '');
        const lastmod = gitLastCommit(pageSources(path));
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
  markdown: { rehypePlugins: [rehypeScrollableTables] },
  vite: { plugins: [tailwindcss()] },
});

