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
  integrations: [sitemap({ filter: (page) => !/\/(404|500)\/?$/.test(page) })],
  markdown: { rehypePlugins: [rehypeScrollableTables] },
  vite: { plugins: [tailwindcss()] },
});
