import type { Pool } from 'pg';
import type { Handler, RequestContext } from '../http/router.ts';
import { BodyTooLarge, readRawBody, sendError, sendJson } from '../http/respond.ts';
import type { MorAdapter, VerifyFailure } from '../mor/types.ts';
import { applyWebhookEvent } from '../db/orders.ts';
import type { FunnelSink } from '../funnel/events.ts';

const MAX_BODY_BYTES = 1024 * 1024;

// malformed 是「签名对、内容我们读不懂」，那是双方对不上的契约问题，
// 重投多少次都一样，所以回 400 让它别再投了。其余是拒收，回 401。
const STATUS_BY_FAILURE: Record<VerifyFailure, number> = {
  missing_headers: 401,
  bad_signature: 401,
  stale_timestamp: 401,
  malformed_payload: 400,
};

// 回给供应商看的说明。措辞只描述我们这边的判定，不回显收到的内容——
// 这个响应会进对方的投递日志，而我们无法假定那份日志是私密的。
const MESSAGE_BY_FAILURE: Record<VerifyFailure, string> = {
  missing_headers: '缺少签名所需的请求头。',
  bad_signature: '签名校验未通过。',
  stale_timestamp: '时间戳超出允许窗口。',
  malformed_payload: '签名通过，但内容不是我们认识的结构。',
};

export interface WebhookDeps {
  adapter: MorAdapter;
  secret: string;
  pool: Pool;
  /** 捆绑包里的 skill id，付款后一次性写齐 entitlements。 */
  skillIds: readonly string[];
  /** 漏斗统计旁路（checkout_open / order_paid）。缺省时完全不记录。 */
  funnel?: FunnelSink;
  enqueue(job: string, data: Record<string, unknown>): Promise<void>;
  now?(): number;
}

export function webhookRoute(deps: WebhookDeps): Handler {
  return async (ctx: RequestContext) => {
    let raw: Buffer;
    try {
      raw = await readRawBody(ctx.req, MAX_BODY_BYTES);
    } catch (err) {
      if (err instanceof BodyTooLarge) {
        sendError(ctx.res, 413, 'payload_too_large', '请求体超出上限。');
        return;
      }
      throw err;
    }

    const outcome = deps.adapter.verifyAndNormalize(
      raw,
      ctx.req.headers,
      deps.secret,
      deps.now ? deps.now() : undefined,
    );
    if (!outcome.ok) {
      sendError(
        ctx.res,
        STATUS_BY_FAILURE[outcome.reason],
        outcome.reason,
        MESSAGE_BY_FAILURE[outcome.reason],
      );
      return;
    }

    // 验签已经证明这是合法 JSON，这里只是把它取出来存档。
    const payload: unknown = JSON.parse(raw.toString('utf8'));

    // 漏斗第③步：checkout.created。只记账，不碰订单状态机，也不进
    // webhook_events 存档表——去重靠 funnel_events 里 checkout_id 的唯一性
    // （recordCheckoutOpenOnce），重投命中去重时返回 duplicate 供观测。
    if (outcome.event?.kind === 'checkout_open') {
      let funnelResult = 'skipped';
      if (deps.funnel) {
        const wrote = await deps.funnel.recordCheckoutOpenOnce({
          step: 'checkout_open',
          checkoutId: outcome.event.checkoutId,
          amountCents: outcome.event.amountCents,
          currency: outcome.event.currency,
          src: outcome.event.src,
          vid: outcome.event.vid,
          lang: outcome.event.lang,
        });
        funnelResult = wrote ? 'recorded' : 'duplicate';
      }
      sendJson(ctx.res, 200, { ok: true, result: 'ignored', funnel: funnelResult });
      return;
    }

    const result = await applyWebhookEvent(deps.pool, {
      provider: deps.adapter.name,
      eventId: outcome.eventId,
      payload,
      event: outcome.event,
      skillIds: deps.skillIds,
    });

    if (result === 'unknown_order') {
      // 回非 200 让供应商重投：付款事件可能只是还在路上。
      sendError(ctx.res, 409, 'unknown_order', '事件指向的订单不存在。');
      return;
    }

    if (result === 'applied' && outcome.event?.kind === 'paid') {
      // 漏斗第④步：只在首次落库（applied）时记——重投（duplicate）不重复计数。
      // record 内部吞错：统计失败不影响发货。
      if (deps.funnel) {
        await deps.funnel.record({
          step: 'order_paid',
          orderId: outcome.event.orderId,
          amountCents: outcome.event.amountCents,
          currency: outcome.event.currency,
          lang: outcome.event.locale,
          src: outcome.event.src,
          vid: outcome.event.vid,
        });
      }
      // 投递在事务之外。这里仍回 200：订单已经落库，重投只会命中去重，
      // 再投多少次也不会把这个任务补上。买家的兜底是自助 resend-link。
      try {
        await deps.enqueue('send-delivery', { orderId: outcome.event.orderId });
      } catch {
        sendJson(ctx.res, 200, { ok: true, result, mail: 'not_queued' });
        return;
      }
    }

    sendJson(ctx.res, 200, { ok: true, result });
  };
}
