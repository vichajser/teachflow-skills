import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { polarAdapter } from '../src/mor/polar.ts';
import { getAdapter, MorError } from '../src/mor/index.ts';

const SECRET = 'whsec_' + Buffer.from('polar-webhook-secret-value').toString('base64');
const NOW = Date.parse('2026-09-20T12:00:00Z');
const TS = String(Math.floor(NOW / 1000));

function sign(id: string, timestamp: string, body: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice(6), 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

function deliver(
  payload: unknown,
  opts: { id?: string; timestamp?: string; secret?: string; signature?: string; now?: number } = {},
) {
  const body = JSON.stringify(payload);
  const id = opts.id ?? 'evt_001';
  const timestamp = opts.timestamp ?? TS;
  return polarAdapter.verifyAndNormalize(
    Buffer.from(body, 'utf8'),
    {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': opts.signature ?? sign(id, timestamp, body, opts.secret ?? SECRET),
    },
    SECRET,
    opts.now ?? NOW,
  );
}

const PAID = {
  type: 'order.paid',
  data: {
    id: 'ord_abc',
    currency: 'usd',
    total_amount: 2990,
    customer: { email: 'teacher@example.com' },
  },
};

describe('验签', () => {
  it('正确签名通过', () => {
    const out = deliver(PAID);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.eventId).toBe('evt_001');
  });

  it('换密钥签的即拒绝', () => {
    const other = 'whsec_' + Buffer.from('another-secret-entirely').toString('base64');
    expect(deliver(PAID, { secret: other })).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('body 改一个字节即拒绝——签的是原始字节', () => {
    const body = JSON.stringify(PAID);
    const tampered = body.replace('2990', '0001');
    const out = polarAdapter.verifyAndNormalize(
      Buffer.from(tampered, 'utf8'),
      {
        'webhook-id': 'evt_001',
        'webhook-timestamp': TS,
        'webhook-signature': sign('evt_001', TS, body),
      },
      SECRET,
      NOW,
    );
    expect(out).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('签名基串绑定事件 id——换 id 重放即拒绝', () => {
    const body = JSON.stringify(PAID);
    const out = polarAdapter.verifyAndNormalize(
      Buffer.from(body, 'utf8'),
      {
        'webhook-id': 'evt_999',
        'webhook-timestamp': TS,
        'webhook-signature': sign('evt_001', TS, body),
      },
      SECRET,
      NOW,
    );
    expect(out).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('多个签名并存时命中任意一个即通过（密钥轮换）', () => {
    const body = JSON.stringify(PAID);
    const good = sign('evt_001', TS, body);
    const out = polarAdapter.verifyAndNormalize(
      Buffer.from(body, 'utf8'),
      {
        'webhook-id': 'evt_001',
        'webhook-timestamp': TS,
        'webhook-signature': `v1,AAAA ${good}`,
      },
      SECRET,
      NOW,
    );
    expect(out.ok).toBe(true);
  });

  it('缺任一必需头即拒绝', () => {
    for (const drop of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
      const headers: Record<string, string> = {
        'webhook-id': 'evt_001',
        'webhook-timestamp': TS,
        'webhook-signature': sign('evt_001', TS, JSON.stringify(PAID)),
      };
      delete headers[drop];
      expect(
        polarAdapter.verifyAndNormalize(Buffer.from(JSON.stringify(PAID)), headers, SECRET, NOW),
      ).toEqual({ ok: false, reason: 'missing_headers' });
    }
  });

  it('密钥不带 whsec_ 前缀也能验', () => {
    const raw = 'plain-shared-secret';
    const body = JSON.stringify(PAID);
    const sig = `v1,${createHmac('sha256', Buffer.from(raw, 'utf8')).update(`evt_001.${TS}.${body}`).digest('base64')}`;
    const out = polarAdapter.verifyAndNormalize(
      Buffer.from(body),
      { 'webhook-id': 'evt_001', 'webhook-timestamp': TS, 'webhook-signature': sig },
      raw,
      NOW,
    );
    expect(out.ok).toBe(true);
  });
});

describe('时间戳窗口', () => {
  it('窗口内通过', () => {
    expect(deliver(PAID, { timestamp: String(Math.floor(NOW / 1000) - 299) }).ok).toBe(true);
  });

  it('超过 5 分钟即拒绝', () => {
    expect(deliver(PAID, { timestamp: String(Math.floor(NOW / 1000) - 301) })).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
  });

  it('未来时间同样受限——时钟被拨快也不放行', () => {
    expect(deliver(PAID, { timestamp: String(Math.floor(NOW / 1000) + 601) })).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
  });

  it('非数字时间戳即拒绝', () => {
    expect(deliver(PAID, { timestamp: 'soon' })).toEqual({ ok: false, reason: 'stale_timestamp' });
  });
});

describe('事件归一', () => {
  it('paid：订单号、邮箱、金额、币种齐全，币种大写', () => {
    const out = deliver(PAID);
    if (!out.ok) throw new Error('应当通过');
    expect(out.event).toEqual({
      kind: 'paid',
      orderId: 'ord_abc',
      email: 'teacher@example.com',
      amountCents: 2990,
      currency: 'USD',
      locale: 'en',
    });
  });

  it('paid：metadata.locale 为 ko 时取韩文', () => {
    const out = deliver({ ...PAID, data: { ...PAID.data, metadata: { locale: 'ko-KR' } } });
    if (!out.ok || !out.event) throw new Error('应当通过');
    expect(out.event.kind === 'paid' && out.event.locale).toBe('ko');
  });

  it('paid：无 metadata 时按账单国家 KR 推断', () => {
    const out = deliver({
      ...PAID,
      data: { ...PAID.data, customer: { email: 'a@b.com', billing_address: { country: 'kr' } } },
    });
    if (!out.ok || !out.event) throw new Error('应当通过');
    expect(out.event.kind === 'paid' && out.event.locale).toBe('ko');
  });

  it('paid 缺关键字段时归一为 null，而不是建一条残缺订单', () => {
    const out = deliver({ type: 'order.paid', data: { id: 'ord_abc', currency: 'usd' } });
    expect(out).toEqual({ ok: true, eventId: 'evt_001', event: null });
  });

  it('refunded：从 order.refunded 的订单本身取 id', () => {
    const out = deliver({ type: 'order.refunded', data: { id: 'ord_abc' } });
    if (!out.ok) throw new Error('应当通过');
    expect(out.event).toEqual({ kind: 'refunded', orderId: 'ord_abc' });
  });

  it('refunded：从 refund.created 取 order_id，而不是退款自己的 id', () => {
    const out = deliver({ type: 'refund.created', data: { id: 'ref_1', order_id: 'ord_abc' } });
    if (!out.ok) throw new Error('应当通过');
    expect(out.event).toEqual({ kind: 'refunded', orderId: 'ord_abc' });
  });

  it('chargeback：争议事件翻转同一笔订单', () => {
    const out = deliver({ type: 'dispute.created', data: { order_id: 'ord_abc' } });
    if (!out.ok) throw new Error('应当通过');
    expect(out.event).toEqual({ kind: 'chargeback', orderId: 'ord_abc' });
  });

  it('不认识的事件类型安全忽略——不抛错，验签结果仍是通过', () => {
    const out = deliver({ type: 'subscription.created', data: { id: 'sub_1' } });
    expect(out).toEqual({ ok: true, eventId: 'evt_001', event: null });
  });

  it('body 不是合法 JSON 时报 malformed 而非崩溃', () => {
    const body = '{not json';
    const out = polarAdapter.verifyAndNormalize(
      Buffer.from(body),
      {
        'webhook-id': 'evt_001',
        'webhook-timestamp': TS,
        'webhook-signature': sign('evt_001', TS, body),
      },
      SECRET,
      NOW,
    );
    expect(out).toEqual({ ok: false, reason: 'malformed_payload' });
  });

  it('缺 type 或 data 时报 malformed', () => {
    expect(deliver({ data: {} })).toEqual({ ok: false, reason: 'malformed_payload' });
    expect(deliver({ type: 'order.paid' })).toEqual({ ok: false, reason: 'malformed_payload' });
  });
});

describe('适配器注册表', () => {
  it('polar 可取', () => {
    expect(getAdapter('polar').name).toBe('polar');
  });

  it('未实现的供应商在取适配器时就报错，而不是等第一笔订单', () => {
    expect(() => getAdapter('paddle')).toThrow(MorError);
  });
});
