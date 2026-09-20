import type { Pool, PoolClient } from 'pg';
import type { Lang } from '../lib/legal.ts';

type Queryable = Pool | PoolClient;

export interface Recipient {
  orderId: string;
  email: string;
  locale: Lang;
}

/**
 * 某个版本还欠谁一封更新通知。
 *
 * 三个条件各自挡掉一类不该发的信：
 *   - status = 'paid'：退款与拒付的订单不再收任何东西。
 *   - created_at < published_at：发版之后才下单的人，拿到的下载页本来就是新版，
 *     再告诉他「有更新」是在说一件他已经知道的事。spec §3.4 第一步没写这条，
 *     但任务重跑（配额顺延、reconcile 补做）时中间新增的订单会正好落进来。
 *   - 不在 update_notices 里：已发的不重发，这是「已发部分不重发」的全部实现。
 * entitlements 的 join 决定了「这个 skill 归谁」——现在六个 skill 人人都有，
 * 将来若拆包，这条查询不用改。
 */
export async function pendingRecipients(
  db: Queryable,
  release: { id: string; skillId: string; publishedAt: Date },
): Promise<Recipient[]> {
  const { rows } = await db.query(
    `SELECT o.id, o.buyer_email, o.locale
       FROM orders o
       JOIN entitlements e ON e.order_id = o.id AND e.skill_id = $2
      WHERE o.status = 'paid'
        AND o.created_at < $3
        AND NOT EXISTS (
          SELECT 1 FROM update_notices n
           WHERE n.order_id = o.id AND n.release_id = $1
        )
      ORDER BY o.created_at`,
    [release.id, release.skillId, release.publishedAt],
  );
  return rows.map((r) => ({
    orderId: r.id as string,
    email: r.buyer_email as string,
    locale: r.locale === 'ko' ? 'ko' : 'en',
  }));
}

/**
 * 记一笔「这封已经了结」。
 *
 * ON CONFLICT DO NOTHING 是因为主键就是 (order_id, release_id)：
 * 任务重跑时撞上自己上一轮写的行不算错误。
 */
export async function recordNotice(
  db: Queryable,
  orderId: string,
  releaseId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO update_notices (order_id, release_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [orderId, releaseId],
  );
}

/**
 * 还欠着更新通知的版本。reconcile 用它找出「投递丢了」的发版。
 *
 * since 之前的版本不再补发：隔了那么久才说「有更新」，消息本身已经没用了，
 * 而买家任何时候进下载页拿到的都是最新版。
 */
export async function releasesOwedNotices(
  db: Queryable,
  since: Date,
): Promise<{ id: string; skillId: string; version: string }[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT r.id, r.skill_id, r.version
       FROM releases r
       JOIN entitlements e ON e.skill_id = r.skill_id
       JOIN orders o ON o.id = e.order_id
      WHERE r.published_at >= $1
        AND o.status = 'paid'
        AND o.created_at < r.published_at
        AND NOT EXISTS (
          SELECT 1 FROM update_notices n
           WHERE n.order_id = o.id AND n.release_id = r.id
        )`,
    [since],
  );
  return rows.map((r) => ({
    id: String(r.id),
    skillId: r.skill_id as string,
    version: r.version as string,
  }));
}
