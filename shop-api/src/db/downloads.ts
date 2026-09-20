import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

export interface DownloadRecord {
  orderId: string;
  skillId: string;
  version: string;
  ip: string;
  userAgent: string | null;
}

// UA 是买家自己送来的字符串，长度没有上限。截断而不是拒绝：
// 这一行是取证记录，不是输入校验点。
const UA_LIMIT = 512;

/**
 * IP 列是 inet 类型，塞进去的值格式不对整条 INSERT 会失败。
 * X-Forwarded-For 正常由 Caddy 写入，但它终究是个请求头——
 * 一个畸形的头不该让一笔已付款的下载失败，所以退回 0.0.0.0 记账。
 */
function inet(value: string): string {
  const v4 = /^\d{1,3}(\.\d{1,3}){3}$/;
  const v6 = /^[0-9a-fA-F:]+$/;
  if (v4.test(value) && value.split('.').every((p) => Number(p) <= 255)) return value;
  if (value.includes(':') && v6.test(value)) return value;
  return '0.0.0.0';
}

/**
 * 记一次下载。退款争议时这张表是我方唯一的交付证据，
 * 所以它写在流式返回之前——写不进去就不发文件。
 */
export async function recordDownload(db: Queryable, rec: DownloadRecord): Promise<void> {
  await db.query(
    `INSERT INTO downloads (order_id, skill_id, version, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      rec.orderId,
      rec.skillId,
      rec.version,
      inet(rec.ip),
      rec.userAgent === null ? null : rec.userAgent.slice(0, UA_LIMIT),
    ],
  );
}

/** 某订单下载过的次数。resend-link 与人工排查都用得到。 */
export async function downloadCount(db: Queryable, orderId: string): Promise<number> {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM downloads WHERE order_id = $1', [
    orderId,
  ]);
  return rows[0] ? Number(rows[0].n) : 0;
}
