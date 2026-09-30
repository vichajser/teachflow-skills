import type { Pool } from 'pg';
import type { Handler, RequestContext } from '../http/router.ts';
import { sendError, sendHtml, sendJson } from '../http/respond.ts';
import { bearerAuthorized, escapeHtml } from '../lib/authorize.ts';
import { buildFunnelReport, type FunnelReport } from '../funnel/report.ts';

const MAX_DAYS = 365;

/**
 * GET /api/admin/funnel?days=30&format=json|html —— 漏斗计数报表（Bearer 鉴权）。
 *
 * 这是漏斗的**权威口径**：五步计数全部出自 funnel_events 同一张表（①②服务端
 * 采集，③④Polar webhook，⑤回跳），不存在跨工具拼数。PostHog（若启用）只是
 * 同一批事件的镜像，用来做趋势与细分。
 */
export function funnelReportRoute(deps: { adminToken: string; pool: Pool }): Handler {
  return async (ctx: RequestContext) => {
    if (!bearerAuthorized(ctx.req.headers.authorization, deps.adminToken)) {
      sendError(ctx.res, 401, 'unauthorized', '缺少或不正确的 Bearer token。');
      return;
    }

    const rawDays = Number(ctx.url.searchParams.get('days') ?? '30');
    const days =
      Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= MAX_DAYS ? rawDays : 30;

    const report = await buildFunnelReport(deps.pool, days);
    if (ctx.url.searchParams.get('format') === 'html') {
      sendHtml(ctx.res, 200, renderHtml(report));
      return;
    }
    sendJson(ctx.res, 200, report);
  };
}

function renderHtml(report: FunnelReport): string {
  const stepName: Record<string, string> = {
    page_view: '① 进入页面',
    checkout_click: '② 点击购买',
    checkout_open: '③ 到达支付页',
    order_paid: '④ 支付成功',
    success_return: '⑤ 回跳成功页',
  };
  const rows = report.steps
    .map((s) => {
      const fromPrev = s.fromPrev === null ? '—' : `${s.fromPrev}%`;
      const fromEntry = s.fromEntry === null ? '—' : `${s.fromEntry}%`;
      return `<tr><td>${escapeHtml(stepName[s.step] ?? s.step)}</td><td>${s.count}</td>` +
        `<td>${fromPrev}</td><td>${fromEntry}</td>` +
        `<td>${report.botsExcluded[s.step] ?? 0}</td></tr>`;
    })
    .join('\n');

  const srcRows = Object.entries(report.bySrc['checkout_click'] ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([src, n]) => `<tr><td>${escapeHtml(src)}</td><td>${n}</td></tr>`)
    .join('\n');

  const langRows = report.steps
    .map(
      (s) =>
        `<tr><td>${escapeHtml(stepName[s.step] ?? s.step)}</td>` +
        `<td>${report.byLang[s.step]?.en ?? 0}</td><td>${report.byLang[s.step]?.ko ?? 0}</td></tr>`,
    )
    .join('\n');

  const pageRows = report.topPages
    .map((p) => `<tr><td>${escapeHtml(p.path)}</td><td>${p.count}</td></tr>`)
    .join('\n');

  const table = (head: string, body: string) =>
    `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:16px 0">` +
    `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;

  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">` +
    `<title>TeachFlow 漏斗 · 近 ${report.days} 天</title></head>` +
    `<body style="font:14px/1.6 -apple-system,system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px">` +
    `<h1>漏斗 · 近 ${report.days} 天</h1>` +
    `<p>区间：${report.from} → ${report.to}（已排除 bot=true 事件；见末列与脚注）</p>` +
    table(
      '<th>步骤</th><th>次数</th><th>较上一步</th><th>较进入</th><th>被排除的爬虫</th>',
      rows,
    ) +
    `<h2>购买点击来源（②）</h2>` +
    (srcRows ? table('<th>src</th><th>点击</th>', srcRows) : '<p>还没有点击数据。</p>') +
    `<h2>按语言</h2>` +
    table('<th>步骤</th><th>en</th><th>ko</th>', langRows) +
    `<h2>进入页面 Top 15（①）</h2>` +
    (pageRows
      ? table('<th>路径</th><th>PV</th>', pageRows)
      : '<p>还没有页面访问数据——确认 Caddy 访问日志与摄取定时任务都已就位。</p>') +
    `<p style="color:#666">口径：① 来自服务器日志（含爬虫过滤，数字偏保守）；③④ 来自 Polar webhook。` +
    `无 cookie：步骤间不做访客关联，丢失率按各步计数相除。</p>` +
    `</body></html>`;
}
