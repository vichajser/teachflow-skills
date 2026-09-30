import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Pool } from 'pg';
import type { ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { RequestContext } from '../src/http/router.ts';
import {
  checkoutStartRoute,
  checkoutReturnRoute,
  type CheckoutRouteDeps,
} from '../src/routes/checkout.ts';
import type { FunnelEventInput, FunnelSink } from '../src/funnel/events.ts';

const CHECKOUT_URL = 'https://buy.polar.sh/polar_cl_test';

function fakeSink() {
  const events: FunnelEventInput[] = [];
  const sink: FunnelSink = {
    async record(evt) {
      events.push(evt);
    },
    async recordCheckoutOpenOnce(evt) {
      events.push(evt);
      return true;
    },
  };
  return { sink, events };
}

function fakeRes() {
  const state = { status: 0, location: '', headers: {} as Record<string, string | string[]> };
  const res = {
    writeHead(status: number, headers: Record<string, string | string[]> = {}) {
      state.status = status;
      state.headers = headers;
      state.location = (headers.location as string) ?? '';
    },
    end() {},
  } as unknown as ServerResponse;
  return { res, state };
}

function ctxOf(
  url: string,
  res: ServerResponse,
  headers: Record<string, string> = {},
): RequestContext {
  const req = Readable.from([]) as unknown as RequestContext['req'];
  Object.assign(req, { method: 'GET', url, headers });
  return { req, res, url: new URL(url, 'https://tryteachflow.com'), params: {}, clientIp: '127.0.0.1' };
}

function depsOf(over: Partial<CheckoutRouteDeps> = {}): CheckoutRouteDeps {
  const { sink } = fakeSink();
  const pool = { async query() { return { rows: [], rowCount: 0 }; } } as unknown as Pool;
  return {
    pool,
    funnel: sink,
    checkoutUrl: CHECKOUT_URL,
    publicBaseUrl: 'https://tryteachflow.com',
    polar: null,
    ...over,
  };
}

describe('GET /api/checkout/start', () => {
  it('记录 checkout_click 后 302 到静态结账链接（无 Polar 会话模式）', async () => {
    const { sink, events } = fakeSink();
    const deps = depsOf({ funnel: sink });
    const { res, state } = fakeRes();

    await checkoutStartRoute(deps)(ctxOf('/api/checkout/start?src=hero&lang=ko', res, {
      'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/129',
    }));

    expect(state.status).toBe(302);
    expect(state.location).toBe(CHECKOUT_URL);
    expect(state.headers['cache-control']).toBe('no-store');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ step: 'checkout_click', src: 'hero', lang: 'ko', bot: false });
    expect(events[0]!.meta).toEqual({ mode: 'link' });
  });

  it('未登记的 src 归一为 other，缺 lang 默认 en', async () => {
    const { sink, events } = fakeSink();
    const { res } = fakeRes();
    await checkoutStartRoute(depsOf({ funnel: sink }))(ctxOf('/api/checkout/start?src=wherever', res));
    expect(events[0]).toMatchObject({ src: 'other', lang: 'en' });
  });

  it('爬虫 UA 照记但打 bot 标记', async () => {
    const { sink, events } = fakeSink();
    const { res } = fakeRes();
    await checkoutStartRoute(depsOf({ funnel: sink }))(ctxOf('/api/checkout/start?src=hero', res, {
      'user-agent': 'Googlebot/2.1',
    }));
    expect(events[0]!.bot).toBe(true);
  });

  it('Polar 会话模式：建会话成功则跳会话 URL，事件带 checkout_id 与 vid', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'co_123', url: 'https://buy.polar.sh/c/co_123' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { sink, events } = fakeSink();
    const deps = depsOf({
      funnel: sink,
      polar: { token: 'pat_x', productPriceId: 'price_x', apiBase: 'https://api.polar.sh' },
    });
    const { res, state } = fakeRes();
    await checkoutStartRoute(deps)(
      ctxOf('/api/checkout/start?src=cta&lang=en', res, { 'user-agent': 'Mozilla/5.0 (Macintosh)' }),
    );

    expect(state.location).toBe('https://buy.polar.sh/c/co_123');
    expect(events[0]).toMatchObject({ checkoutId: 'co_123', src: 'cta', lang: 'en' });
    expect(events[0]!.vid).toMatch(/^anon-|^[0-9a-f-]{36}$/);
    expect(events[0]!.meta).toEqual({ mode: 'session' });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.metadata).toMatchObject({ src: 'cta', lang: 'en' });
    expect(body.success_url).toContain('/api/checkout/return?checkout_id={CHECKOUT_ID}&lang=en');
  });

  it('Polar 建会话失败：回退静态链接，事件降级为 link 模式', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));

    const { sink, events } = fakeSink();
    const deps = depsOf({
      funnel: sink,
      polar: { token: 'pat_x', productPriceId: 'price_x', apiBase: 'https://api.polar.sh' },
    });
    const { res, state } = fakeRes();
    await checkoutStartRoute(deps)(
      ctxOf('/api/checkout/start?src=hero', res, { 'user-agent': 'Mozilla/5.0 (Macintosh)' }),
    );

    expect(state.status).toBe(302);
    expect(state.location).toBe(CHECKOUT_URL);
    expect(events[0]).toMatchObject({ meta: { mode: 'link' } });
    expect(events[0]!.checkoutId).toBeUndefined();
    expect(events[0]!.vid).toBeUndefined();
  });
});

describe('GET /api/checkout/return', () => {
  it('记录 success_return 后 302 到对应语言的成功页', async () => {
    const { sink, events } = fakeSink();
    const { res, state } = fakeRes();
    await checkoutReturnRoute(depsOf({ funnel: sink }))(
      ctxOf('/api/checkout/return?checkout_id=co_9&lang=ko', res),
    );
    expect(state.status).toBe(302);
    expect(state.location).toBe('/ko/buy/success?checkout_id=co_9');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ step: 'success_return', checkoutId: 'co_9', lang: 'ko' });
  });

  it('无 lang 时从历史事件里找（静态链接模式的语言兜底）', async () => {
    const pool = {
      async query() {
        return { rows: [{ lang: 'ko', vid: 'v-7' }], rowCount: 1 };
      },
    } as unknown as Pool;
    const { sink, events } = fakeSink();
    const { res, state } = fakeRes();
    await checkoutReturnRoute(depsOf({ pool, funnel: sink }))(
      ctxOf('/api/checkout/return?checkout_id=co_9', res),
    );
    expect(state.location).toBe('/ko/buy/success?checkout_id=co_9');
    expect(events[0]!.vid).toBe('v-7');
  });

  it('缺 checkout_id：不记事件，302 到默认成功页', async () => {
    const { sink, events } = fakeSink();
    const { res, state } = fakeRes();
    await checkoutReturnRoute(depsOf({ funnel: sink }))(ctxOf('/api/checkout/return', res));
    expect(state.location).toBe('/en/buy/success');
    expect(events).toHaveLength(0);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
