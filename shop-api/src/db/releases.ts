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
