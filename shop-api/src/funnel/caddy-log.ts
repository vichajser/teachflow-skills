import { isBotUa, type FunnelEventInput } from './events.ts';

/**
 * Caddy JSON 访问日志 → page_view 事件的纯解析层。IO 在 bin/ingest-caddy-logs.ts，
 * 判定在这里，单测不需要碰文件系统。
 *
 * 口径（与 docs/2026-09-29-funnel-analytics-plan.md §3 一致）：
 *   - 只数 GET 且状态 200 的响应（302 语言跳转、404 不算页面访问）；
 *   - 路径必须命中 /en|/ko 的页面形态（末段无 `.`，排除 /_astro/ 等静态资源——
 *     它们带扩展名天然被排除；/api/*、/download 不在语言前缀下，同理排除）；
 *   - UA 判爬虫：照记为 bot=true，报表默认排除，数据留着核对口径；
 *   - 事件里不存 IP（privacy.md 承诺过），occurred_at 取日志时间戳。
 */

export interface CaddyLogEntry {
  ts?: number | string;
  status?: number;
  request?: {
    method?: string;
    uri?: string;
    host?: string;
    headers?: Record<string, string[] | undefined>;
  };
  user_agent?: string;
}

function headerOf(entry: CaddyLogEntry, name: string): string | undefined {
  const headers = entry.request?.headers ?? {};
  const raw = headers[name] ?? headers[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value !== '' ? value : undefined;
}

function occurredAtOf(ts: number | string | undefined): Date {
  if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
    // Caddy 默认输出 unix 秒（浮点）。兼容毫秒级误写：超过 1e12 视为毫秒。
    return new Date(ts > 1e12 ? ts : ts * 1000);
  }
  if (typeof ts === 'string' && ts !== '') {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** 页面形态：/en、/ko、/en/skills…… 末段不含 `.`（静态资源天然出局）。 */
export function isPagePath(path: string): boolean {
  if (path === '/' || !path.startsWith('/')) return false;
  if (!/^\/(en|ko)(\/|$)/.test(path)) return false;
  const last = path.split('/').pop() ?? '';
  return !last.includes('.');
}

export function pageViewOf(entry: CaddyLogEntry): FunnelEventInput | undefined {
  const method = entry.request?.method;
  if (method !== 'GET') return undefined;
  if (entry.status !== 200) return undefined;

  const uri = entry.request?.uri ?? '';
  const queryAt = uri.indexOf('?');
  const rawPath = queryAt === -1 ? uri : uri.slice(0, queryAt);
  let path = rawPath;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    // 半截百分号转义之类：按原样处理，isPagePath 会过滤掉畸形路径。
  }
  if (!isPagePath(path)) return undefined;

  const ua = entry.user_agent ?? headerOf(entry, 'User-Agent');
  return {
    step: 'page_view',
    occurredAt: occurredAtOf(entry.ts),
    lang: path.startsWith('/ko') ? 'ko' : 'en',
    userAgent: ua,
    referrer: headerOf(entry, 'Referer'),
    bot: isBotUa(ua),
    meta: { path },
  };
}
