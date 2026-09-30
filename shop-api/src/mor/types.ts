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
      /** 漏斗归因（Polar checkout metadata 原样回流），可为空。 */
      src?: string;
      vid?: string;
    }
  | { kind: 'refunded'; orderId: string }
  | { kind: 'chargeback'; orderId: string }
  | {
      /**
       * 「到达支付页」信号（checkout.created），只喂漏斗统计，不进订单状态机。
       * 路由层在 applyWebhookEvent 之前分流——绝不能让它落到 refunded/chargeback
       * 分支（那会拿 checkout id 去 UPDATE orders，白吃一个 409）。
       */
      kind: 'checkout_open';
      checkoutId: string;
      amountCents?: number;
      currency?: string;
      src?: string;
      vid?: string;
      lang?: 'en' | 'ko';
    };

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
