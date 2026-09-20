import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { signToken, verifyToken } from '../src/lib/token.ts';

const SECRET = 'a'.repeat(32);
const NOW = Date.parse('2026-09-20T00:00:00Z');

describe('signToken / verifyToken', () => {
  it('往返成功并带回订单号', () => {
    const token = signToken(SECRET, { orderId: 'ord_123', ttlDays: 30, now: NOW });
    const result = verifyToken(SECRET, token, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.claims.orderId).toBe('ord_123');
  });

  it('过期时间就是签发时间加 TTL', () => {
    const token = signToken(SECRET, { orderId: 'ord_123', ttlDays: 30, now: NOW });
    const result = verifyToken(SECRET, token, NOW);
    if (!result.ok) throw new Error('应当通过');
    expect(result.claims.exp - result.claims.iat).toBe(30 * 86_400);
  });

  it('到期后拒绝', () => {
    const token = signToken(SECRET, { orderId: 'ord_123', ttlDays: 1, now: NOW });
    expect(verifyToken(SECRET, token, NOW + 86_400_000 - 1000).ok).toBe(true);
    const expired = verifyToken(SECRET, token, NOW + 86_400_000 + 1000);
    expect(expired).toEqual({ ok: false, reason: 'expired' });
  });

  it('换一个密钥即拒绝', () => {
    const token = signToken(SECRET, { orderId: 'ord_123', ttlDays: 30, now: NOW });
    expect(verifyToken('b'.repeat(32), token, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('签名改一个字符即拒绝', () => {
    const token = signToken(SECRET, { orderId: 'ord_123', ttlDays: 30, now: NOW });
    const [h, p, s] = token.split('.') as [string, string, string];
    const flipped = s[0] === 'A' ? `B${s.slice(1)}` : `A${s.slice(1)}`;
    expect(verifyToken(SECRET, `${h}.${p}.${flipped}`, NOW).ok).toBe(false);
  });

  it('改载荷但留原签名即拒绝', () => {
    const token = signToken(SECRET, { orderId: 'ord_123', ttlDays: 30, now: NOW });
    const [h, , s] = token.split('.') as [string, string, string];
    const forged = Buffer.from(
      JSON.stringify({ sub: 'ord_999', iat: NOW / 1000, exp: NOW / 1000 + 86_400 }),
    ).toString('base64url');
    expect(verifyToken(SECRET, `${h}.${forged}.${s}`, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('alg 被改成 none 即拒绝，且在验签之前就拒绝', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'ord_999', iat: 1, exp: 9_999_999_999 }),
    ).toString('base64url');
    expect(verifyToken(SECRET, `${header}.${payload}.`, NOW)).toEqual({
      ok: false,
      reason: 'bad_algorithm',
    });
  });

  it('段数不对即拒绝', () => {
    expect(verifyToken(SECRET, 'a.b', NOW)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyToken(SECRET, '', NOW)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyToken(SECRET, 'a.b.c.d', NOW)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('载荷缺 sub 即拒绝', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iat: 1, exp: 9_999_999_999 })).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
    expect(verifyToken(SECRET, `${header}.${payload}.${sig}`, NOW)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('令牌不含明文订单号以外的任何可读信息', () => {
    const token = signToken(SECRET, { orderId: 'ord_123', ttlDays: 30, now: NOW });
    expect(token).not.toContain(SECRET);
  });
});
