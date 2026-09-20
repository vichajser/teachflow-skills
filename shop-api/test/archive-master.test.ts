import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { archiveMaster } from '../src/jobs/archive-master.ts';
import { reconcile } from '../src/jobs/reconcile.ts';
import { StorageError, type Storage } from '../src/lib/storage.ts';

const NOW = new Date('2026-09-20T15:00:00Z');
const MASTER = Buffer.from('PK pretend this is a zip');

interface ReleaseSeed {
  id: string;
  skillId: string;
  version: string;
  publishedAt: Date;
  archivedAt?: Date | null;
}

const ONE: ReleaseSeed = {
  id: '7',
  skillId: 'lesson-workflow',
  version: '1.2.0',
  publishedAt: new Date('2026-09-20T09:00:00Z'),
};

function row(r: ReleaseSeed) {
  return {
    id: r.id,
    skill_id: r.skillId,
    version: r.version,
    sha256: 'a'.repeat(64),
    size_bytes: MASTER.length,
    r2_key: `masters/${r.skillId}/${r.version}.zip`,
    changelog_en: 'en',
    changelog_ko: 'ko',
    published_at: r.publishedAt,
    archived_at: r.archivedAt ?? null,
  };
}

/** 内存版 Postgres：只认归档与补救扫描这两条路径发出的语句。 */
function fakeDb(releases: ReleaseSeed[], owed: { id: string; skillId: string; version: string }[] = []) {
  const marked: { id: string; at: Date }[] = [];

  const pool = {
    async query(sql: string, params: unknown[] = []) {
      const text = sql.trim();

      if (text.startsWith('SELECT * FROM releases WHERE skill_id')) {
        const found = releases.find((r) => r.skillId === params[0] && r.version === params[1]);
        return { rows: found ? [row(found)] : [] };
      }

      if (text.startsWith('SELECT * FROM releases')) {
        // unarchivedReleases：未归档、且发布时间早于 before。
        const before = params[0] as Date;
        const limit = params[1] as number;
        return {
          rows: releases
            .filter((r) => !r.archivedAt && r.publishedAt < before)
            .slice(0, limit)
            .map(row),
        };
      }

      if (text.startsWith('UPDATE releases SET archived_at')) {
        marked.push({ id: params[0] as string, at: params[1] as Date });
        return { rows: [] };
      }

      if (text.startsWith('SELECT DISTINCT r.id')) {
        return { rows: owed.map((o) => ({ id: o.id, skill_id: o.skillId, version: o.version })) };
      }

      throw new Error(`未预期的 SQL：${text}`);
    },
  } as unknown as Pool;

  return { pool, marked };
}

function fakeStorage(over: Partial<Storage> = {}) {
  const archived: { skillId: string; version: string; bytes: number }[] = [];
  const storage: Storage = {
    async putMaster() {},
    async archiveMaster(skillId, version, buf) {
      archived.push({ skillId, version, bytes: buf.length });
    },
    async getMaster() {
      return MASTER;
    },
    async probe() {
      return true;
    },
    ...over,
  };
  return { storage, archived };
}

describe('archiveMaster', () => {
  it('把本地母版原样推到 R2 并记下归档时刻', async () => {
    const db = fakeDb([ONE]);
    const { storage, archived } = fakeStorage();

    const outcome = await archiveMaster({ pool: db.pool, storage, now: () => NOW }, ONE);

    expect(outcome).toBe('archived');
    expect(archived).toEqual([{ skillId: 'lesson-workflow', version: '1.2.0', bytes: MASTER.length }]);
    expect(db.marked).toEqual([{ id: '7', at: NOW }]);
  });

  it('已经归档过就什么都不做——重投一次不该再上传一遍', async () => {
    const db = fakeDb([{ ...ONE, archivedAt: new Date('2026-09-20T09:05:00Z') }]);
    const { storage, archived } = fakeStorage();

    const outcome = await archiveMaster({ pool: db.pool, storage }, ONE);

    expect(outcome).toBe('already');
    expect(archived).toEqual([]);
    expect(db.marked).toEqual([]);
  });

  it('库里没有这条发版记录时收工，不抛错去触发重试', async () => {
    const db = fakeDb([]);
    const { storage, archived } = fakeStorage();

    expect(await archiveMaster({ pool: db.pool, storage }, ONE)).toBe('missing');
    expect(archived).toEqual([]);
  });

  it('R2 出错时抛出去交给队列重试，且不落归档时刻', async () => {
    const db = fakeDb([ONE]);
    const { storage } = fakeStorage({
      async archiveMaster() {
        throw new StorageError('R2 502');
      },
    });

    await expect(archiveMaster({ pool: db.pool, storage }, ONE)).rejects.toThrow('R2 502');
    expect(db.marked).toEqual([]);
  });
});

describe('reconcile', () => {
  it('把还没归档、且已经过了缓冲期的版本重新排进队列', async () => {
    const db = fakeDb([ONE]);
    const jobs: { job: string; data: Record<string, unknown> }[] = [];

    const result = await reconcile({
      pool: db.pool,
      now: () => NOW,
      async enqueue(job, data) {
        jobs.push({ job, data });
      },
    });

    expect(result.archives).toEqual(['lesson-workflow@1.2.0']);
    expect(jobs).toEqual([
      { job: 'archive-master', data: { skillId: 'lesson-workflow', version: '1.2.0' } },
    ]);
  });

  it('刚发布不到一小时的版本先不碰——正常任务多半正在跑', async () => {
    const db = fakeDb([{ ...ONE, publishedAt: new Date('2026-09-20T14:30:00Z') }]);
    const jobs: string[] = [];

    const result = await reconcile({
      pool: db.pool,
      now: () => NOW,
      async enqueue(job) {
        jobs.push(job);
      },
    });

    expect(result.archives).toEqual([]);
    expect(jobs).toEqual([]);
  });

  it('把还欠着更新通知的版本重新排进队列', async () => {
    const db = fakeDb([{ ...ONE, archivedAt: NOW }], [{ id: '7', skillId: 'lesson-workflow', version: '1.2.0' }]);
    const jobs: { job: string; data: Record<string, unknown> }[] = [];

    const result = await reconcile({
      pool: db.pool,
      now: () => NOW,
      async enqueue(job, data) {
        jobs.push({ job, data });
      },
    });

    expect(result.notices).toEqual(['7']);
    expect(jobs).toEqual([
      {
        job: 'notify-update',
        data: { releaseId: '7', skillId: 'lesson-workflow', version: '1.2.0' },
      },
    ]);
  });

  it('没有欠账时不投任何任务', async () => {
    const db = fakeDb([{ ...ONE, archivedAt: NOW }]);
    const jobs: string[] = [];

    const result = await reconcile({
      pool: db.pool,
      now: () => NOW,
      async enqueue(job) {
        jobs.push(job);
      },
    });

    expect(result).toEqual({ archives: [], notices: [] });
    expect(jobs).toEqual([]);
  });
});
