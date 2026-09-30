import type { Pool } from 'pg';
import type { PosthogMirror } from './posthog.ts';

/**
 * 漏斗五步。顺序就是报表的顺序：进入页面 → 点击购买 → 到达支付页 →
 * 支付成功 → 回跳站内。见 docs/2026-09-29-funnel-analytics-plan.md。
 */
export const FUNNEL_STEPS = [
  'page_view',
  'checkout_click',
  'checkout_open',
  'order_paid',
  'success_return',
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export interface FunnelEventInput {
  step: FunnelStep;
  occurredAt?: Date;
  src?: string;
  lang?: 'en' | 'ko';
  vid?: string;
  checkoutId?: string;
  orderId?: string;
  amountCents?: number;
  currency?: string;
  userAgent?: string;
  referrer?: string;
  bot?: boolean;
  meta?: Record<string, unknown>;
}

export type FunnelRecorder = (evt: FunnelEventInput) => Promise<void>;

export interface FunnelSink {
  /** 落一条事件（含可选镜像）。永不抛错——统计挂了不能影响购买主链路。 */
  record: FunnelRecorder;
  /** checkout_open 专用：按 checkout_id 去重，返回是否真的写入（Polar 会重投）。 */
  recordCheckoutOpenOnce: (evt: FunnelEventInput) => Promise<boolean>;
}

/** 站内按钮允许上报的来源标注；未登记者由路由归一为 'other'。 */
export const CHECKOUT_SOURCES = [
  'header',
  'hero',
  'home-bottom',
  'cta',
  'buy-page',
  'other',
] as const;

const UA_BOT = new RegExp(
  [
    'bot', 'crawl', 'spider', 'slurp', 'bingpreview', 'facebookexternalhit',
    'headless', 'lighthouse', 'wget', 'curl', 'python-requests', 'libwww',
    'go-http-client', 'monitor', 'uptime', 'petalbot', 'bytespider',
    'semrush', 'ahrefs', 'mj12', 'dotbot',
  ].join('|'),
  'i',
);

/** 粗粒度爬虫判定。报表默认排除 bot=true 的事件；判定宁松勿紧——漏标的爬虫会污染第①步。 */
export function isBotUa(ua: string | undefined): boolean {
  if (!ua) return true; // 没有 UA 的请求几乎不可能是真人的页面访问
  return UA_BOT.test(ua);
}

const columns = [
  'occurred_at', 'event', 'src', 'lang', 'vid', 'checkout_id', 'order_id',
  'amount_cents', 'currency', 'user_agent', 'referrer', 'bot', 'meta',
] as const;

function valuesOf(evt: FunnelEventInput): unknown[] {
  return [
    evt.occurredAt ?? new Date(),
    evt.step,
    evt.src ?? null,
    evt.lang ?? null,
    evt.vid ?? null,
    evt.checkoutId ?? null,
    evt.orderId ?? null,
    evt.amountCents ?? null,
    evt.currency ?? null,
    evt.userAgent?.slice(0, 512) ?? null,
    evt.referrer?.slice(0, 512) ?? null,
    evt.bot ?? false,
    JSON.stringify(evt.meta ?? {}),
  ];
}

function mirrorEvent(mirror: PosthogMirror | null, evt: FunnelEventInput): void {
  if (!mirror || evt.bot) return;
  mirror.capture(evt.step, {
    // 只有 vid 事件能跨步骤关联；其余各自是独立匿名 id。计数与趋势不受影响，
    // person 级漏斗只在启用 Polar API 建会话后对 ②→⑤ 成立——这是无 cookie
    // 方案的既定边界，不是缺陷。
    distinctId: evt.vid ?? `anon-${evt.step}-${crypto.randomUUID()}`,
    properties: {
      step: evt.step,
      src: evt.src ?? null,
      lang: evt.lang ?? null,
      checkout_id: evt.checkoutId ?? null,
      order_id: evt.orderId ?? null,
      amount_cents: evt.amountCents ?? null,
      currency: evt.currency ?? null,
      path: (evt.meta?.path as string | undefined) ?? null,
      $lib: 'teachflow-shop-api',
    },
    timestamp: (evt.occurredAt ?? new Date()).toISOString(),
  });
}

export function createFunnelSink(deps: { pool: Pool; mirror?: PosthogMirror | null }): FunnelSink {
  const mirror = deps.mirror ?? null;

  async function insert(evt: FunnelEventInput, once: boolean): Promise<boolean> {
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const sql = once
      ? `INSERT INTO funnel_events (${columns.join(', ')})
         SELECT ${placeholders}
          WHERE NOT EXISTS (
            SELECT 1 FROM funnel_events WHERE event = 'checkout_open' AND checkout_id = $6
          )`
      : `INSERT INTO funnel_events (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await deps.pool.query(sql, valuesOf(evt));
    return (result.rowCount ?? 0) > 0;
  }
  return {
    async record(evt) {
      try {
        await insert(evt, false);
        mirrorEvent(mirror, evt);
      } catch (err) {
        console.error('[funnel] 事件落库失败：', err instanceof Error ? err.message : err);
      }
    },

    async recordCheckoutOpenOnce(evt) {
      try {
        const wrote = await insert({ ...evt, step: 'checkout_open' }, true);
        if (wrote) mirrorEvent(mirror, { ...evt, step: 'checkout_open' });
        return wrote;
      } catch (err) {
        console.error('[funnel] checkout_open 落库失败：', err instanceof Error ? err.message : err);
        return false;
      }
    },
  };
}

const INSERT_BATCH = 500;

/**
 * 批量落事件（Caddy 日志摄取用）。列序与单条插入完全一致——同一张表两处
 * 写入路径，列序漂移会让事件悄悄写错列，所以这里直接复用 columns/valuesOf。
 * 返回写入行数。
 */
export async function insertFunnelEvents(pool: Pool, events: FunnelEventInput[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < events.length; i += INSERT_BATCH) {
    const slice = events.slice(i, i + INSERT_BATCH);
    const tuples = slice.map((_, j) => {
      const base = j * columns.length;
      return `(${columns.map((_, k) => `$${base + k + 1}`).join(', ')})`;
    });
    const params = slice.flatMap((evt) => valuesOf(evt));
    const result = await pool.query(
      `INSERT INTO funnel_events (${columns.join(', ')}) VALUES ${tuples.join(', ')}`,
      params,
    );
    written += result.rowCount ?? 0;
  }
  return written;
}
