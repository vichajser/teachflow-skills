import type { Pool } from 'pg';
import { HARD_DAILY_CAP, reserveQuota, utcDay } from '../db/quota.ts';

const ENDPOINT = 'https://api.resend.com/emails';

export type MailKind = 'transactional' | 'broadcast';

export type SendResult =
  | { sent: true; id: string }
  | { sent: false; reason: 'quota' }
  | { sent: false; reason: 'rejected'; status: number; detail: string };

export interface MailerDeps {
  apiKey: string;
  from: string;
  /** 客服回信地址。买家直接回复交付邮件时落到这个邮箱，而不是 noreply。 */
  replyTo?: string;
  pool: Pool;
  /** 群发当天的上限。剩下到硬顶之间的额度留给交易邮件。 */
  dailyBudget: number;
  fetch?: typeof globalThis.fetch;
  now?(): Date;
}

export interface Envelope {
  to: string;
  subject: string;
  text: string;
  kind: MailKind;
}

/**
 * 发一封信，先占额度再发。
 *
 * 额度占用不会因发信失败而退还：请求失败与「发出去了但没收到回执」
 * 从这一侧分辨不出来，退还就有越过供应商硬顶的风险，而越过之后的邮件
 * 是被直接拒收的。多烧一个名额的代价只是当天少发一封更新通知，
 * 上限本来就留了 20 封的余量。
 *
 * 配额耗尽返回 quota 而不抛错：那不是故障，是当天该停了，
 * 调用方据此把剩下的收件人排到次日。
 */
export async function sendMail(deps: MailerDeps, env: Envelope): Promise<SendResult> {
  const cap =
    env.kind === 'broadcast' ? Math.min(deps.dailyBudget, HARD_DAILY_CAP) : HARD_DAILY_CAP;
  const day = utcDay(deps.now ? deps.now() : new Date());

  if (!(await reserveQuota(deps.pool, day, cap))) {
    return { sent: false, reason: 'quota' };
  }

  const doFetch = deps.fetch ?? globalThis.fetch;
  let res: Response;
  try {
    res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${deps.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: deps.from,
        to: [env.to],
        subject: env.subject,
        text: env.text,
        // 未配置时不带这个字段：Resend 对空字符串 reply_to 会报 422。
        ...(deps.replyTo ? { reply_to: deps.replyTo } : {}),
      }),
    });
  } catch (err) {
    // status 0 表示请求没走到对端。调用方要重试就自己重试，
    // 但这一封的额度已经算出去了。
    return { sent: false, reason: 'rejected', status: 0, detail: brief(err) };
  }

  if (!res.ok) {
    return { sent: false, reason: 'rejected', status: res.status, detail: await reason(res) };
  }

  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  return { sent: true, id: body?.id ?? '' };
}

/** 只取供应商给的 message 字段，避免把可能含收件人地址的整段响应带出去。 */
async function reason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown; error?: { message?: unknown } };
    const msg = body.error?.message ?? body.message;
    return typeof msg === 'string' ? msg.slice(0, 200) : '';
  } catch {
    return '';
  }
}

function brief(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : '';
}
