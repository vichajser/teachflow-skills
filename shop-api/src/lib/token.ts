import { createHmac, timingSafeEqual } from 'node:crypto';

// HS256 的签发与校验不到 60 行，不值得一个依赖。格式仍是标准 JWT，
// 以后换成任何库都能验得动。

export interface TokenClaims {
  /** 订单号。下载授权的唯一主体。 */
  orderId: string;
  /** 签发时间，秒。 */
  iat: number;
  /** 过期时间，秒。 */
  exp: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function sign(secret: string, signingInput: string): Buffer {
  return createHmac('sha256', secret).update(signingInput).digest();
}

export interface SignOptions {
  orderId: string;
  ttlDays: number;
  /** 便于测试注入时间。单位毫秒。 */
  now?: number;
}

export function signToken(secret: string, options: SignOptions): string {
  const iat = Math.floor((options.now ?? Date.now()) / 1000);
  const exp = iat + options.ttlDays * 86_400;
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(Buffer.from(JSON.stringify({ sub: options.orderId, iat, exp })));
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${b64url(sign(secret, signingInput))}`;
}

export type VerifyFailure = 'malformed' | 'bad_algorithm' | 'bad_signature' | 'expired';

export type VerifyResult =
  | { ok: true; claims: TokenClaims }
  | { ok: false; reason: VerifyFailure };

export function verifyToken(secret: string, token: string, now = Date.now()): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [header, payload, signature] = parts as [string, string, string];

  let head: unknown;
  try {
    head = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  // alg 必须先于验签检查，否则 alg=none 这类降级攻击会绕过下面的比对。
  if (!head || typeof head !== 'object' || (head as { alg?: unknown }).alg !== 'HS256') {
    return { ok: false, reason: 'bad_algorithm' };
  }

  const expected = sign(secret, `${header}.${payload}`);
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'base64url');
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let body: { sub?: unknown; iat?: unknown; exp?: unknown };
  try {
    body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof body.sub !== 'string' || body.sub === '') return { ok: false, reason: 'malformed' };
  if (typeof body.iat !== 'number' || typeof body.exp !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (body.exp * 1000 <= now) return { ok: false, reason: 'expired' };

  return { ok: true, claims: { orderId: body.sub, iat: body.iat, exp: body.exp } };
}
