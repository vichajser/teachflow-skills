import type { Pool, PoolClient } from 'pg';
import { compareSemver } from '../lib/frontmatter.ts';

export interface ReleaseRow {
  id: string;
  skillId: string;
  version: string;
  sha256: string;
  sizeBytes: number;
  r2Key: string;
  changelogEn: string;
  changelogKo: string;
  publishedAt: Date;
  /** 推到 R2 的时刻。null = 还没归档，reconcile 会补做。 */
  archivedAt: Date | null;
}

type Queryable = Pool | PoolClient;

function toRow(r: Record<string, unknown>): ReleaseRow {
  return {
    id: String(r.id),
    skillId: r.skill_id as string,
    version: r.version as string,
    sha256: r.sha256 as string,
    sizeBytes: Number(r.size_bytes),
    r2Key: r.r2_key as string,
    changelogEn: r.changelog_en as string,
    changelogKo: r.changelog_ko as string,
    publishedAt: r.published_at as Date,
    archivedAt: (r.archived_at as Date | null | undefined) ?? null,
  };
}

export async function listVersions(db: Queryable, skillId: string): Promise<string[]> {
  const { rows } = await db.query('SELECT version FROM releases WHERE skill_id = $1', [skillId]);
  return rows.map((r) => r.version as string);
}

/**
 * 当前最高版本。用 semver 在应用层排序而不是 SQL 的字符串排序——
 * `ORDER BY version DESC` 会把 1.10.0 排在 1.9.0 前面之外的地方，是个静默的错。
 */
export async function latestVersion(db: Queryable, skillId: string): Promise<string | null> {
  const versions = await listVersions(db, skillId);
  if (versions.length === 0) return null;
  return versions.reduce((a, b) => (compareSemver(a, b) >= 0 ? a : b));
}

export async function latestRelease(db: Queryable, skillId: string): Promise<ReleaseRow | null> {
  const version = await latestVersion(db, skillId);
  if (!version) return null;
  return getRelease(db, skillId, version);
}

export async function getRelease(
  db: Queryable,
  skillId: string,
  version: string,
): Promise<ReleaseRow | null> {
  const { rows } = await db.query(
    'SELECT * FROM releases WHERE skill_id = $1 AND version = $2',
    [skillId, version],
  );
  return rows[0] ? toRow(rows[0]) : null;
}

/** 按主键取。后台任务拿到的是 release id，不是 (skill, version)。 */
export async function getReleaseById(db: Queryable, id: string): Promise<ReleaseRow | null> {
  const { rows } = await db.query('SELECT * FROM releases WHERE id = $1', [id]);
  return rows[0] ? toRow(rows[0]) : null;
}

/**
 * 还没归档到 R2 的版本，按发布时间从早到晚。
 *
 * before 用来避开「刚发布、archive-master 正在跑」的那几行——
 * 不避开的话 reconcile 会和正常任务抢同一个上传，多一次无谓的 PUT。
 */
export async function unarchivedReleases(
  db: Queryable,
  before: Date,
  limit: number,
): Promise<ReleaseRow[]> {
  const { rows } = await db.query(
    `SELECT * FROM releases
      WHERE archived_at IS NULL AND published_at < $1
      ORDER BY published_at
      LIMIT $2`,
    [before, limit],
  );
  return rows.map(toRow);
}

/** 归档成功后落一笔时间。已经有值就不动——重复归档不该改写首次成功的时刻。 */
export async function markArchived(db: Queryable, id: string, at: Date): Promise<void> {
  await db.query('UPDATE releases SET archived_at = $2 WHERE id = $1 AND archived_at IS NULL', [
    id,
    at,
  ]);
}

/**
 * 全部版本，最新发布的在前。发版 CLI 用它核对「我刚发的那一版进去了没有」，
 * 所以排序按 published_at 而不是 semver：人要找的是刚才那一次操作。
 */
export async function allReleases(db: Queryable, limit: number): Promise<ReleaseRow[]> {
  const { rows } = await db.query(
    'SELECT * FROM releases ORDER BY published_at DESC, skill_id LIMIT $1',
    [limit],
  );
  return rows.map(toRow);
}

export interface NewRelease {
  skillId: string;
  version: string;
  sha256: string;
  sizeBytes: number;
  r2Key: string;
  changelogEn: string;
  changelogKo: string;
}

export class VersionConflict extends Error {}

/**
 * 插入新版本。UNIQUE (skill_id, version) 是最后一道闸：路由层已经查过一次，
 * 但两次并发上传只有靠数据库才拦得住。永不 UPSERT——已售版本不可变。
 */
export async function insertRelease(db: Queryable, release: NewRelease): Promise<ReleaseRow> {
  try {
    const { rows } = await db.query(
      `INSERT INTO releases
         (skill_id, version, sha256, size_bytes, r2_key, changelog_en, changelog_ko)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        release.skillId,
        release.version,
        release.sha256,
        release.sizeBytes,
        release.r2Key,
        release.changelogEn,
        release.changelogKo,
      ],
    );
    return toRow(rows[0]!);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new VersionConflict(`${release.skillId}@${release.version} 已存在`);
    }
    throw err;
  }
}
