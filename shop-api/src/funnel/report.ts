import type { Pool } from 'pg';
import { FUNNEL_STEPS, type FunnelStep } from './events.ts';

export interface FunnelStepCount {
  step: FunnelStep;
  count: number;
  /** 相对上一步的转化率；第一步为 null。 */
  fromPrev: number | null;
  /** 相对第一步（page_view）的总转化率；第一步为 100。 */
  fromEntry: number | null;
}

export interface FunnelReport {
  days: number;
  from: string;
  to: string;
  steps: FunnelStepCount[];
  /** 每步被爬虫规则排除的数量——用于判断第①步口径是否被污染。 */
  botsExcluded: Record<string, number>;
  byLang: Record<string, Record<string, number>>;
  bySrc: Record<string, Record<string, number>>;
  /** page_view 的按路径分布（前 15），meta->>'path'。 */
  topPages: { path: string; count: number }[];
}

interface CountRow {
  event: string;
  n: number;
}
interface DimRow {
  event: string;
  dim: string | null;
  n: number;
}
interface PageRow {
  path: string | null;
  n: number;
}

/**
 * 计数级漏斗报表。刻意不按 vid/session 关联——无 cookie 方案下①②与④本来
 * 就没有共同标识，计数口径反而口径一致（①②来自服务端，③④来自 Polar 侧）。
 */
export async function buildFunnelReport(pool: Pool, days: number): Promise<FunnelReport> {
  const window = [days];

  const [human, bots, langRows, srcRows, pageRows] = await Promise.all([
    pool.query<CountRow>(
      `SELECT event, count(*)::int AS n
         FROM funnel_events
        WHERE occurred_at >= now() - ($1::text || ' days')::interval AND bot = false
        GROUP BY event`,
      window,
    ),
    pool.query<CountRow>(
      `SELECT event, count(*)::int AS n
         FROM funnel_events
        WHERE occurred_at >= now() - ($1::text || ' days')::interval AND bot = true
        GROUP BY event`,
      window,
    ),
    pool.query<DimRow>(
      `SELECT event, lang::text AS dim, count(*)::int AS n
         FROM funnel_events
        WHERE occurred_at >= now() - ($1::text || ' days')::interval AND bot = false
          AND lang IS NOT NULL
        GROUP BY event, lang`,
      window,
    ),
    pool.query<DimRow>(
      `SELECT event, src AS dim, count(*)::int AS n
         FROM funnel_events
        WHERE occurred_at >= now() - ($1::text || ' days')::interval AND bot = false
          AND src IS NOT NULL
        GROUP BY event, src`,
      window,
    ),
    pool.query<PageRow>(
      `SELECT meta->>'path' AS path, count(*)::int AS n
         FROM funnel_events
        WHERE occurred_at >= now() - ($1::text || ' days')::interval AND bot = false
          AND event = 'page_view'
        GROUP BY meta->>'path'
        ORDER BY n DESC
        LIMIT 15`,
      window,
    ),
  ]);

  const counts = new Map(human.rows.map((r) => [r.event, Number(r.n)]));
  const entry = counts.get('page_view') ?? 0;

  const steps: FunnelStepCount[] = [];
  let prev: number | null = null;
  for (const step of FUNNEL_STEPS) {
    const count = counts.get(step) ?? 0;
    steps.push({
      step,
      count,
      fromPrev: prev === null || prev === 0 ? null : round2((count / prev) * 100),
      fromEntry: step === 'page_view' ? 100 : entry === 0 ? null : round2((count / entry) * 100),
    });
    prev = count;
  }

  const byDim = (rows: DimRow[]): Record<string, Record<string, number>> => {
    const out: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const key = r.dim ?? 'unknown';
      (out[r.event] ??= {})[key] = Number(r.n);
    }
    return out;
  };

  return {
    days,
    from: new Date(Date.now() - days * 86_400_000).toISOString(),
    to: new Date().toISOString(),
    steps,
    botsExcluded: Object.fromEntries(bots.rows.map((r) => [r.event, Number(r.n)])),
    byLang: byDim(langRows.rows),
    bySrc: byDim(srcRows.rows),
    topPages: pageRows.rows
      .filter((r): r is PageRow & { path: string } => typeof r.path === 'string')
      .map((r) => ({ path: r.path, count: Number(r.n) })),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
