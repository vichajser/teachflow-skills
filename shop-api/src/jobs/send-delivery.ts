import type { Pool } from 'pg';
import { signToken } from '../lib/token.ts';
import { sendMail, type MailerDeps } from '../lib/mailer.ts';
import { deliveryMail } from '../lib/emails.ts';
import { withdrawalNotice } from '../lib/legal.ts';
import { getOrder, entitledSkillIds } from '../db/orders.ts';

export interface DeliveryData {
  orderId: string;
}

export interface DeliveryDeps {
  pool: Pool;
  mailer: MailerDeps;
  tokenSecret: string;
  ttlDays: number;
  publicBaseUrl: string;
  now?(): Date;
}

export type DeliveryResult = 'sent' | 'gone' | 'not_paid' | 'rejected';

/** 0 是请求没走到对端，429 与 5xx 是对端让你等会儿再来。其余都当永久失败。 */
function transient(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

/**
 * 付款后的第一封交付邮件。spec §3.3 第 4 步。
 *
 * 与 notify-update 不同，这封信没有「已发记账」可查：发没发成，库里不留痕。
 * 这是刻意的——投递失败时买家不靠我们巡检，靠自己点 resend-link，那条路
 * 有独立的限流与配额（webhooks.ts 投递失败分支的注释就是这么交代的）。
 *
 * 退款与投递竞速时退款说了算：任务真正跑起来的时候订单可能已经不是 paid，
 * 这时什么都不做。重试不会让状态往回走。
 */
export async function sendDelivery(
  deps: DeliveryDeps,
  data: DeliveryData,
): Promise<DeliveryResult> {
  const order = await getOrder(deps.pool, data.orderId);
  // 订单不存在，重投也变不出来。
  if (!order) return 'gone';
  if (order.status !== 'paid') return 'not_paid';

  const skills = await entitledSkillIds(deps.pool, order.id);
  const now = deps.now ? deps.now() : new Date();
  const token = signToken(deps.tokenSecret, {
    orderId: order.id,
    ttlDays: deps.ttlDays,
    now: now.getTime(),
  });
  const mail = deliveryMail({
    lang: order.locale,
    orderId: order.id,
    downloadUrl: `${deps.publicBaseUrl}/download?t=${encodeURIComponent(token)}`,
    ttlDays: deps.ttlDays,
    skillCount: skills.length,
    // 法定撤回权告知从 refund.md 现取，与下载页同源，改一处两处同时生效。
    notice: withdrawalNotice(order.locale),
  });

  const result = await sendMail(deps.mailer, {
    to: order.buyerEmail,
    subject: mail.subject,
    text: mail.text,
    kind: 'transactional',
  });

  if (result.sent) return 'sent';

  // 配额到顶或对端暂时不可用：抛给 pg-boss 退避重试。配额按 UTC 日重置，
  // 三次重试（约几分钟）多半等不到窗口，但买家随时能走 resend-link 自助，
  // 这封信不值得为它单写一套顺延逻辑。收件人地址不进日志。
  if (result.reason === 'quota' || transient(result.status)) {
    throw new Error(`交付邮件暂时投递失败：status ${result.status}，订单 ${order.id}。`);
  }

  // 永久拒收（地址不存在、被封）：重试结果永远一样，到这里为止。
  return 'rejected';
}
