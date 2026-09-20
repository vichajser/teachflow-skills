import type { Pool } from 'pg';
import { signToken } from '../lib/token.ts';
import { sendMail, type MailerDeps } from '../lib/mailer.ts';
import { updateMail } from '../lib/emails.ts';
import { getReleaseById } from '../db/releases.ts';
import { pendingRecipients, recordNotice } from '../db/notices.ts';

export interface NotifyData {
  releaseId: string;
}

export interface NotifyDeps {
  pool: Pool;
  mailer: MailerDeps;
  tokenSecret: string;
  ttlDays: number;
  publicBaseUrl: string;
  now?(): Date;
  /** 把剩下的收件人排到 at 重跑。worker 注入，落到 pg-boss 的 startAfter。 */
  reschedule(at: Date, data: NotifyData): Promise<void>;
}

export interface NotifyResult {
  /** 本次发出去的封数。 */
  sent: number;
  /** 被对端永久拒收、已记账不再重试的封数。 */
  dropped: number;
  /** 还欠着的封数。 */
  remaining: number;
  /** 顺延到的时刻；没顺延就是 null。 */
  rescheduledAt: Date | null;
}

/**
 * 当天配额用尽后，下一次该开工的时刻：次日 UTC 00:05。
 *
 * email_quota 的 day 是 UTC 日历日，用尽的永远是 now 所在那一天的额度，
 * 所以答案只取决于 now 的日期，与它的时刻无关——哪怕是 00:01 就发完了，
 * 也得等到第二天，当天剩下的 23 小时 59 分钟里再怎么试都是同一个上限。
 * 推迟五分钟纯粹是不想踩在换日边界上：时钟差几秒就会白跑一趟。
 */
export function nextQuotaWindow(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5, 0, 0),
  );
}

/** 0 是请求没走到对端，429 与 5xx 是对端让你等会儿再来。其余都当永久失败。 */
function transient(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

/**
 * 给老买家发版本更新通知。spec §3.4。
 *
 * 与 spec 第 3 步的字面写法有一处出入，是刻意的：spec 说「发送成功后写
 * update_notices 并把 email_quota.sent 加一（同一事务）」，而这里的额度是
 * 发信之前就占掉的（sendMail 里的 reserveQuota）。先发后记的话，两个并发的
 * worker 会同时读到同一个余额，一起越过供应商每日 100 封的硬顶，而越顶之后
 * 的信是被直接拒收的。少算一封的代价只是当天少发一封——上限本来就留了余量。
 * 「已发部分不重发」由 update_notices 保证，这一点与 spec 完全一致。
 */
export async function notifyUpdate(deps: NotifyDeps, data: NotifyData): Promise<NotifyResult> {
  const idle: NotifyResult = { sent: 0, dropped: 0, remaining: 0, rescheduledAt: null };

  const release = await getReleaseById(deps.pool, data.releaseId);
  // 发版记录没了就没有可通知的内容，重试也变不出来。
  if (!release) return idle;

  const queue = await pendingRecipients(deps.pool, release);
  if (queue.length === 0) return idle;

  const now = deps.now ? deps.now() : new Date();
  let sent = 0;
  let dropped = 0;

  for (let i = 0; i < queue.length; i += 1) {
    const to = queue[i]!;
    const token = signToken(deps.tokenSecret, {
      orderId: to.orderId,
      ttlDays: deps.ttlDays,
      now: now.getTime(),
    });
    const mail = updateMail({
      lang: to.locale,
      skillId: release.skillId,
      version: release.version,
      changelog: to.locale === 'ko' ? release.changelogKo : release.changelogEn,
      downloadUrl: `${deps.publicBaseUrl}/download?t=${encodeURIComponent(token)}`,
    });

    const result = await sendMail(deps.mailer, {
      to: to.email,
      subject: mail.subject,
      text: mail.text,
      kind: 'broadcast',
    });

    if (result.sent) {
      await recordNotice(deps.pool, to.orderId, release.id);
      sent += 1;
      continue;
    }

    if (result.reason === 'quota') {
      // 当天到顶了。这不是故障：把剩下的排到次日，已发的那些下次查不出来。
      const at = nextQuotaWindow(now);
      await deps.reschedule(at, data);
      return { sent, dropped, remaining: queue.length - i, rescheduledAt: at };
    }

    if (transient(result.status)) {
      // 供应商那边出问题时，接着往下发只会把当天剩余额度烧在同样的失败上。
      // 抛出去交给 pg-boss 退避重试；收件人地址不进日志。
      throw new Error(
        `更新通知投递失败：status ${result.status}，${release.skillId}@${release.version} 还欠 ${queue.length - i} 封。`,
      );
    }

    // 地址被永久拒收（不存在、被封、格式对但投不进去）。记一笔当作了结，
    // 否则这个地址会每天重试、每天白占一个额度，而结果永远一样。
    await recordNotice(deps.pool, to.orderId, release.id);
    dropped += 1;
  }

  return { sent, dropped, remaining: 0, rescheduledAt: null };
}
