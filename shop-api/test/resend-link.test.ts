import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { resendLinkRoute, type ResendLinkDeps } from '../src/routes/resend-link.ts';
import { verifyToken } from '../src/lib/token.ts';

const SECRET = 'resend-link-token-secret-at-least-32-bytes';
const NOW = new Date('2026-09-20T12:00:00Z');
const EMAIL = 'teacher@example.com';
const BASE = 'https://tryteachflow.com';

interface OrderSeed {
  id: string;
  locale: 'en' | 'ko';
  created_at: Date;
}

const ONE_ORDER: OrderSeed[] = [{ id: 'ord_abc', locale: 'ko', created_at: new Date('2026-09-01T09:30:00Z') }];

interface DbOptions {
  /** 邮箱 → 该邮箱名下的已付款订单，已按时间倒序。 */
  orders?: Record<string, OrderSeed[]>;
  /** 邮件配额是否已经耗尽。 */
  quotaExhausted?: boolean;
}

/** 内存版 Postgres：只认这条路径真正发出的三条语句，外加一个真的固定窗口计数器。 */
function fakeDb(opts: DbOptions = {}) {
  const orders = opts.orders ?? { [EMAIL]: ONE_ORDER };
  const limits = new Map<string, { hits: number; windowStart: Date }>();
  const seen: string[] = [];

  const pool = {
    async query(sql: string, params: unknown[] = []) {
      const text = sql.trim();

      if (text.startsWith('INSERT INTO rate_limits')) {
        const key = params[0] as string;
        const now = params[1] as Date;
        const cutoff = params[2] as Date;
        seen.push(key);
        const row = limits.get(key);
        if (!row || row.windowStart < cutoff) {
          limits.set(key, { hits: 1, windowStart: now });
          return { rows: [{ hits: 1 }] };
        }
        row.hits += 1;
        return { rows: [{ hits: row.hits }] };
      }

      if (text.startsWith('SELECT * FROM orders')) {
        // citext 列：比较本身不分大小写，这里照做。
        const asked = (params[0] as string).toLowerCase();
        const found = orders[asked] ?? orders[Object.keys(orders).find((k) => k.toLowerCase() === asked) ?? ''];
        return {
          rows: (found ?? []).map((o) => ({
            id: o.id,
            provider: 'polar',
            buyer_email: asked,
            amount_cents: 2990,
            currency: 'usd',
            locale: o.locale,
            status: 'paid',
            created_at: o.created_at,
          })),
        };
      }

      if (text.startsWith('INSERT INTO email_quota')) {
        return { rows: opts.quotaExhausted ? [] : [{ sent: 1 }] };
      }

      throw new Error(`未预期的 SQL：${text}`);
    },
  } as unknown as Pool;

  return { pool, limits, keys: seen };
}

interface SentMail {
  to: string;
  subject: string;
  text: string;
}

function fakeMailer(pool: Pool, over: { fail?: boolean } = {}) {
  const sent: SentMail[] = [];
  const fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { to: string[]; subject: string; text: string };
    sent.push({ to: body.to[0]!, subject: body.subject, text: body.text });
    if (over.fail) {
      return { ok: false, status: 422, async json() { return { message: 'rejected' }; } };
    }
    return { ok: true, status: 200, async json() { return { id: 're_1' }; } };
  }) as unknown as typeof globalThis.fetch;

  return {
    sent,
    deps: {
      apiKey: 'test-key',
      from: 'TeachFlow <hello@tryteachflow.com>',
      pool,
      dailyBudget: 80,
      fetch,
      now: () => NOW,
    },
  };
}

function fakeRes() {
  const state = { status: 0, headers: {} as Record<string, string | number>, body: Buffer.alloc(0) };
  const res = {
    writeHead(status: number, headers: Record<string, string | number>) {
      state.status = status;
      state.headers = headers;
    },
    end(chunk?: Buffer | string) {
      state.body = chunk === undefined ? Buffer.alloc(0) : Buffer.from(chunk as Buffer);
    },
  } as unknown as ServerResponse;
  return { res, state };
}

interface CallOptions {
  body?: unknown;
  raw?: string;
  ip?: string;
  db?: ReturnType<typeof fakeDb>;
  mailer?: ReturnType<typeof fakeMailer>;
  ttlDays?: number;
}

async function call(opts: CallOptions = {}) {
  const db = opts.db ?? fakeDb();
  const mailer = opts.mailer ?? fakeMailer(db.pool);
  const deps: ResendLinkDeps = {
    pool: db.pool,
    mailer: mailer.deps,
    tokenSecret: SECRET,
    ttlDays: opts.ttlDays ?? 30,
    publicBaseUrl: BASE,
    now: () => NOW,
  };

  const raw = opts.raw ?? JSON.stringify(opts.body ?? { email: EMAIL });
  const req = Readable.from([Buffer.from(raw, 'utf8')]) as unknown as IncomingMessage;
  (req as { headers: Record<string, string> }).headers = { 'content-type': 'application/json' };

  const { res, state } = fakeRes();
  await resendLinkRoute(deps)({
    req,
    res,
    url: new URL('/api/orders/resend-link', BASE),
    params: {},
    clientIp: opts.ip ?? '203.0.113.7',
  });

  return { ...state, text: state.body.toString('utf8'), db, mailer };
}

function linkIn(text: string): string {
  const match = /https:\/\/\S+/.exec(text);
  if (!match) throw new Error('邮件正文里没有链接');
  return match[0];
}

describe('重发下载链接：不泄露邮箱是否存在', () => {
  it('已知与未知邮箱的响应逐字节相同', async () => {
    const known = await call({ body: { email: EMAIL } });
    const unknown = await call({ body: { email: 'nobody@example.com' } });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(known.status);
    expect(unknown.body.equals(known.body)).toBe(true);
    expect(unknown.headers).toEqual(known.headers);
  });

  it('响应体里没有任何判定结果', async () => {
    const r = await call();
    expect(JSON.parse(r.text)).toEqual({ status: 'accepted' });
  });

  it('未知邮箱不发信', async () => {
    const r = await call({ body: { email: 'nobody@example.com' } });
    expect(r.mailer.sent).toEqual([]);
  });

  it('发信被拒也照样回 202', async () => {
    const db = fakeDb();
    const mailer = fakeMailer(db.pool, { fail: true });
    const r = await call({ db, mailer });
    expect(r.status).toBe(202);
    expect(r.mailer.sent).toHaveLength(1);
  });

  it('当天配额用尽也照样回 202', async () => {
    const db = fakeDb({ quotaExhausted: true });
    const r = await call({ db });
    expect(r.status).toBe(202);
    // 配额没占到，信根本没往外发。
    expect(r.mailer.sent).toEqual([]);
  });
});

describe('重发下载链接：信的内容', () => {
  it('发给订单上的邮箱，链接带着新签的 token', async () => {
    const r = await call();
    expect(r.mailer.sent).toHaveLength(1);
    const mail = r.mailer.sent[0]!;
    expect(mail.to).toBe(EMAIL);

    const url = new URL(linkIn(mail.text));
    expect(url.origin + url.pathname).toBe(`${BASE}/download`);
    const verified = verifyToken(SECRET, url.searchParams.get('t')!, NOW.getTime());
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.claims.orderId).toBe('ord_abc');
  });

  it('token 的有效期取自配置，从当下开始算', async () => {
    const r = await call({ ttlDays: 7 });
    const url = new URL(linkIn(r.mailer.sent[0]!.text));
    const verified = verifyToken(SECRET, url.searchParams.get('t')!, NOW.getTime());
    expect(verified.ok && verified.claims.exp).toBe(NOW.getTime() / 1000 + 7 * 86_400);
    expect(r.mailer.sent[0]!.text).toContain('7일 동안');
  });

  it('语言跟随订单', async () => {
    const ko = await call();
    expect(ko.mailer.sent[0]!.subject).toBe('TeachFlow 다운로드 링크');

    const db = fakeDb({
      orders: { [EMAIL]: [{ id: 'ord_en', locale: 'en', created_at: new Date('2026-09-02T00:00:00Z') }] },
    });
    const en = await call({ db });
    expect(en.mailer.sent[0]!.subject).toBe('Your TeachFlow download link');
  });

  it('多笔订单只发最近一笔——每笔的权利都是同一个捆绑包', async () => {
    const db = fakeDb({
      orders: {
        [EMAIL]: [
          { id: 'ord_new', locale: 'en', created_at: new Date('2026-09-15T00:00:00Z') },
          { id: 'ord_old', locale: 'en', created_at: new Date('2026-03-01T00:00:00Z') },
        ],
      },
    });
    const r = await call({ db });
    expect(r.mailer.sent).toHaveLength(1);
    expect(r.mailer.sent[0]!.text).toContain('ord_new');
    expect(r.mailer.sent[0]!.text).not.toContain('ord_old');
  });
});

describe('重发下载链接：限流', () => {
  it('限流键存的是哈希，不是明文邮箱', async () => {
    const r = await call();
    const digest = createHash('sha256').update(EMAIL).digest('hex');
    expect(r.db.keys).toContain(`email:${digest}`);
    expect(r.db.keys.join(' ')).not.toContain(EMAIL);
    expect(r.db.keys.join(' ')).not.toContain('teacher');
  });

  it('同一个邮箱第四次就被拦下，且不发信', async () => {
    const db = fakeDb();
    const mailer = fakeMailer(db.pool);
    for (let i = 0; i < 3; i += 1) {
      const ok = await call({ db, mailer });
      expect(ok.status).toBe(202);
    }
    const blocked = await call({ db, mailer });
    expect(blocked.status).toBe(429);
    expect(JSON.parse(blocked.text).error.code).toBe('too_many_requests');
    expect(mailer.sent).toHaveLength(3);
  });

  it('大小写与空格不同的同一个地址共用一份配额', async () => {
    const db = fakeDb();
    const mailer = fakeMailer(db.pool);
    await call({ db, mailer, body: { email: EMAIL } });
    await call({ db, mailer, body: { email: '  TEACHER@Example.com  ' } });
    await call({ db, mailer, body: { email: 'Teacher@EXAMPLE.COM' } });
    const blocked = await call({ db, mailer, body: { email: EMAIL } });
    expect(blocked.status).toBe(429);
  });

  it('换邮箱枚举会撞上 IP 限流', async () => {
    const db = fakeDb();
    const mailer = fakeMailer(db.pool);
    for (let i = 0; i < 20; i += 1) {
      const ok = await call({ db, mailer, body: { email: `probe${i}@example.com` } });
      expect(ok.status).toBe(202);
    }
    const blocked = await call({ db, mailer, body: { email: 'probe20@example.com' } });
    expect(blocked.status).toBe(429);
  });

  it('换 IP 不影响别人的配额', async () => {
    const db = fakeDb();
    const mailer = fakeMailer(db.pool);
    for (let i = 0; i < 20; i += 1) {
      await call({ db, mailer, ip: '203.0.113.7', body: { email: `probe${i}@example.com` } });
    }
    const other = await call({ db, mailer, ip: '198.51.100.9', body: { email: 'someone@example.com' } });
    expect(other.status).toBe(202);
  });

  it('两条限流都要写，哪怕先触发的是 IP 那条', async () => {
    const db = fakeDb();
    const mailer = fakeMailer(db.pool);
    for (let i = 0; i < 21; i += 1) {
      await call({ db, mailer, body: { email: `probe${i}@example.com` } });
    }
    // 第 21 次被 IP 拦下，但它的邮箱键同样计了数——否则就能靠观察
    // 「这次没被计数」反推出限流是哪一条触发的。
    expect(db.limits.size).toBe(22);
  });
});

describe('重发下载链接：坏请求', () => {
  it.each([
    ['不是 JSON', 'not json'],
    ['不是对象', '"teacher@example.com"'],
    ['缺 email', '{}'],
    ['email 不是字符串', '{"email":123}'],
    ['没有 @', '{"email":"teacher"}'],
    ['没有域名点', '{"email":"teacher@example"}'],
    ['带空格', '{"email":"a b@example.com"}'],
    ['空字符串', '{"email":""}'],
  ])('%s：400', async (_label, raw) => {
    const r = await call({ raw });
    expect(r.status).toBe(400);
    expect(JSON.parse(r.text).error.code).toBe('invalid_email');
    expect(r.mailer.sent).toEqual([]);
  });

  it('坏请求不消耗任何一份限流配额', async () => {
    const r = await call({ raw: '{}' });
    expect(r.db.keys).toEqual([]);
  });

  it('超长请求体：413', async () => {
    const r = await call({ raw: JSON.stringify({ email: `${'x'.repeat(5000)}@example.com` }) });
    expect(r.status).toBe(413);
    expect(JSON.parse(r.text).error.code).toBe('payload_too_large');
  });
});
