import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MorAdapter, NormalizedOrderEvent, VerifyOutcome } from './types.ts';

// Polar 遵循 Standard Webhooks：三个头 webhook-id / webhook-timestamp /
// webhook-signature，签名基串是 `<id>.<timestamp>.<原始 body>`，
// HMAC-SHA256 后 base64。必须用原始字节——JSON 解析再序列化会改键序和空白。

const TOLERANCE_SECONDS = 300;

/**
 * 供应商事件名到我们三种状态的映射。退款与争议的事件名以 Polar 后台
 * 「Webhook → Events」列表为准；这里列了目前已知的别名。
 * 没列上的事件会被安全忽略（返回 event: null 并回 200），所以万一名字对不上，
 * 后果是「订单状态没自动翻转」而不是「接口报错、供应商无限重投」。
 */
const EVENT_KINDS: Record<string, 'paid' | 'refunded' | 'chargeback'> = {
  'order.paid': 'paid',
  'order.refunded': 'refunded',
  'refund.created': 'refunded',
  'order.chargeback': 'chargeback',
  'dispute.created': 'chargeback',
  'dispute.opened': 'chargeback',
};

function headerOf(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Standard Webhooks 的密钥是 `whsec_` + base64。有的后台复制出来不带前缀，
 * 也有直接给原文的；两种解法都试一遍，任一匹配即通过。这不削弱安全性——
 * 攻击者无论如何都得先拿到这个密钥。
 */
function candidateKeys(secret: string): Buffer[] {
  const body = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const keys = [Buffer.from(body, 'utf8')];
  const decoded = Buffer.from(body, 'base64');
  if (decoded.length > 0 && decoded.toString('base64').replace(/=+$/, '') === body.replace(/=+$/, '')) {
    keys.push(decoded);
  }
  return keys;
}

function signaturesMatch(secret: string, signingInput: string, headerValue: string): boolean {
  // 头里可能有多个签名（密钥轮换期），空格分隔，每个形如 `v1,<base64>`。
  const provided = headerValue
    .split(' ')
    .map((part) => (part.includes(',') ? part.slice(part.indexOf(',') + 1) : part))
    .map((b64) => Buffer.from(b64, 'base64'))
    .filter((buf) => buf.length > 0);
  if (provided.length === 0) return false;

  const expected = candidateKeys(secret).map((key) =>
    createHmac('sha256', key).update(signingInput, 'utf8').digest(),
  );

  let matched = false;
  for (const exp of expected) {
    for (const got of provided) {
      // 不提前 return：让比较次数与输入无关。
      if (got.length === exp.length && timingSafeEqual(got, exp)) matched = true;
    }
  }
  return matched;
}

function pickLocale(order: Record<string, unknown>): 'en' | 'ko' {
  const metadata = (order.metadata ?? {}) as Record<string, unknown>;
  if (typeof metadata.locale === 'string' && metadata.locale.toLowerCase().startsWith('ko')) {
    return 'ko';
  }
  const customer = (order.customer ?? {}) as Record<string, unknown>;
  const billing = (customer.billing_address ?? {}) as Record<string, unknown>;
  const country = billing.country ?? (order.billing_address as Record<string, unknown> | undefined)?.country;
  return typeof country === 'string' && country.toUpperCase() === 'KR' ? 'ko' : 'en';
}

function emailOf(order: Record<string, unknown>): string | undefined {
  const customer = (order.customer ?? {}) as Record<string, unknown>;
  const candidates = [customer.email, order.customer_email, order.email];
  for (const c of candidates) {
    if (typeof c === 'string' && c.includes('@')) return c;
  }
  return undefined;
}

function amountOf(order: Record<string, unknown>): number | undefined {
  for (const key of ['total_amount', 'amount', 'net_amount']) {
    const v = order[key];
    if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  }
  return undefined;
}

/**
 * 退款与争议事件的 payload 可能是订单本身，也可能是引用订单的退款对象。
 * 顺序是刻意的：退款对象自己的 id 不是订单号，只能排在最后兜底。
 * 兜错了也只是 UPDATE 命中零行，不会改错订单。
 */
function orderIdOf(data: Record<string, unknown>): string | undefined {
  if (typeof data.order_id === 'string' && data.order_id !== '') return data.order_id;
  const order = data.order as Record<string, unknown> | undefined;
  if (order && typeof order.id === 'string' && order.id !== '') return order.id;
  if (typeof data.id === 'string' && data.id !== '') return data.id;
  return undefined;
}

function normalize(type: string, data: Record<string, unknown>): NormalizedOrderEvent | null {
  const kind = EVENT_KINDS[type];
  if (!kind) return null;

  if (kind === 'paid') {
    const orderId = typeof data.id === 'string' ? data.id : undefined;
    const email = emailOf(data);
    const amountCents = amountOf(data);
    const currency = typeof data.currency === 'string' ? data.currency.toUpperCase() : undefined;
    if (!orderId || !email || amountCents === undefined || !currency) return null;
    return { kind: 'paid', orderId, email, amountCents, currency, locale: pickLocale(data) };
  }

  const orderId = orderIdOf(data);
  if (!orderId) return null;
  return { kind, orderId };
}

export const polarAdapter: MorAdapter = {
  name: 'polar',

  verifyAndNormalize(rawBody, headers, secret, now = Date.now()): VerifyOutcome {
    const id = headerOf(headers, 'webhook-id');
    const timestamp = headerOf(headers, 'webhook-timestamp');
    const signature = headerOf(headers, 'webhook-signature');
    if (!id || !timestamp || !signature) return { ok: false, reason: 'missing_headers' };

    const sentAt = Number(timestamp);
    if (!Number.isFinite(sentAt)) return { ok: false, reason: 'stale_timestamp' };
    if (Math.abs(Math.floor(now / 1000) - sentAt) > TOLERANCE_SECONDS) {
      return { ok: false, reason: 'stale_timestamp' };
    }

    const signingInput = `${id}.${timestamp}.${rawBody.toString('utf8')}`;
    if (!signaturesMatch(secret, signingInput, signature)) {
      return { ok: false, reason: 'bad_signature' };
    }

    let payload: { type?: unknown; data?: unknown };
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { ok: false, reason: 'malformed_payload' };
    }
    if (typeof payload.type !== 'string' || !payload.data || typeof payload.data !== 'object') {
      return { ok: false, reason: 'malformed_payload' };
    }

    return { ok: true, eventId: id, event: normalize(payload.type, payload.data as Record<string, unknown>) };
  },
};
