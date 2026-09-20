import type { Pool } from 'pg';
import type { Handler, RequestContext } from '../http/router.ts';
import { BodyTooLarge, readRawBody, sendError, sendJson } from '../http/respond.ts';
import { signToken } from '../lib/token.ts';
import { sendMail, type MailerDeps } from '../lib/mailer.ts';
import { resendMail } from '../lib/emails.ts';
import { emailKey, hit, ipKey, type Limit } from '../lib/ratelimit.ts';
import { paidOrdersByEmail } from '../db/orders.ts';

const MAX_BODY_BYTES = 4 * 1024;

// 邮箱一小时三次，足够覆盖「没收到，再点一次」；再多就是打错地方或在轰炸别人。
const PER_EMAIL: Limit = { max: 3, windowMs: 60 * 60 * 1000 };
// IP 一小时二十次。枚举要试的是大量不同邮箱，按邮箱限流拦不住，只有这条拦得住。
const PER_IP: Limit = { max: 20, windowMs: 60 * 60 * 1000 };

// 邮箱存不存在、信发没发出去，对外都是这一个响应，且逐字节相同。
// 任何差异都能被用来问「这个地址买过吗」，而这正是我们不打算回答的问题。
// 页面上写的是「如果这个地址有订单，链接已经在路上了」，那句话由前端出，
// 不放进这里——放进来就得跟着站点做双语，而它并不承担任何判定。
const ACCEPTED = { status: 'accepted' } as const;

export interface ResendLinkDeps {
  pool: Pool;
  mailer: MailerDeps;
  tokenSecret: string;
  ttlDays: number;
  publicBaseUrl: string;
  now?(): Date;
}

// 不做完整的 RFC 5322 校验：这里只需要排除明显不是地址的输入，
// 真正的判定是「库里有没有」，而那个结果我们本来就不打算说。
const SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function emailOf(raw: Buffer): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const value = (parsed as Record<string, unknown>).email;
  if (typeof value !== 'string') return null;
  const email = value.trim();
  if (email.length > 254 || !SHAPE.test(email)) return null;
  return email;
}

export function resendLinkRoute(deps: ResendLinkDeps): Handler {
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

    const email = emailOf(raw);
    // 地址格式不对，客户端自己就能判断，说出来不泄露任何东西。
    if (email === null) {
      sendError(ctx.res, 400, 'invalid_email', '请求体应为 {"email": "..."}，且地址格式要合法。');
      return;
    }

    const now = deps.now ? deps.now() : new Date();
    const withinIp = await hit(deps.pool, ipKey(ctx.clientIp), PER_IP, now);
    const withinEmail = await hit(deps.pool, emailKey(email), PER_EMAIL, now);
    if (!withinIp || !withinEmail) {
      // 不区分是哪条限流触发的：说出来等于告诉对方换个 IP 还是换个邮箱继续。
      sendError(ctx.res, 429, 'too_many_requests', '请求过于频繁，请稍后再试。');
      return;
    }

    const orders = await paidOrdersByEmail(deps.pool, email);
    // 同一个邮箱可能有多笔订单，但每笔的 entitlements 是同一个捆绑包，
    // 最近一笔的链接已经覆盖全部文件。逐笔发信只会白白烧掉当天的发信配额。
    const order = orders[0];
    if (order) {
      const token = signToken(deps.tokenSecret, {
        orderId: order.id,
        ttlDays: deps.ttlDays,
        now: now.getTime(),
      });
      const mail = resendMail({
        lang: order.locale,
        orderId: order.id,
        downloadUrl: `${deps.publicBaseUrl}/download?t=${encodeURIComponent(token)}`,
        ttlDays: deps.ttlDays,
      });
      // 返回值故意不看。sendMail 对投递失败返回 SendResult 而不抛错，
      // 所以这一行不会改变响应——它要是能改变响应，就成了一个探测邮箱的信号。
      await sendMail(deps.mailer, {
        to: order.buyerEmail,
        subject: mail.subject,
        text: mail.text,
        kind: 'transactional',
      });
    }

    sendJson(ctx.res, 202, ACCEPTED);
  };
}
