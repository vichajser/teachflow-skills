import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

export interface Limit {
  /** 窗口内允许的次数。 */
  max: number;
  /** 窗口长度，毫秒。 */
  windowMs: number;
}

/**
 * 固定窗口计数器，状态放在 rate_limits 表里。
 *
 * 不用内存计数，是因为 API 与 worker 是两个进程，且重启不该把限流清零——
 * 重启清零正好是攻击者能制造的条件。固定窗口在边界上允许两倍突发，
 * 对「防邮箱枚举、防邮件轰炸」这个用途够用，不值得换成滑动窗口的额外一次写。
 */
export async function hit(db: Queryable, key: string, limit: Limit, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - limit.windowMs);
  const { rows } = await db.query(
    `INSERT INTO rate_limits (key, hits, window_start) VALUES ($1, 1, $2)
     ON CONFLICT (key) DO UPDATE SET
       hits = CASE WHEN rate_limits.window_start < $3 THEN 1 ELSE rate_limits.hits + 1 END,
       window_start = CASE WHEN rate_limits.window_start < $3 THEN $2 ELSE rate_limits.window_start END
     RETURNING hits`,
    [key, now, cutoff],
  );
  const hits = rows[0] ? Number(rows[0].hits) : 0;
  return hits <= limit.max;
}

/**
 * 邮箱的限流键。
 *
 * 存哈希不存原文：这张表没有业务价值，却会攒下一份「谁在找回链接」的名单。
 * 大小写与首尾空格先规整，否则 Teacher@x 和 teacher@x 会各占一个配额，
 * 而 orders.buyer_email 是 citext，两者本来指向同一个人。
 */
export function emailKey(email: string): string {
  const digest = createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex');
  return `email:${digest}`;
}

export function ipKey(ip: string): string {
  return `ip:${ip}`;
}

/** 清掉窗口已经过去的行。由 worker 每天调一次，免得这张表只增不减。 */
export async function pruneRateLimits(db: Queryable, before: Date): Promise<number> {
  const res = await db.query('DELETE FROM rate_limits WHERE window_start < $1', [before]);
  return res.rowCount ?? 0;
}
