import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { releasesListRoute } from '../src/routes/admin-releases.ts';

const TOKEN = 'admin-token-0123456789abcdef';

interface Seed {
  id: string;
  skillId: string;
  version: string;
  publishedAt: string;
  archivedAt?: string;
}

const SEEDS: Seed[] = [
  {
    id: '1',
    skillId: 'lesson-workflow',
    version: '1.0.0',
    publishedAt: '2026-09-18T08:00:00Z',
    archivedAt: '2026-09-18T08:02:00Z',
  },
  { id: '2', skillId: 'ppt-workflow', version: '1.1.0', publishedAt: '2026-09-20T09:00:00Z' },
];

function fakePool(seeds: Seed[] = SEEDS) {
  const seen: { sql: string; params: unknown[] }[] = [];
  const pool = {
    async query(sql: string, params: unknown[] = []) {
      seen.push({ sql: sql.trim(), params });
      if (!sql.trim().startsWith('SELECT * FROM releases ORDER BY published_at DESC')) {
        throw new Error(`未预期的 SQL：${sql}`);
      }
      const limit = params[0] as number;
      return {
        rows: [...seeds]
          .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
          .slice(0, limit)
          .map((s) => ({
            id: s.id,
            skill_id: s.skillId,
            version: s.version,
            sha256: 'a'.repeat(64),
            size_bytes: 230_000,
            r2_key: `masters/${s.skillId}/${s.version}.zip`,
            changelog_en: 'Worksheet answer keys now ship with every lesson.',
            changelog_ko: '이제 모든 수업에 정답지가 함께 제공됩니다.',
            published_at: new Date(s.publishedAt),
            archived_at: s.archivedAt ? new Date(s.archivedAt) : null,
          })),
      };
    },
  } as unknown as Pool;
  return { pool, seen };
}

function fakeRes() {
  const state = { status: 0, headers: {} as Record<string, string>, body: '' };
  const res = {
    writeHead(status: number, headers: Record<string, string>) {
      state.status = status;
      state.headers = headers;
    },
    end(chunk?: string) {
      state.body = chunk ?? '';
    },
  } as unknown as ServerResponse;
  return { res, state };
}

async function get(pool: Pool, token: string | null = TOKEN) {
  const headers: Record<string, string> = {};
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const req = Object.assign(Readable.from([]), {
    method: 'GET',
    url: '/api/admin/releases',
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage;

  const { res, state } = fakeRes();
  await releasesListRoute({ adminToken: TOKEN, pool })({
    req,
    res,
    url: new URL('https://tryteachflow.com/api/admin/releases'),
    params: {},
    clientIp: '127.0.0.1',
  });
  return { state, body: state.body === '' ? null : JSON.parse(state.body) };
}

describe('releasesListRoute', () => {
  it('列出全部版本，最新发布的在前', async () => {
    const { pool } = fakePool();
    const { state, body } = await get(pool);

    expect(state.status).toBe(200);
    expect(body.releases.map((r: { skill: string }) => r.skill)).toEqual([
      'ppt-workflow',
      'lesson-workflow',
    ]);
  });

  it('每条带上核对发版所需的字段', async () => {
    const { pool } = fakePool();
    const { body } = await get(pool);

    expect(body.releases[1]).toEqual({
      id: '1',
      skill: 'lesson-workflow',
      version: '1.0.0',
      sha256: 'a'.repeat(64),
      size_bytes: 230_000,
      published_at: '2026-09-18T08:00:00.000Z',
      archived_at: '2026-09-18T08:02:00.000Z',
    });
  });

  it('还没归档的那条 archived_at 是 null', async () => {
    const { pool } = fakePool();
    const { body } = await get(pool);
    expect(body.releases[0].archived_at).toBeNull();
  });

  it('不回 changelog——核对的是版本，不是正文', async () => {
    const { pool } = fakePool();
    const { state } = await get(pool);
    expect(state.body).not.toContain('answer keys');
    expect(state.body).not.toContain('정답지');
  });

  it('带上条数上限，让调用方知道结果可能被截断', async () => {
    const { pool, seen } = fakePool();
    const { body } = await get(pool);
    expect(body.limit).toBe(200);
    expect(seen[0]!.params).toEqual([200]);
  });

  it('没有 token 时 401，且不查库', async () => {
    const { pool, seen } = fakePool();
    const { state, body } = await get(pool, null);

    expect(state.status).toBe(401);
    expect(body.error.code).toBe('unauthorized');
    expect(seen).toEqual([]);
  });

  it('token 不对时 401', async () => {
    const { pool } = fakePool();
    const { state } = await get(pool, 'admin-token-0123456789abcdeF');
    expect(state.status).toBe(401);
  });

  it('长度不同的 token 也是 401，不抛错', async () => {
    const { pool } = fakePool();
    const { state } = await get(pool, 'short');
    expect(state.status).toBe(401);
  });

  it('一条发版记录都没有时回空数组', async () => {
    const { pool } = fakePool([]);
    const { state, body } = await get(pool);
    expect(state.status).toBe(200);
    expect(body.releases).toEqual([]);
  });
});
