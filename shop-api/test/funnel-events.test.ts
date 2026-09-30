import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import {
  isBotUa,
  createFunnelSink,
  insertFunnelEvents,
  type FunnelEventInput,
} from '../src/funnel/events.ts';
import { pageViewOf, isPagePath, type CaddyLogEntry } from '../src/funnel/caddy-log.ts';
import type { PosthogMirror, PosthogCapture } from '../src/funnel/posthog.ts';

describe('isBotUa', () => {
  it('认出常见爬虫与无 UA 请求', () => {
    expect(isBotUa('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBotUa('Mozilla/5.0 (Macintosh) Chrome/129 Safari')).toBe(false);
    expect(isBotUa('curl/8.4.0')).toBe(true);
    expect(isBotUa(undefined)).toBe(true);
    expect(isBotUa('')).toBe(true);
  });
});

describe('isPagePath', () => {
  it('只放行语言前缀下的页面形态', () => {
    expect(isPagePath('/en')).toBe(true);
    expect(isPagePath('/ko/samples')).toBe(true);
    expect(isPagePath('/en/buy/success')).toBe(true);
    expect(isPagePath('/')).toBe(false);
    expect(isPagePath('/api/checkout/start')).toBe(false);
    expect(isPagePath('/en/_astro/app.abc.css')).toBe(false);
    expect(isPagePath('/fr')).toBe(false);
    expect(isPagePath('/en/logo.png')).toBe(false);
  });
});

describe('pageViewOf', () => {
  const base: CaddyLogEntry = {
    ts: 1760000000,
    status: 200,
    request: { method: 'GET', uri: '/en/skills', headers: {} },
    user_agent: 'Mozilla/5.0 (Macintosh) Chrome/129',
  };

  it('把一条页面命中翻成 page_view 事件，ko 前缀与路径进 meta', () => {
    const evt = pageViewOf({ ...base, request: { ...base.request!, uri: '/ko?utm=x' } });
    expect(evt?.step).toBe('page_view');
    expect(evt?.lang).toBe('ko');
    expect(evt?.meta).toEqual({ path: '/ko' });
    expect(evt?.bot).toBe(false);
    expect(evt?.occurredAt?.getTime()).toBe(1760000000 * 1000);
  });

  it('非 GET、非 200、非页面路径一律不产事件', () => {
    expect(pageViewOf({ ...base, status: 302 })).toBeUndefined();
    expect(pageViewOf({ ...base, status: 404 })).toBeUndefined();
    expect(pageViewOf({ ...base, request: { ...base.request!, method: 'HEAD' } })).toBeUndefined();
    expect(
      pageViewOf({ ...base, request: { ...base.request!, uri: '/_astro/app.js' } }),
    ).toBeUndefined();
  });

  it('爬虫照记但打上 bot 标记，Referer 从请求头取', () => {
    const evt = pageViewOf({
      ...base,
      user_agent: undefined,
      request: {
        ...base.request!,
        headers: { 'User-Agent': ['Googlebot/2.1'], Referer: ['https://google.com/'] },
      },
    });
    expect(evt?.bot).toBe(true);
    expect(evt?.userAgent).toBe('Googlebot/2.1');
    expect(evt?.referrer).toBe('https://google.com/');
  });
});

interface Captured {
  sql: string;
  params: unknown[];
  rowCount: number;
}

function capturePool(overwrites: Array<{ match: (sql: string) => boolean; rowCount: number }> = []) {
  const calls: Captured[] = [];
  const pool = {
    async query(sql: string, params: unknown[] = []) {
      // 多行批量插入的行数按参数组数算，单条插入恒 1——假库也要像真库一样报行数。
      const rowCount =
        params.length > 13 && sql.startsWith('INSERT INTO funnel_events')
          ? params.length / 13
          : 1;
      const override = overwrites.find((o) => o.match(sql));
      const final = override?.rowCount ?? rowCount;
      calls.push({ sql, params, rowCount: final });
      return { rows: [], rowCount: final };
    },
  } as unknown as Pool;
  return { pool, calls };
}

function fakeMirror() {
  const captured: PosthogCapture[] = [];
  const mirror: PosthogMirror = {
    capture(event, cap) {
      captured.push({ event, ...cap });
    },
    async flushNow() {},
  };
  return { mirror, captured };
}

describe('createFunnelSink', () => {
  it('record 落 13 列 INSERT，并镜像非 bot 事件', async () => {
    const { pool, calls: inserts } = capturePool();
    const { mirror, captured } = fakeMirror();
    const sink = createFunnelSink({ pool, mirror });

    await sink.record({ step: 'checkout_click', src: 'hero', lang: 'en', vid: 'v1', bot: false });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.sql).toContain('INSERT INTO funnel_events');
    expect(inserts[0]!.params).toHaveLength(13);
    expect(inserts[0]!.params[1]).toBe('checkout_click');
    expect(captured).toHaveLength(1);
    expect(captured[0]!.event).toBe('checkout_click');
    expect(captured[0]!.distinctId).toBe('v1');
  });

  it('bot 事件落库但不进镜像；落库抛错也不向上传播', async () => {
    const failing = { query: async () => Promise.reject(new Error('db down')) } as unknown as Pool;
    const { mirror, captured } = fakeMirror();
    const sink = createFunnelSink({ pool: failing, mirror });

    await sink.record({ step: 'page_view', bot: true });
    expect(captured).toHaveLength(0);

    await sink.record({ step: 'page_view', bot: false });
    expect(captured).toHaveLength(0); // 落库失败时镜像也不发——数据一致性优先
  });

  it('recordCheckoutOpenOnce 命中去重时返回 false 且不镜像', async () => {
    const { pool, calls: inserts } = capturePool([
      { match: (sql) => sql.includes('NOT EXISTS'), rowCount: 0 },
    ]);
    const { mirror, captured } = fakeMirror();
    const sink = createFunnelSink({ pool, mirror });

    const wrote = await sink.recordCheckoutOpenOnce({ step: 'checkout_open', checkoutId: 'co_1' });
    expect(wrote).toBe(false);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.sql).toContain("event = 'checkout_open'");
    expect(captured).toHaveLength(0);
  });
});

describe('insertFunnelEvents', () => {
  it('多事件合并成一次多行 INSERT', async () => {
    const { pool, calls: inserts } = capturePool();
    const events: FunnelEventInput[] = [
      { step: 'page_view', lang: 'en', meta: { path: '/en' } },
      { step: 'page_view', lang: 'ko', meta: { path: '/ko' } },
      { step: 'page_view', lang: 'en', meta: { path: '/en/buy' } },
    ];
    const written = await insertFunnelEvents(pool, events);
    expect(written).toBe(3);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.params).toHaveLength(3 * 13);
    expect(inserts[0]!.sql.match(/\(/g)!.length).toBeGreaterThanOrEqual(3);
  });
});
