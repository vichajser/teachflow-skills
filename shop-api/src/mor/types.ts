// MoR（record 商户）适配层。Polar 是当下的选择，Paddle 是备胎——
// 上层只认下面这个归一事件，换供应商时只需要再写一个实现这套接口的文件。

export type NormalizedOrderEvent =
  | {
      kind: 'paid';
      orderId: string;
      email: string;
      amountCents: number;
      currency: string;
      locale: 'en' | 'ko';
    }
  | { kind: 'refunded'; orderId: string }
  | { kind: 'chargeback'; orderId: string };

export type VerifyOutcome =
  /** 验签通过且事件与订单有关。 */
  | { ok: true; eventId: string; event: NormalizedOrderEvent }
  /**
   * 验签通过，但这类事件我们不处理（订阅、产品变更等）。
   * 必须与错误区分开：供应商会投很多我们不关心的事件，
   * 对它们返回非 200 会招来无休止的重投。
   */
  | { ok: true; eventId: string; event: null }
  | { ok: false; reason: VerifyFailure };

export type VerifyFailure =
  | 'missing_headers'
  | 'bad_signature'
  | 'stale_timestamp'
  | 'malformed_payload';

export interface MorAdapter {
  readonly name: string;
  verifyAndNormalize(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    secret: string,
    now?: number,
  ): VerifyOutcome;
}
