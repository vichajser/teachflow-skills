import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

/**
 * Resend 免费版的硬顶：每 UTC 日历日 100 封，To/CC/BCC 每个收件人单独计数。
 * 交易邮件也越不过它——越过了就是被供应商拒收，不是排队。
 */
export const HARD_DAILY_CAP = 100;

/** 配额按 UTC 日历日重置，不是按本地时区。 */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * 占一个配额名额。真发信之前调用——先发后记的话，进程在中间挂掉
 * 就会少记一封，当天末尾正好把我们推过供应商的硬顶。
 *
 * 自增与上限判断在同一条语句里完成，并发下不会两个 worker 同时读到
 * 79 再各自加一。
 */
export async function reserveQuota(db: Queryable, day: string, cap: number): Promise<boolean> {
  if (cap <= 0) return false;
  const { rows } = await db.query(
    `INSERT INTO email_quota (day, sent) VALUES ($1, 1)
     ON CONFLICT (day) DO UPDATE SET sent = email_quota.sent + 1
       WHERE email_quota.sent < $2
     RETURNING sent`,
    [day, cap],
  );
  return rows.length > 0;
}

export async function quotaUsed(db: Queryable, day: string): Promise<number> {
  const { rows } = await db.query('SELECT sent FROM email_quota WHERE day = $1', [day]);
  return rows[0] ? Number(rows[0].sent) : 0;
}
