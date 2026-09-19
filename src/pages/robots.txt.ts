import type { APIRoute } from 'astro';
import { SITE } from '@/config/site';

/**
 * robots.txt 是路由而非 public/ 静态文件：静态文件会把占位域名钉死在
 * 第三处（astro.config.mjs 与 src/config/site.ts 是仅有的两处）。
 * 正文与原先的静态文件逐字相同，只有域名改为从 SITE 读取。
 *
 * 公开可访问是 Stripe 审核的硬性项：不得出现 noindex，也不得 Disallow。
 */
export const GET: APIRoute = () => {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${SITE.domain}/sitemap-index.xml\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
