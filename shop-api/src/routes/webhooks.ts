import type { Pool } from 'pg';
import type { Handler, RequestContext } from '../http/router.ts';
import { BodyTooLarge, readRawBody, sendError, sendJson } from '../http/respond.ts';
import type { MorAdapter, VerifyFailure } from '../mor/types.ts';
import { applyWebhookEvent } from '../db/orders.ts';

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
