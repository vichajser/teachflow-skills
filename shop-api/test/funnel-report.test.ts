import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import type { ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { RequestContext } from '../src/http/router.ts';
import { funnelReportRoute } from '../src/routes/funnel-report.ts';
import { buildFunnelReport } from '../src/funnel/report.ts';

/**
 * 报表查询是五条独立的 GROUP BY。假库按 SQL 特征分发表——顺序无关，
 * 断言只看最终换算出的 steps 序列与转化率。
 */
function cannedPool() {
  const pool = {
    async query(sql: string) {
      if (sql.includes('AND bot = true')) {
        return {
          rows: [{ event: 'page_view', n: 900 }],
          rowCount: 1,
        };
      }
      if (sql.includes('lang IS NOT NULL')) {
        return {
          rows: [
            { event: 'page_view', dim: 'en', n: 150 },
            { event: 'page_view', dim: 'ko', n: 50 },
            { event: 'checkout_click', dim: 'en', n: 30 },
            { event: 'checkout_click', dim: 'ko', n: 10 },
          ],
          rowCount: 4,
        };
      }
      if (sql.includes('src IS NOT NULL')) {
        return {
          rows: [
            { event: 'checkout_click', dim: 'hero', n: 20 },
            { event: 'checkout_click', dim: 'header', n: 15 },
            { event: 'checkout_click', dim: 'cta', n: 5 },
          ],
          rowCount: 3,
        };
      }
      if (sql.includes("meta->>'path'")) {
        return {
          rows: [{ path: '/en', n: 120 }, { path: '/ko/samples', n: 30 }],
          rowCount: 2,
        };
      }
      // 人工计数主查询
      return {
        rows: [
          { event: 'page_view', n: 200 },
          { event: 'checkout_click', n: 40 },
          { event: 'checkout_open', n: 10 },
          { event: 'order_paid', n: 5 },
          { event: 'success_return', n: 4 },
        ],
        rowCount: 5,
      };
    },
  } as unknown as Pool;
  return pool;
}

describe('buildFunnelReport', () => {
  it('按固定顺序输出五步，并算出逐步与总体转化率', async () => {
    const report = await buildFunnelReport(cannedPool(), 30);

    expect(report.steps.map((s) => s.step)).toEqual([
      'page_view', 'checkout_click', 'checkout_open', 'order_paid', 'success_return',
    ]);
    const [pv, click, open, paid, ret] = report.steps;
    expect(pv).toMatchObject({ count: 200, fromPrev: null, fromEntry: 100 });
    expect(click).toMatchObject({ count: 40, fromPrev: 20, fromEntry: 20 });
    expect(open).toMatchObject({ count: 10, fromPrev: 25, fromEntry: 5 });
    expect(paid).toMatchObject({ count: 5, fromPrev: 50, fromEntry: 2.5 });
    expect(ret).toMatchObject({ count: 4, fromPrev: 80, fromEntry: 2 });
    expect(report.botsExcluded['page_view']).toBe(900);
    expect(report.bySrc['checkout_click']).toEqual({ hero: 20, header: 15, cta: 5 });
    expect(report.topPages[0]).toEqual({ path: '/en', count: 120 });
  });
});

function ctxOf(
  url: string,
  res: ServerResponse,
  headers: Record<string, string> = {},
): RequestContext {
  const req = Readable.from([]) as unknown as RequestContext['req'];
  Object.assign(req, { method: 'GET', url, headers });
  return {
    req,
    res,
    url: new URL(url, 'https://tryteachflow.com'),
    params: {},
    clientIp: '127.0.0.1',
  };
}

function fakeRes() {
  const state = { status: 0, contentType: '', body: '' };
  const res = {
    writeHead(status: number, headers: Record<string, string> = {}) {
      state.status = status;
      state.contentType = headers['content-type'] ?? '';
    },
    end(chunk?: string) {
      state.body = chunk ?? '';
    },
  } as unknown as ServerResponse;
  return { res, state };
}

describe('GET /api/admin/funnel', () => {
  it('无 Bearer 401', async () => {
    const { res, state } = fakeRes();
    await funnelReportRoute({ adminToken: 'secret', pool: cannedPool() })(ctxOf('/api/admin/funnel', res));
    expect(state.status).toBe(401);
  });

  it('JSON 形态返回报表对象', async () => {
    const { res, state } = fakeRes();
    await funnelReportRoute({ adminToken: 'secret', pool: cannedPool() })(
      ctxOf('/api/admin/funnel?days=7', res, { authorization: 'Bearer secret' }),
    );
    expect(state.status).toBe(200);
    expect(state.contentType).toContain('application/json');
    const parsed = JSON.parse(state.body);
    expect(parsed.days).toBe(7);
    expect(parsed.steps).toHaveLength(5);
  });

  it('HTML 形态渲染步骤表并转义动态值', async () => {
    const pool = {
      async query(sql: string) {
        if (sql.includes("meta->>'path'")) return { rows: [{ path: '/en<script>', n: 3 }], rowCount: 1 };
        if (sql.includes('AND bot = true')) return { rows: [], rowCount: 0 };
        if (sql.includes('IS NOT NULL')) return { rows: [], rowCount: 0 };
        return { rows: [{ event: 'page_view', n: 3 }], rowCount: 1 };
      },
    } as unknown as Pool;
    const { res, state } = fakeRes();
    await funnelReportRoute({ adminToken: 'secret', pool })(
      ctxOf('/api/admin/funnel?format=html', res, { authorization: 'Bearer secret' }),
    );
    expect(state.status).toBe(200);
    expect(state.contentType).toContain('text/html');
    expect(state.body).toContain('① 进入页面');
    expect(state.body).toContain('&lt;script&gt;');
    expect(state.body).not.toContain('<script>');
  });
});
