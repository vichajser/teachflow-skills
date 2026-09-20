import pg from 'pg';

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

let pool: pg.Pool | null = null;

export function getPool(databaseUrl: string): pg.Pool {
  if (pool) return pool;
  pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  // 空闲连接被服务端掐断不应该让进程崩掉。
  pool.on('error', (err) => {
    console.error('[db] idle client error:', err.message);
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}

/** 在一个事务里跑 fn。抛错即回滚，不吞异常。 */
export async function withTransaction<T>(
  p: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // 回滚本身失败说明连接已废，交给 release 丢弃。
    }
    throw err;
  } finally {
    client.release();
  }
}
