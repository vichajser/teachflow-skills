import { sendJson } from '../http/respond.ts';
import type { Handler } from '../http/router.ts';
import type { Pool } from '../db/pool.ts';

export interface HealthDeps {
  pool: Pool;
  /** 返回 true 表示对象存储可达。探测失败不应让整个健康检查抛错。 */
  probeStorage: () => Promise<boolean>;
}

async function probeDb(pool: Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function probeQueue(pool: Pool): Promise<boolean> {
  try {
    const r = await pool.query<{ ok: boolean }>(
      "SELECT to_regclass('pgboss.job') IS NOT NULL AS ok",
    );
    return r.rows[0]?.ok === true;
  } catch {
    return false;
  }
}

export function healthRoute(deps: HealthDeps): Handler {
  return async ({ res }) => {
    const [db, queue, r2] = await Promise.all([
      probeDb(deps.pool),
      probeQueue(deps.pool),
      deps.probeStorage().catch(() => false),
    ]);
    // R2 只是归档副本，不可达不影响发版与下载，所以不计入 ok。
    const ok = db && queue;
    sendJson(res, ok ? 200 : 503, { ok, db, queue, r2 });
  };
}
