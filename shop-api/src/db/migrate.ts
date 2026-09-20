import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, DEFAULT_BUNDLE_SKILL_IDS } from '../config.ts';
import { getPool, closePool } from './pool.ts';
import type { Pool } from './pool.ts';

const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

async function ensureLedger(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function runMigrations(pool: Pool): Promise<string[]> {
  await ensureLedger(pool);
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set(
    (await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
      (r) => r.filename,
    ),
  );

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`迁移 ${file} 失败：${(err as Error).message}`, { cause: err });
    } finally {
      client.release();
    }
    ran.push(file);
  }
  return ran;
}

/** 登记 bundle 里的 skill id。releases 与 entitlements 都外键指向它。 */
export async function seedSkills(pool: Pool, ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    await pool.query('INSERT INTO skills (id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
  }
}

if (import.meta.filename === process.argv[1]) {
  const config = loadConfig();
  const pool = getPool(config.databaseUrl);
  const ran = await runMigrations(pool);
  await seedSkills(pool, config.bundleSkillIds ?? DEFAULT_BUNDLE_SKILL_IDS);
  console.log(ran.length === 0 ? '无待执行迁移。' : `已执行：${ran.join(', ')}`);
  await closePool();
}
