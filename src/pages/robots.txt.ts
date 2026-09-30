import type { APIRoute } from 'astro';
import { SITE } from '@/config/site';

/**
 * robots.txt 是路由而非 public/ 静态文件：静态文件会把占位域名钉死在
 * 第三处（astro.config.mjs 与 src/config/site.ts 是仅有的两处）。
 * 正文与原先的静态文件逐字相同，只有域名改为从 SITE 读取。
 *
 * 公开可访问是 Stripe 审核的硬性项：不得出现 noindex，也不得 Disallow。
 *
 * 第二个组（2026-09-30，GEO）：把生成式引擎的爬虫**显式**放行。通配符组
 * 本来已经允许它们——这一组的存在不是扩权，是表态：将来任何针对具体
 * 爬虫的规则都必须是有人 consciously 写下的决定，而不是"通配符收紧时
 * 顺手把 AI 爬虫也挡了"的事故。名单只收有官方文档 UA 串的爬虫。
 */
export const GET: APIRoute = () => {
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    '# Generative-engine crawlers are explicitly welcome (GEO).',
    '# See src/pages/robots.txt.ts before adding any rule here.',
    'User-agent: GPTBot',
    'User-agent: OAI-SearchBot',
    'User-agent: ChatGPT-User',
    'User-agent: ClaudeBot',
    'User-agent: Claude-Web',
    'User-agent: Claude-SearchBot',
    'User-agent: PerplexityBot',
    'User-agent: Perplexity-User',
    'User-agent: Google-Extended',
    'User-agent: Amazonbot',
    'User-agent: Applebot-Extended',
    'User-agent: meta-externalagent',
    'User-agent: CCBot',
    'Allow: /',
    '',
    `Sitemap: ${SITE.domain}/sitemap-index.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
