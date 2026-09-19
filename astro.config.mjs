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
