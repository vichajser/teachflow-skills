import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { adminReleasesRoute, type ReleaseDeps } from '../src/routes/admin-releases.ts';
import { buildZip } from '../src/lib/zip.ts';
import type { Storage } from '../src/lib/storage.ts';
import { buildMultipart } from './helpers/multipart-body.ts';

const TOKEN = 'admin-token-0123456789abcdef';
const PUBLISHED = new Date('2026-09-20T08:00:00Z');

function skillZip(version: string, opts: { skillId?: string; extra?: string } = {}): Buffer {
  const skillId = opts.skillId ?? 'lesson-workflow';
  const files = [
    {
      name: `${skillId}/SKILL.md`,
      content:
        `---\nname: ${skillId}\nversion: ${version}\n` +
        `license: LicenseRef-TeachFlow-Proprietary\n---\n\n# ${skillId}\n`,
    },
    { name: `${skillId}/LICENSE`, content: 'TeachFlow Skill Licence\n' },
  ];
  if (opts.extra) files.push({ name: `${skillId}/references/extra.md`, content: opts.extra });
  return buildZip(files);
}

interface FakeRow {
  id: string;
  skill_id: string;
  version: string;
  sha256: string;
  size_bytes: number;
  r2_key: string;
  changelog_en: string;
  changelog_ko: string;
  published_at: Date;
}

/** 只实现 db/releases.ts 真正发出的三条语句，其余一律视为编程错误。 */
function fakePool(opts: { hideExisting?: boolean } = {}) {
  const rows: FakeRow[] = [];
  let seq = 0;
  const pool = {
    async query(sql: string, params: unknown[] = []) {
      if (sql.startsWith('SELECT version FROM releases')) {
        if (opts.hideExisting) return { rows: [] };
        return { rows: rows.filter((r) => r.skill_id === params[0]).map((r) => ({ version: r.version })) };
      }
      if (sql.startsWith('SELECT * FROM releases')) {
        if (opts.hideExisting) return { rows: [] };
        return { rows: rows.filter((r) => r.skill_id === params[0] && r.version === params[1]) };
      }
      if (sql.includes('INSERT INTO releases')) {
        if (rows.some((r) => r.skill_id === params[0] && r.version === params[1])) {
          throw Object.assign(new Error('duplicate key'), { code: '23505' });
        }
        seq += 1;
        const row: FakeRow = {
          id: String(seq),
          skill_id: params[0] as string,
          version: params[1] as string,
          sha256: params[2] as string,
          size_bytes: params[3] as number,
          r2_key: params[4] as string,
          changelog_en: params[5] as string,
          changelog_ko: params[6] as string,
          published_at: PUBLISHED,
        };
        rows.push(row);
        return { rows: [row] };
      }
      throw new Error(`未预期的 SQL：${sql}`);
    },
  } as unknown as Pool;
  return { pool, rows };
}

function fakeStorage() {
  const puts: { skillId: string; version: string; bytes: number }[] = [];
  const storage: Storage = {
    async putMaster(skillId, version, buf) {
      puts.push({ skillId, version, bytes: buf.length });
    },
    async archiveMaster() {},
    async getMaster() {
      throw new Error('发版路径不应回源');
    },
    async probe() {
      return true;
    },
  };
  return { storage, puts };
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

interface PostOptions {
  fields?: Record<string, string>;
  zip?: Buffer | null;
  token?: string | null;
  contentType?: string;
  deps?: Partial<ReleaseDeps>;
}

const DEFAULT_FIELDS = {
  skill: 'lesson-workflow',
  version: '1.0.0',
  changelog_en: 'Initial release.',
  changelog_ko: '최초 배포입니다.',
};

async function post(harness: { pool: Pool; storage: Storage }, opts: PostOptions = {}) {
  const fields = { ...DEFAULT_FIELDS, ...(opts.fields ?? {}) };
  for (const [k, v] of Object.entries(opts.fields ?? {})) {
    if (v === undefined) delete (fields as Record<string, string>)[k];
  }
  const zip = opts.zip === undefined ? skillZip(fields.version ?? '1.0.0') : opts.zip;
  const { body, contentType } = buildMultipart(
    fields,
    zip
      ? { field: 'zip', filename: 'upload.zip', contentType: 'application/zip', data: zip }
      : undefined,
  );

  const jobs: { job: string; data: Record<string, unknown> }[] = [];
  const deps: ReleaseDeps = {
    adminToken: TOKEN,
    pool: harness.pool,
    storage: harness.storage,
    async enqueue(job, data) {
      jobs.push({ job, data });
    },
    ...(opts.deps ?? {}),
  };

  const headers: Record<string, string> = { 'content-type': opts.contentType ?? contentType };
  const token = opts.token === undefined ? TOKEN : opts.token;
  if (token !== null) headers.authorization = `Bearer ${token}`;

  const req = Readable.from([body]) as unknown as IncomingMessage;
  Object.assign(req, { method: 'POST', url: '/api/admin/releases', headers });

  const { res, state } = fakeRes();
  await adminReleasesRoute(deps)({
    req,
    res,
    url: new URL('https://tryteachflow.com/api/admin/releases'),
    params: {},
    clientIp: '127.0.0.1',
  });
  return { state, json: state.body ? JSON.parse(state.body) : null, jobs };
}

describe('鉴权', () => {
  it('没有 Authorization 头时 401', async () => {
    const { state, json } = await post({ ...fakePool(), ...fakeStorage() }, { token: null });
    expect(state.status).toBe(401);
    expect(json).toEqual({ error: 'unauthorized' });
  });

  it('token 不对时 401', async () => {
    const { state } = await post({ ...fakePool(), ...fakeStorage() }, { token: 'wrong-token' });
    expect(state.status).toBe(401);
  });

  it('token 少一个字符时 401——长度不等不会抛异常', async () => {
    const { state } = await post({ ...fakePool(), ...fakeStorage() }, { token: TOKEN.slice(0, -1) });
    expect(state.status).toBe(401);
  });

  it('token 多一个字符时 401', async () => {
    const { state } = await post({ ...fakePool(), ...fakeStorage() }, { token: `${TOKEN}x` });
    expect(state.status).toBe(401);
  });

  it('鉴权失败时不碰存储也不碰数据库', async () => {
    const db = fakePool();
    const st = fakeStorage();
    await post({ ...db, ...st }, { token: null });
    expect(st.puts).toEqual([]);
    expect(db.rows).toEqual([]);
  });
});

describe('正常发版', () => {
  it('返回 201 与回执，sha256 是上传字节的摘要', async () => {
    const db = fakePool();
    const st = fakeStorage();
    const zip = skillZip('1.0.0');
    const { state, json } = await post({ ...db, ...st }, { zip });

    expect(state.status).toBe(201);
    expect(json).toEqual({
      skill: 'lesson-workflow',
      version: '1.0.0',
      sha256: createHash('sha256').update(zip).digest('hex'),
      size_bytes: zip.length,
      published_at: PUBLISHED.toISOString(),
    });
  });

  it('母版落到本地盘，r2_key 走统一命名', async () => {
    const db = fakePool();
    const st = fakeStorage();
    const zip = skillZip('1.0.0');
    await post({ ...db, ...st }, { zip });

    expect(st.puts).toEqual([{ skillId: 'lesson-workflow', version: '1.0.0', bytes: zip.length }]);
    expect(db.rows[0]!.r2_key).toBe('masters/lesson-workflow/1.0.0.zip');
  });

  it('双语 changelog 原样入库', async () => {
    const db = fakePool();
    await post({ ...db, ...fakeStorage() });
    expect(db.rows[0]!.changelog_en).toBe('Initial release.');
    expect(db.rows[0]!.changelog_ko).toBe('최초 배포입니다.');
  });

  it('投递归档与更新通知两个任务', async () => {
    const { jobs } = await post({ ...fakePool(), ...fakeStorage() });
    expect(jobs.map((j) => j.job)).toEqual(['archive-master', 'notify-update']);
    expect(jobs[0]!.data).toEqual({ skillId: 'lesson-workflow', version: '1.0.0' });
    expect(jobs[1]!.data).toMatchObject({ skillId: 'lesson-workflow', version: '1.0.0' });
  });
});

describe('版本单调', () => {
  it('同版本重传 409，且库中记录不变', async () => {
    const db = fakePool();
    const st = fakeStorage();
    const first = skillZip('1.0.0');
    await post({ ...db, ...st }, { zip: first });
    const before = { ...db.rows[0]! };

    const second = skillZip('1.0.0', { extra: '内容不同，但版本号没动' });
    expect(second.equals(first)).toBe(false);
    const { state, json } = await post({ ...db, ...st }, { zip: second });

    expect(state.status).toBe(409);
    expect(json.error).toBe('version_exists');
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toEqual(before);
  });

  it('版本回退 409', async () => {
    const db = fakePool();
    const st = fakeStorage();
    await post({ ...db, ...st }, { zip: skillZip('1.0.0') });
    const { state, json } = await post(
      { ...db, ...st },
      { fields: { version: '0.9.0' }, zip: skillZip('0.9.0') },
    );
    expect(state.status).toBe(409);
    expect(json).toMatchObject({ error: 'version_not_newer', latest: '1.0.0', attempted: '0.9.0' });
    expect(db.rows).toHaveLength(1);
  });

  it('1.10.0 比 1.9.0 新——按语义比较而不是字符串比较', async () => {
    const db = fakePool();
    const st = fakeStorage();
    await post({ ...db, ...st }, { fields: { version: '1.9.0' }, zip: skillZip('1.9.0') });
    const { state } = await post(
      { ...db, ...st },
      { fields: { version: '1.10.0' }, zip: skillZip('1.10.0') },
    );
    expect(state.status).toBe(201);
    expect(db.rows.map((r) => r.version)).toEqual(['1.9.0', '1.10.0']);
  });

  it('并发下靠数据库唯一约束兜底，同样回 409', async () => {
    // 预查看不见已有记录，模拟两个请求同时通过了路由层检查。
    const db = fakePool({ hideExisting: true });
    const st = fakeStorage();
    await post({ ...db, ...st }, { zip: skillZip('1.0.0') });
    const { state, json } = await post({ ...db, ...st }, { zip: skillZip('1.0.0') });
    expect(state.status).toBe(409);
    expect(json.error).toBe('version_exists');
    expect(db.rows).toHaveLength(1);
  });
});

describe('请求校验', () => {
  it('frontmatter 里的 version 与参数不符时 400', async () => {
    const db = fakePool();
    const st = fakeStorage();
    const { state, json } = await post(
      { ...db, ...st },
      { fields: { version: '2.0.0' }, zip: skillZip('1.0.0') },
    );
    expect(state.status).toBe(400);
    expect(json.error).toBe('version_mismatch');
    expect(json.detail).toContain('1.0.0');
    expect(st.puts).toEqual([]);
    expect(db.rows).toEqual([]);
  });

  it('zip 结构不合法时 400，并带上具体原因', async () => {
    const db = fakePool();
    const st = fakeStorage();
    const { state, json } = await post(
      { ...db, ...st },
      { zip: skillZip('1.0.0', { skillId: 'other-skill' }) },
    );
    expect(state.status).toBe(400);
    expect(json.error).toBe('invalid_zip');
    expect(json.detail).toContain('lesson-workflow');
    expect(st.puts).toEqual([]);
    expect(db.rows).toEqual([]);
  });

  it('缺字段时 400 并列出缺了哪些', async () => {
    const { state, json } = await post(
      { ...fakePool(), ...fakeStorage() },
      { fields: { changelog_ko: undefined as unknown as string }, zip: null },
    );
    expect(state.status).toBe(400);
    expect(json.error).toBe('missing_fields');
    expect(json.fields.sort()).toEqual(['changelog_ko', 'zip']);
  });

  it('版本号不是 X.Y.Z 时 400', async () => {
    const { state, json } = await post(
      { ...fakePool(), ...fakeStorage() },
      { fields: { version: 'v1.0' }, zip: skillZip('1.0.0') },
    );
    expect(state.status).toBe(400);
    expect(json.error).toBe('bad_version');
  });

  it('不是 multipart 时 400 而不是 500', async () => {
    const { state, json } = await post(
      { ...fakePool(), ...fakeStorage() },
      { contentType: 'application/json' },
    );
    expect(state.status).toBe(400);
    expect(json.error).toBe('bad_multipart');
  });
});

describe('投递失败', () => {
  it('任务投递失败时回 500，并告知记录已写入、不要重传', async () => {
    const db = fakePool();
    const st = fakeStorage();
    const { state, json } = await post(
      { ...db, ...st },
      {
        deps: {
          async enqueue() {
            throw new Error('pg-boss 不可用');
          },
        },
      },
    );
    expect(state.status).toBe(500);
    expect(json.error).toBe('enqueue_failed');
    expect(json.release_id).toBe(db.rows[0]!.id);
    expect(db.rows).toHaveLength(1);
  });
});
