import type { Pool, PoolClient } from 'pg';
import type { NormalizedOrderEvent } from '../mor/types.ts';

export type OrderStatus = 'paid' | 'refunded' | 'chargeback';

export interface OrderRow {
  id: string;
  provider: string;
  buyerEmail: string;
  amountCents: number;
  currency: string;
  locale: 'en' | 'ko';
  status: OrderStatus;
  createdAt: Date;
}

type Queryable = Pool | PoolClient;

function toRow(r: Record<string, unknown>): OrderRow {
  return {
    id: r.id as string,
    provider: r.provider as string,
    buyerEmail: r.buyer_email as string,
    amountCents: Number(r.amount_cents),
    currency: r.currency as string,
    locale: r.locale as 'en' | 'ko',
    status: r.status as OrderStatus,
    createdAt: r.created_at as Date,
  };
}

export async function getOrder(db: Queryable, id: string): Promise<OrderRow | null> {
  const { rows } = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
  return rows[0] ? toRow(rows[0]) : null;
}

/** 某邮箱名下所有已付款订单。citext 列，比较本身就不分大小写。 */
export async function paidOrdersByEmail(db: Queryable, email: string): Promise<OrderRow[]> {
  const { rows } = await db.query(
    "SELECT * FROM orders WHERE buyer_email = $1 AND status = 'paid' ORDER BY created_at DESC",
    [email],
  );
  return rows.map(toRow);
}

export async function hasEntitlement(
  db: Queryable,
  orderId: string,
  skillId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM entitlements e
       JOIN orders o ON o.id = e.order_id
      WHERE e.order_id = $1 AND e.skill_id = $2 AND o.status = 'paid'`,
    [orderId, skillId],
  );
  return rows.length > 0;
}

export type ApplyResult = 'applied' | 'duplicate' | 'ignored' | 'unknown_order';

export interface ApplyArgs {
  provider: string;
  eventId: string;
  payload: unknown;
  /** null 表示验签通过但我们不关心这个事件，仅登记去重。 */
  event: NormalizedOrderEvent | null;
  skillIds: readonly string[];
}

/**
 * 落地一个已验签的 webhook 事件。
 *
 * 登记与处理放在同一个事务里，是为了不出现「事件已记、订单没建」的组合：
 * 那种状态下供应商重投会拿到 duplicate，订单就永远补不回来了。
 *
 * 退款/争议落到一个不存在的订单时整体回滚，让调用方回非 200。
 * 乱序投递（退款先于付款到达）靠供应商重投自愈；订单真的不存在，
 * 那是一桩需要人看的异常，宁可让它在后台报错，也不要静默吞掉一笔退款。
 */
export async function applyWebhookEvent(pool: Pool, args: ApplyArgs): Promise<ApplyResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const logged = await client.query(
      `INSERT INTO webhook_events (provider, event_id, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (provider, event_id) DO NOTHING`,
      [args.provider, args.eventId, JSON.stringify(args.payload)],
    );
    if (logged.rowCount === 0) {
      await client.query('ROLLBACK');
      return 'duplicate';
    }

    const event = args.event;
    if (!event) {
      await client.query('COMMIT');
      return 'ignored';
    }

    if (event.kind === 'paid') {
      await client.query(
        `INSERT INTO orders (id, provider, buyer_email, amount_cents, currency, locale, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'paid')
         ON CONFLICT (id) DO NOTHING`,
        [
          event.orderId,
          args.provider,
          event.email,
          event.amountCents,
          event.currency,
          event.locale,
        ],
      );
      // 一次性写齐整个捆绑包。ON CONFLICT DO NOTHING 让补发同一订单也安全。
      await client.query(
        `INSERT INTO entitlements (order_id, skill_id)
         SELECT $1, s FROM unnest($2::text[]) AS s
         ON CONFLICT DO NOTHING`,
        [event.orderId, [...args.skillIds]],
      );
      await client.query('COMMIT');
      return 'applied';
    }

    const status: OrderStatus = event.kind === 'refunded' ? 'refunded' : 'chargeback';
    const updated = await client.query('UPDATE orders SET status = $2 WHERE id = $1', [
      event.orderId,
      status,
    ]);
    if (updated.rowCount === 0) {
      await client.query('ROLLBACK');
      return 'unknown_order';
    }
    await client.query('COMMIT');
    return 'applied';
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
