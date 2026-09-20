import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { webhookRoute, type WebhookDeps } from '../src/routes/webhooks.ts';
import { polarAdapter } from '../src/mor/polar.ts';

const SECRET = 'whsec_' + Buffer.from('polar-webhook-secret-value').toString('base64');
const NOW = Date.parse('2026-09-20T12:00:00Z');
const TS = String(Math.floor(NOW / 1000));
const SKILLS = ['lesson-workflow', 'feedback-writer', 'rubric-builder'];

function sign(id: string, body: string): string {
  const key = Buffer.from(SECRET.slice(6), 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${TS}.${body}`).digest('base64')}`;
}

interface DbState {
  events: Map<string, unknown>;
  orders: Map<string, { id: string; status: string; email: string; locale: string }>;
  entitlements: Set<string>;
}

function clone(s: DbState): DbState {
  return { events: new Map(s.events), orders: new Map(s.orders), entitlements: new Set(s.entitlements) };
}

/** 内存版 Postgres：只认 db/orders.ts 发出的语句，BEGIN/ROLLBACK 真的会回滚。 */
function fakeDb() {
  let live: DbState = { events: new Map(), orders: new Map(), entitlements: new Set() };
  let snapshot: DbState | null = null;
  let open = 0;
  let released = 0;

  async function query(sql: string, params: unknown[] = []) {
    const text = sql.trim();
    if (text === 'BEGIN') {
      snapshot = clone(live);
      return { rows: [], rowCount: 0 };
    }
    if (text === 'COMMIT') {
      snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (text === 'ROLLBACK') {
      if (snapshot) live = snapshot;
      snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (text.startsWith('INSERT INTO webhook_events')) {
      const key = `${params[0]}:${params[1]}`;
      if (live.events.has(key)) return { rows: [], rowCount: 0 };
      live.events.set(key, JSON.parse(params[2] as string));
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith('INSERT INTO orders')) {
      const id = params[0] as string;
      if (live.orders.has(id)) return { rows: [], rowCount: 0 };
      live.orders.set(id, {
        id,
        status: 'paid',
        email: params[2] as string,
        locale: params[5] as string,
      });
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith('INSERT INTO entitlements')) {
      let added = 0;
      for (const skill of params[1] as string[]) {
        const key = `${params[0]}:${skill}`;
        if (!live.entitlements.has(key)) {
          live.entitlements.add(key);
          added += 1;
        }
      }
      return { rows: [], rowCount: added };
    }
    if (text.startsWith('UPDATE orders SET status')) {
      const order = live.orders.get(params[0] as string);
      if (!order) return { rows: [], rowCount: 0 };
      order.status = params[1] as string;
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`未预期的 SQL：${text}`);
  }

  const pool = {
    async connect() {
      open += 1;
      return {
        query,
        release() {
          released += 1;
        },
      };
    },
    query,
  } as unknown as Pool;

  return {
    pool,
    get state() {
      return live;
    },
    get leaked() {
      return open - released;
    },
  };
}

function fakeRes() {
  const state = { status: 0, body: '' };
  const res = {
    writeHead(status: number) {
      state.status = status;
    },
    end(chunk?: string) {
      state.body = chunk ?? '';
    },
  } as unknown as ServerResponse;
  return { res, state };
}

const PAID = {
  type: 'order.paid',
  data: {
    id: 'ord_abc',
    currency: 'usd',
    total_amount: 2990,
    customer: { email: 'teacher@example.com' },
    metadata: { locale: 'ko' },
  },
};

interface DeliverOptions {
  eventId?: string;
  headers?: Record<string, string>;
  deps?: Partial<WebhookDeps>;
}

async function deliver(
  db: ReturnType<typeof fakeDb>,
  payload: unknown,
  opts: DeliverOptions = {},
) {
  const body = JSON.stringify(payload);
  const eventId = opts.eventId ?? 'evt_001';
  const jobs: { job: string; data: Record<string, unknown> }[] = [];

  const deps: WebhookDeps = {
    adapter: polarAdapter,
    secret: SECRET,
    pool: db.pool,
    skillIds: SKILLS,
    now: () => NOW,
    async enqueue(job, data) {
      jobs.push({ job, data });
    },
    ...(opts.deps ?? {}),
  };

  const headers: Record<string, string> = opts.headers ?? {
    'webhook-id': eventId,
    'webhook-timestamp': TS,
    'webhook-signature': sign(eventId, body),
    'content-type': 'application/json',
  };

  const req = Readable.from([Buffer.from(body, 'utf8')]) as unknown as IncomingMessage;
  Object.assign(req, { method: 'POST', url: '/api/webhooks/polar', headers });

  const { res, state } = fakeRes();
  await webhookRoute(deps)({
    req,
    res,
    url: new URL('https://tryteachflow.com/api/webhooks/polar'),
    params: {},
    clientIp: '127.0.0.1',
  });
  return { status: state.status, json: state.body ? JSON.parse(state.body) : null, jobs };
}

describe('验签把关', () => {
  it('签名不对时 401，且不碰数据库', async () => {
    const db = fakeDb();
    const { status } = await deliver(db, PAID, {
      headers: {
        'webhook-id': 'evt_001',
        'webhook-timestamp': TS,
        'webhook-signature': 'v1,AAAA',
      },
    });
    expect(status).toBe(401);
    expect(db.state.events.size).toBe(0);
    expect(db.state.orders.size).toBe(0);
  });

  it('缺头时 401', async () => {
    const db = fakeDb();
    const { status, json } = await deliver(db, PAID, { headers: {} });
    expect(status).toBe(401);
    expect(json).toEqual({ error: 'missing_headers' });
  });

  it('时间戳过期时 401', async () => {
    const db = fakeDb();
    const body = JSON.stringify(PAID);
    const stale = String(Math.floor(NOW / 1000) - 3600);
    const key = Buffer.from(SECRET.slice(6), 'base64');
    const { status, json } = await deliver(db, PAID, {
      headers: {
        'webhook-id': 'evt_001',
        'webhook-timestamp': stale,
        'webhook-signature': `v1,${createHmac('sha256', key).update(`evt_001.${stale}.${body}`).digest('base64')}`,
      },
    });
    expect(status).toBe(401);
    expect(json).toEqual({ error: 'stale_timestamp' });
  });

  it('签名对但内容读不懂时 400——重投也没用，别再投了', async () => {
    const db = fakeDb();
    const body = '{not json';
    const key = Buffer.from(SECRET.slice(6), 'base64');
    const req = Readable.from([Buffer.from(body)]) as unknown as IncomingMessage;
    Object.assign(req, {
      method: 'POST',
      url: '/api/webhooks/polar',
      headers: {
        'webhook-id': 'evt_001',
        'webhook-timestamp': TS,
        'webhook-signature': `v1,${createHmac('sha256', key).update(`evt_001.${TS}.${body}`).digest('base64')}`,
      },
    });
    const { res, state } = fakeRes();
    await webhookRoute({
      adapter: polarAdapter,
      secret: SECRET,
      pool: db.pool,
      skillIds: SKILLS,
      now: () => NOW,
      async enqueue() {},
    })({
      req,
      res,
      url: new URL('https://tryteachflow.com/api/webhooks/polar'),
      params: {},
      clientIp: '127.0.0.1',
    });
    expect(state.status).toBe(400);
  });
});

describe('付款入账', () => {
  it('建订单并一次性写齐整个捆绑包的 entitlements', async () => {
    const db = fakeDb();
    const { status, json } = await deliver(db, PAID);
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, result: 'applied' });
    expect(db.state.orders.get('ord_abc')).toMatchObject({
      status: 'paid',
      email: 'teacher@example.com',
      locale: 'ko',
    });
    expect([...db.state.entitlements].sort()).toEqual(
      SKILLS.map((s) => `ord_abc:${s}`).sort(),
    );
  });

  it('投递交付邮件任务', async () => {
    const db = fakeDb();
    const { jobs } = await deliver(db, PAID);
    expect(jobs).toEqual([{ job: 'send-delivery', data: { orderId: 'ord_abc' } }]);
  });

  it('原始 payload 存档', async () => {
    const db = fakeDb();
    await deliver(db, PAID);
    expect(db.state.events.get('polar:evt_001')).toEqual(PAID);
  });

  it('同一 event_id 重投不会建出第二个订单，也不会再发一次邮件', async () => {
    const db = fakeDb();
    await deliver(db, PAID);
    const second = await deliver(db, PAID);
    expect(second.status).toBe(200);
    expect(second.json).toEqual({ ok: true, result: 'duplicate' });
    expect(db.state.orders.size).toBe(1);
    expect(db.state.entitlements.size).toBe(SKILLS.length);
    expect(second.jobs).toEqual([]);
  });

  it('换 event_id 但同一订单号时，订单与权利都不重复', async () => {
    const db = fakeDb();
    await deliver(db, PAID);
    const again = await deliver(db, PAID, { eventId: 'evt_002' });
    expect(again.json).toEqual({ ok: true, result: 'applied' });
    expect(db.state.orders.size).toBe(1);
    expect(db.state.entitlements.size).toBe(SKILLS.length);
  });

  it('发信任务投递失败仍回 200，订单保留并如实标注没排上队', async () => {
    const db = fakeDb();
    const { status, json } = await deliver(db, PAID, {
      deps: {
        async enqueue() {
          throw new Error('pg-boss 不可用');
        },
      },
    });
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, result: 'applied', mail: 'not_queued' });
    expect(db.state.orders.size).toBe(1);
  });
});

describe('退款与争议', () => {
  it('退款把订单翻成 refunded', async () => {
    const db = fakeDb();
    await deliver(db, PAID);
    const out = await deliver(db, { type: 'order.refunded', data: { id: 'ord_abc' } }, {
      eventId: 'evt_002',
    });
    expect(out.json).toEqual({ ok: true, result: 'applied' });
    expect(db.state.orders.get('ord_abc')!.status).toBe('refunded');
  });

  it('争议把订单翻成 chargeback', async () => {
    const db = fakeDb();
    await deliver(db, PAID);
    await deliver(db, { type: 'dispute.created', data: { order_id: 'ord_abc' } }, {
      eventId: 'evt_002',
    });
    expect(db.state.orders.get('ord_abc')!.status).toBe('chargeback');
  });

  it('翻转不投递发信任务', async () => {
    const db = fakeDb();
    await deliver(db, PAID);
    const out = await deliver(db, { type: 'order.refunded', data: { id: 'ord_abc' } }, {
      eventId: 'evt_002',
    });
    expect(out.jobs).toEqual([]);
  });

  it('订单不存在时回 409 并整体回滚——供应商重投，乱序投递能自愈', async () => {
    const db = fakeDb();
    const out = await deliver(db, { type: 'order.refunded', data: { id: 'ord_abc' } });
    expect(out.status).toBe(409);
    expect(db.state.events.size).toBe(0);

    // 付款事件随后到达，同一个退款事件重投即可生效。
    await deliver(db, PAID, { eventId: 'evt_paid' });
    const retry = await deliver(db, { type: 'order.refunded', data: { id: 'ord_abc' } });
    expect(retry.json).toEqual({ ok: true, result: 'applied' });
    expect(db.state.orders.get('ord_abc')!.status).toBe('refunded');
  });
});

describe('不关心的事件', () => {
  it('登记去重但不建订单', async () => {
    const db = fakeDb();
    const out = await deliver(db, { type: 'subscription.created', data: { id: 'sub_1' } });
    expect(out.json).toEqual({ ok: true, result: 'ignored' });
    expect(db.state.events.size).toBe(1);
    expect(db.state.orders.size).toBe(0);
    expect(out.jobs).toEqual([]);
  });

  it('缺关键字段的付款事件不会建出残缺订单', async () => {
    const db = fakeDb();
    const out = await deliver(db, { type: 'order.paid', data: { id: 'ord_x', currency: 'usd' } });
    expect(out.json).toEqual({ ok: true, result: 'ignored' });
    expect(db.state.orders.size).toBe(0);
  });
});

describe('连接管理', () => {
  it('成功、回滚、重投三条路径都归还连接', async () => {
    const db = fakeDb();
    await deliver(db, PAID);
    await deliver(db, PAID);
    await deliver(db, { type: 'order.refunded', data: { id: 'nope' } }, { eventId: 'evt_003' });
    expect(db.leaked).toBe(0);
  });
});
