import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { sendDelivery, type DeliveryDeps } from '../src/jobs/send-delivery.ts';
import { verifyToken } from '../src/lib/token.ts';
import { HARD_DAILY_CAP } from '../src/db/quota.ts';

const SECRET = 'send-delivery-token-secret-at-least-32-bytes!';
const BASE = 'https://tryteachflow.com';
const NOW = new Date('2026-09-23T06:40:00Z');
const ORDER_ID = '831f0586-8ff5-4e2d-9635-f56b67a678b0';

interface OrderOpts {
  status?: 'paid' | 'refunded' | 'chargeback';
  locale?: 'en' | 'ko';
  /** 库里查不到这张单。 */
  missing?: boolean;
}

const SKILLS = [
  'audio-workflow',
  'lesson-workflow',
  'ppt-workflow',
  'report-workflow',
  'word-workflow',
  'worksheet-workflow',
];

/**
 * 内存版 Postgres：只认这条路径真正发出的三条语句——订单、授权清单、
 * 发信额度。额度用真计数器，跟 notify-update 的 fakeDb 同一个理由。
 */
function fakeDb(opts: OrderOpts = {}) {
  let quotaLeft = HARD_DAILY_CAP;

  const pool = {
    async query(sql: string, params: unknown[] = []) {
      const text = sql.trim();

      if (text.startsWith('SELECT * FROM orders WHERE id')) {
        if (opts.missing) return { rows: [] };
        return {
          rows: [
            {
              id: params[0],
              provider: 'polar',
              buyer_email: 'teacher@example.com',
              amount_cents: 3169,
              currency: 'USD',
              locale: opts.locale ?? 'en',
              status: opts.status ?? 'paid',
              created_at: NOW,
            },
          ],
        };
      }

      if (text.startsWith('SELECT e.skill_id FROM entitlements')) {
        // 退款后授权清零，与真实的 JOIN 条件一致。
        if ((opts.status ?? 'paid') !== 'paid') return { rows: [] };
        return { rows: SKILLS.map((skill_id) => ({ skill_id })) };
      }

      if (text.startsWith('INSERT INTO email_quota')) {
        if (quotaLeft <= 0) return { rows: [] };
        quotaLeft -= 1;
        return { rows: [{ sent: 1 }] };
      }

      throw new Error(`没见过的 SQL：${text.slice(0, 80)}`);
    },
  } as unknown as Pool;

  return { pool };
}

interface SentMail {
  to: string;
  subject: string;
  text: string;
  kind: string;
}

function mailer(opts: { failStatus?: number } = {}) {
  const sent: SentMail[] = [];
  const deps: DeliveryDeps['mailer'] = {
    apiKey: 're_test_key',
    from: 'TeachFlow <noreply@tryteachflow.com>',
    pool: fakeDb().pool, // 不会被用到：fakeDb 在调用方注入
    dailyBudget: 80,
    fetch: async () => {
      if (opts.failStatus !== undefined) {
        return new Response(JSON.stringify({ message: 'boom' }), { status: opts.failStatus });
      }
      return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 });
    },
  };
  // 截获信封：fetch 只看到拼好的 JSON，而我们要断言的是收件人与文案。
  const spy = {
    ...deps,
    fetch: async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      sent.push({
        to: (body.to as string[])[0]!,
        subject: body.subject as string,
        text: body.text as string,
        kind: '',
      });
      return deps.fetch!(url, init);
    },
  };
  return { mailer: spy, sent };
}

function depsOf(over: Partial<DeliveryDeps> = {}): DeliveryDeps {
  return {
    pool: fakeDb().pool,
    mailer: mailer().mailer,
    tokenSecret: SECRET,
    ttlDays: 30,
    publicBaseUrl: BASE,
    now: () => NOW,
    ...over,
  };
}

describe('sendDelivery', () => {
  it('给已付款订单发出带签名链接的交付邮件', async () => {
    const { pool } = fakeDb();
    const { mailer: m, sent } = mailer();
    const result = await sendDelivery(depsOf({ pool, mailer: m }), { orderId: ORDER_ID });

    expect(result).toBe('sent');
    expect(sent).toHaveLength(1);
    const mail = sent[0]!;
    expect(mail.to).toBe('teacher@example.com');

    // 链接里的 token 必须能验回这张单。
    const match = mail.text.match(/\/download\?t=([^\s]+)/);
    expect(match).not.toBeNull();
    const token = decodeURIComponent(match![1]!);
    const payload = verifyToken(SECRET, token, NOW.getTime());
    expect(payload.ok).toBe(true);
    if (payload.ok) expect(payload.claims.orderId).toBe(ORDER_ID);

    // 技能数与撤回权告知都在正文里。
    expect(mail.text).toContain('6');
    expect(mail.text).toContain('withdraw');
  });

  it('韩文订单发韩文信，并附韩文撤回权告知', async () => {
    const { pool } = fakeDb({ locale: 'ko' });
    const { mailer: m, sent } = mailer();
    const result = await sendDelivery(depsOf({ pool, mailer: m }), { orderId: ORDER_ID });

    expect(result).toBe('sent');
    expect(sent[0]!.subject).toContain('다운로드');
    expect(sent[0]!.text).toContain('청약철회');
  });

  it('订单不存在时不发信', async () => {
    const { pool } = fakeDb({ missing: true });
    const { mailer: m, sent } = mailer();
    expect(await sendDelivery(depsOf({ pool, mailer: m }), { orderId: ORDER_ID })).toBe('gone');
    expect(sent).toHaveLength(0);
  });

  it('已退款的订单不发信——退款与投递竞速时退款说了算', async () => {
    const { pool } = fakeDb({ status: 'refunded' });
    const { mailer: m, sent } = mailer();
    expect(await sendDelivery(depsOf({ pool, mailer: m }), { orderId: ORDER_ID })).toBe(
      'not_paid',
    );
    expect(sent).toHaveLength(0);
  });

  it('对端暂时不可用时抛错，交给 pg-boss 退避重试', async () => {
    const { pool } = fakeDb();
    const { mailer: m } = mailer({ failStatus: 500 });
    await expect(
      sendDelivery(depsOf({ pool, mailer: m }), { orderId: ORDER_ID }),
    ).rejects.toThrow('暂时投递失败');
  });

  it('对端永久拒收时到此为止，不再重试', async () => {
    const { pool } = fakeDb();
    const { mailer: m, sent } = mailer({ failStatus: 422 });
    expect(await sendDelivery(depsOf({ pool, mailer: m }), { orderId: ORDER_ID })).toBe(
      'rejected',
    );
    expect(sent).toHaveLength(1);
  });
});
