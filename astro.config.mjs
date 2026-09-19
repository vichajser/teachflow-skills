// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// 域名尚未购买：占位域名只允许出现在这里与 src/config/site.ts。
// 确定域名后，两处同步改动即可，其余代码不得硬编码域名。
export default defineConfig({
  site: 'https://teachflow-kr.example',
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
  vite: { plugins: [tailwindcss()] },
});
