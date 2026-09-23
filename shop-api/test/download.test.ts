import { describe, it, expect } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { downloadPageRoute, downloadAllRoute, downloadFileRoute, type DownloadDeps } from '../src/routes/download.ts';
import { signToken } from '../src/lib/token.ts';
import { buildZip, readCentralDirectory, readEntry } from '../src/lib/zip.ts';
import { StorageError, type Storage } from '../src/lib/storage.ts';

const SECRET = 'download-token-secret-at-least-32-bytes-long';
const NOW = new Date('2026-09-20T12:00:00Z');
const BOUGHT = new Date('2026-09-01T09:30:00Z');
const EMAIL = 'teacher@example.com';

const MASTER = buildZip([
  { name: 'lesson-workflow/SKILL.md', content: '---\nname: lesson-workflow\n---\n\n# lesson\n' },
  { name: 'lesson-workflow/LICENSE', content: 'TeachFlow Skill Licence\n' },
]);

interface Rel {
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

function release(skillId: string, version: string, over: Partial<Rel> = {}): Rel {
  return {
    id: `${skillId}-${version}`,
    skill_id: skillId,
    version,
    sha256: 'a'.repeat(64),
    size_bytes: MASTER.length,
    r2_key: `masters/${skillId}/${version}.zip`,
    changelog_en: 'Adds a worked example.',
    changelog_ko: '예시를 하나 더했습니다.',
    published_at: new Date('2026-09-10T00:00:00Z'),
    ...over,
  };
}

interface DbOptions {
  status?: string;
  /** 订单不存在。 */
  noOrder?: boolean;
  entitled?: readonly string[];
  releases?: readonly Rel[];
}

/** 内存版 Postgres：只认下载路径真正发出的六条语句。 */
function fakeDb(opts: DbOptions = {}) {
  const status = opts.status ?? 'paid';
  const entitled = opts.entitled ?? ['lesson-workflow', 'ppt-workflow'];
  const releases = opts.releases ?? [release('lesson-workflow', '1.1.0'), release('ppt-workflow', '1.0.0')];
  const downloads: Record<string, unknown>[] = [];

  const order = {
    id: 'ord_abc',
    provider: 'polar',
    buyer_email: EMAIL,
    amount_cents: 2990,
    currency: 'usd',
    locale: 'ko',
    status,
    created_at: BOUGHT,
  };

  const pool = {
    async query(sql: string, params: unknown[] = []) {
      const text = sql.trim();
      if (text.startsWith('SELECT * FROM orders')) {
        const hit = !opts.noOrder && params[0] === order.id;
        return { rows: hit ? [order] : [] };
      }
      if (text.startsWith('SELECT e.skill_id FROM entitlements')) {
        if (status !== 'paid') return { rows: [] };
        return { rows: [...entitled].sort().map((skill_id) => ({ skill_id })) };
      }
      if (text.startsWith('SELECT 1 FROM entitlements')) {
        const ok = status === 'paid' && entitled.includes(params[1] as string);
        return { rows: ok ? [{ '?column?': 1 }] : [] };
      }
      if (text.startsWith('SELECT version FROM releases')) {
        return { rows: releases.filter((r) => r.skill_id === params[0]).map((r) => ({ version: r.version })) };
      }
      if (text.startsWith('SELECT * FROM releases')) {
        return { rows: releases.filter((r) => r.skill_id === params[0] && r.version === params[1]) };
      }
      if (text.startsWith('INSERT INTO downloads')) {
        downloads.push({
          order_id: params[0],
          skill_id: params[1],
          version: params[2],
          ip: params[3],
          user_agent: params[4],
        });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`未预期的 SQL：${text}`);
    },
  } as unknown as Pool;

  return { pool, downloads };
}

function fakeStorage(over: Partial<Storage> = {}): Storage {
  return {
    async putMaster() {},
    async archiveMaster() {},
    async getMaster() {
      return MASTER;
    },
    async probe() {
      return true;
    },
    ...over,
  };
}

function fakeRes() {
  const state = { status: 0, headers: {} as Record<string, string | number>, body: Buffer.alloc(0) };
  const res = {
    writeHead(status: number, headers: Record<string, string | number>) {
      state.status = status;
      state.headers = headers;
    },
    end(chunk?: Buffer | string) {
      state.body = chunk === undefined ? Buffer.alloc(0) : Buffer.from(chunk as Buffer);
    },
  } as unknown as ServerResponse;
  return { res, state };
}

interface CallOptions {
  token?: string | null;
  lang?: string;
  skillId?: string;
  ip?: string;
  userAgent?: string;
  db?: ReturnType<typeof fakeDb>;
  storage?: Storage;
}

function token(over: { orderId?: string; ttlDays?: number; now?: number } = {}): string {
  return signToken(SECRET, {
    orderId: over.orderId ?? 'ord_abc',
    ttlDays: over.ttlDays ?? 30,
    now: over.now ?? NOW.getTime(),
  });
}

async function call(which: 'page' | 'file' | 'all', opts: CallOptions = {}) {
  const db = opts.db ?? fakeDb();
  const deps: DownloadDeps = {
    pool: db.pool,
    storage: opts.storage ?? fakeStorage(),
    tokenSecret: SECRET,
    now: () => NOW,
  };
  const t = opts.token === undefined ? token() : opts.token;
  const params = new URLSearchParams();
  if (t !== null) params.set('t', t);
  if (opts.lang) params.set('lang', opts.lang);

  const skillId = opts.skillId ?? 'lesson-workflow';
  const path =
    which === 'page'
      ? `/download?${params}`
      : which === 'all'
        ? `/api/download/all?${params}`
        : `/api/download/${encodeURIComponent(skillId)}?${params}`;
  const url = new URL(path, 'https://tryteachflow.com');

  const req = {
    method: 'GET',
    url: path,
    headers: { 'user-agent': opts.userAgent ?? 'Mozilla/5.0' },
  } as unknown as IncomingMessage;

  const { res, state } = fakeRes();
  const handler =
    which === 'page'
      ? downloadPageRoute(deps)
      : which === 'all'
        ? downloadAllRoute(deps)
        : downloadFileRoute(deps);
  await handler({
    req,
    res,
    url,
    params: which === 'file' ? { skillId } : {},
    clientIp: opts.ip ?? '203.0.113.7',
  });

  return { ...state, text: state.body.toString('utf8'), db };
}

describe('下载页的四种失败', () => {
  it('没有 token：400，并告诉买家链接可能被邮件截断了', async () => {
    const r = await call('page', { token: null });
    expect(r.status).toBe(400);
    expect(r.text).toContain('Download link incomplete');
    expect(r.text).toContain('breaks across two lines');
  });

  it('签名对不上：401', async () => {
    const r = await call('page', { token: `${token()}x` });
    expect(r.status).toBe(401);
    expect(r.text).toContain('Download link not valid');
  });

  it('过期：410，并说明购买本身不受影响', async () => {
    const stale = signToken(SECRET, {
      orderId: 'ord_abc',
      ttlDays: 30,
      now: NOW.getTime() - 40 * 86_400_000,
    });
    const r = await call('page', { token: stale });
    expect(r.status).toBe(410);
    expect(r.text).toContain('Download link expired');
    expect(r.text).toContain('Your purchase is unaffected');
  });

  it('已退款：403，且不提示去要新链接', async () => {
    const r = await call('page', { db: fakeDb({ status: 'refunded' }) });
    expect(r.status).toBe(403);
    expect(r.text).toContain('Download no longer available');
    expect(r.text).not.toContain('we will send a new link');
  });

  it('争议扣款与退款同样处理', async () => {
    const r = await call('page', { db: fakeDb({ status: 'chargeback' }) });
    expect(r.status).toBe(403);
  });

  it('签名有效但查无此单：算链接无效，不说成退款', async () => {
    const r = await call('page', { db: fakeDb({ noOrder: true }) });
    expect(r.status).toBe(401);
    expect(r.text).toContain('Download link not valid');
  });

  it('失败页也认 lang 参数——此时还不知道订单语言', async () => {
    const r = await call('page', { token: null, lang: 'ko' });
    expect(r.status).toBe(400);
    expect(r.text).toContain('다운로드 링크가 불완전합니다');
    expect(r.text).toContain('lang="ko"');
  });
});

describe('下载页', () => {
  it('列出有权下载的 skill、版本、体积与校验和', async () => {
    const r = await call('page');
    expect(r.status).toBe(200);
    expect(r.text).toContain('lesson-workflow');
    expect(r.text).toContain('1.1.0');
    expect(r.text).toContain('ppt-workflow');
    expect(r.text).toContain(`SHA-256 ${'a'.repeat(64)}`);
  });

  it('下载链接带着同一个 token', async () => {
    const t = token();
    const r = await call('page', { token: t });
    expect(r.text).toContain(`/api/download/lesson-workflow?t=${encodeURIComponent(t)}`);
  });

  it('默认跟随订单语言，lang 参数可覆盖', async () => {
    const ko = await call('page');
    expect(ko.text).toContain('예시를 하나 더했습니다.');
    expect(ko.text).toContain('TeachFlow 다운로드');

    const en = await call('page', { lang: 'en' });
    expect(en.text).toContain('Adds a worked example.');
    expect(en.text).toContain('Your TeachFlow downloads');
  });

  it('显示 token 的到期日', async () => {
    const r = await call('page', { lang: 'en' });
    expect(r.text).toContain('2026-10-20');
  });

  it('还没发过版的 skill 不在页面上占位', async () => {
    const db = fakeDb({ releases: [release('lesson-workflow', '1.1.0')] });
    const r = await call('page', { db });
    expect(r.text).toContain('lesson-workflow');
    expect(r.text).not.toContain('ppt-workflow');
  });

  it('多个版本时取最高版，且 1.10.0 高于 1.9.0', async () => {
    const db = fakeDb({
      entitled: ['lesson-workflow'],
      releases: [
        release('lesson-workflow', '1.9.0'),
        release('lesson-workflow', '1.10.0'),
        release('lesson-workflow', '1.2.0'),
      ],
    });
    const r = await call('page', { db });
    expect(r.text).toContain('1.10.0');
    expect(r.text).not.toContain('>1.9.0<');
  });

  it('changelog 里的标记会被转义，不会变成页面结构', async () => {
    const db = fakeDb({
      entitled: ['lesson-workflow'],
      releases: [release('lesson-workflow', '1.0.0', { changelog_en: '<script>alert(1)</script>' })],
    });
    const r = await call('page', { db, lang: 'en' });
    expect(r.text).toContain('&lt;script&gt;');
    expect(r.text).not.toContain('<script>');
  });

  it('页面零脚本、零外部资源', async () => {
    const r = await call('page');
    expect(r.text).not.toContain('<script');
    expect(r.text).not.toMatch(/\ssrc=/);
    expect(r.text).not.toContain('<link');
    expect(r.text).not.toMatch(/https?:\/\/(?!tryteachflow)/);
  });

  it('响应头禁止缓存与索引', async () => {
    const r = await call('page');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(String(r.headers['content-security-policy'])).toContain("default-src 'none'");
    expect(r.text).toContain('name="robots" content="noindex,nofollow"');
  });

  it('权利为空时页面仍然打得开，但不出现「下载全部」', async () => {
    const r = await call('page', { db: fakeDb({ entitled: [] }) });
    expect(r.status).toBe(200);
    expect(r.text).toContain('TeachFlow 다운로드');
    expect(r.text).toContain('class="note"');
    expect(r.text).not.toContain('/api/download/all');
  });

  it('页面给出带同一 token 的「下载全部」按钮，两种语言各有自己的文案', async () => {
    const t = token();
    const ko = await call('page', { token: t });
    expect(ko.text).toContain(`/api/download/all?t=${encodeURIComponent(t)}`);
    expect(ko.text).toContain('전체를 zip 하나로 내려받기');

    const en = await call('page', { token: t, lang: 'en' });
    expect(en.text).toContain(`/api/download/all?t=${encodeURIComponent(t)}`);
    expect(en.text).toContain('Download all as one zip');
  });
});

describe('下载全部接口', () => {
  it('把每个有权 skill 的最新版各装成一个内层 zip', async () => {
    const r = await call('all');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/zip');
    expect(r.headers['content-disposition']).toBe(
      'attachment; filename="teachflow-bundle-ord_abc.zip"',
    );
    expect(r.headers['content-length']).toBe(r.body.length);

    const names = readCentralDirectory(r.body).map((e) => e.name).sort();
    expect(names).toEqual(['lesson-workflow-1.1.0.zip', 'ppt-workflow-1.0.0.zip']);
  });

  it('内层 zip 与单独下载一样带买家水印', async () => {
    const r = await call('all');
    const outer = readCentralDirectory(r.body);
    const inner = readEntry(r.body, outer.find((e) => e.name === 'lesson-workflow-1.1.0.zip')!);
    const innerEntries = readCentralDirectory(inner);
    const holder = readEntry(
      inner,
      innerEntries.find((e) => e.name.endsWith('LICENSE-HOLDER.txt'))!,
    ).toString('utf8');
    expect(holder).toContain(EMAIL);
    expect(holder).toContain('ord_abc');
  });

  it('每个 skill 各记一条下载，与逐个下载的账目一致', async () => {
    const r = await call('all', { ip: '198.51.100.9', userAgent: 'curl/8.4.0' });
    expect(r.db.downloads).toEqual([
      {
        order_id: 'ord_abc',
        skill_id: 'lesson-workflow',
        version: '1.1.0',
        ip: '198.51.100.9',
        user_agent: 'curl/8.4.0',
      },
      {
        order_id: 'ord_abc',
        skill_id: 'ppt-workflow',
        version: '1.0.0',
        ip: '198.51.100.9',
        user_agent: 'curl/8.4.0',
      },
    ]);
  });

  it('一个发版的都没有：404，而不是发一个空 zip', async () => {
    const r = await call('all', { db: fakeDb({ releases: [] }) });
    expect(r.status).toBe(404);
    expect(JSON.parse(r.text).error.code).toBe('no_release');
  });

  it('退款后整包也取不到，状态码与单文件接口一致', async () => {
    const r = await call('all', { db: fakeDb({ status: 'refunded' }) });
    expect(r.status).toBe(403);
    expect(JSON.parse(r.text).error.code).toBe('revoked');
  });

  it('母版取不到：503，不是 500', async () => {
    const storage = fakeStorage({
      async getMaster() {
        throw new StorageError('R2 504');
      },
    });
    const r = await call('all', { storage });
    expect(r.status).toBe(503);
    expect(JSON.parse(r.text).error.code).toBe('master_unavailable');
  });

  it('路由表把 /api/download/all 分给它自己，而不是名叫 all 的 skill', async () => {
    // 回归守卫：all 路由若排在 :skillId 之后，这里会吃到 403 not_entitled。
    const { createRouter } = await import('../src/http/router.ts');
    const router = createRouter('https://tryteachflow.com');
    const deps: DownloadDeps = {
      pool: fakeDb().pool,
      storage: fakeStorage(),
      tokenSecret: SECRET,
      now: () => NOW,
    };
    router.add('GET', '/api/download/all', downloadAllRoute(deps));
    router.add('GET', '/api/download/:skillId', downloadFileRoute(deps));
    const found = router.match('GET', '/api/download/all');
    expect(found?.params).toEqual({});
  });
});

describe('文件接口', () => {
  it('返回带水印的 zip，附件名含 skill 与版本', async () => {
    const r = await call('file');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/zip');
    expect(r.headers['content-disposition']).toBe(
      'attachment; filename="lesson-workflow-1.1.0.zip"',
    );
    expect(r.headers['content-length']).toBe(r.body.length);
  });

  it('水印文件写着买家邮箱与订单号，原有条目一字不动', async () => {
    const r = await call('file');
    const entries = readCentralDirectory(r.body);
    const names = entries.map((e) => e.name);
    expect(names).toContain('lesson-workflow/LICENSE-HOLDER.txt');
    expect(names).toContain('lesson-workflow/SKILL.md');

    const holder = readEntry(r.body, entries.find((e) => e.name.endsWith('LICENSE-HOLDER.txt'))!)
      .toString('utf8');
    expect(holder).toContain(EMAIL);
    expect(holder).toContain('ord_abc');
    expect(holder).toContain('Version: 1.1.0');
    expect(holder).toContain('2026-09-01T09:30:00Z');

    const original = readEntry(r.body, entries.find((e) => e.name.endsWith('SKILL.md'))!);
    expect(original.toString('utf8')).toBe('---\nname: lesson-workflow\n---\n\n# lesson\n');
  });

  it('记一条下载，含 IP 与 UA', async () => {
    const r = await call('file', { ip: '198.51.100.9', userAgent: 'curl/8.4.0' });
    expect(r.db.downloads).toEqual([
      {
        order_id: 'ord_abc',
        skill_id: 'lesson-workflow',
        version: '1.1.0',
        ip: '198.51.100.9',
        user_agent: 'curl/8.4.0',
      },
    ]);
  });

  it('畸形的 X-Forwarded-For 不挡下载，按 0.0.0.0 记账', async () => {
    const r = await call('file', { ip: 'not-an-ip; DROP TABLE' });
    expect(r.status).toBe(200);
    expect(r.db.downloads[0]!.ip).toBe('0.0.0.0');
  });

  it('超长 UA 截断到 512 字节', async () => {
    const r = await call('file', { userAgent: 'x'.repeat(2000) });
    expect((r.db.downloads[0]!.user_agent as string).length).toBe(512);
  });

  it('记账失败就不发文件', async () => {
    const db = fakeDb();
    const broken = {
      async query(sql: string, params: unknown[] = []) {
        if (sql.trim().startsWith('INSERT INTO downloads')) throw new Error('disk full');
        return db.pool.query(sql, params);
      },
    } as unknown as Pool;
    await expect(
      call('file', { db: { pool: broken, downloads: db.downloads } }),
    ).rejects.toThrow('disk full');
  });

  it('没买过的 skill：403', async () => {
    const r = await call('file', { skillId: 'rubric-builder' });
    expect(r.status).toBe(403);
    expect(JSON.parse(r.text).error).toMatchObject({ code: 'not_entitled', skill: 'rubric-builder' });
  });

  it('退款后连自己买过的 skill 也取不到', async () => {
    const r = await call('file', { db: fakeDb({ status: 'refunded' }) });
    expect(r.status).toBe(403);
    expect(JSON.parse(r.text).error.code).toBe('revoked');
  });

  it('有权利但还没发过版：404', async () => {
    const db = fakeDb({ releases: [release('ppt-workflow', '1.0.0')] });
    const r = await call('file', { db });
    expect(r.status).toBe(404);
    expect(JSON.parse(r.text).error).toMatchObject({ code: 'no_release', skill: 'lesson-workflow' });
  });

  it('母版取不到：503，不是 500', async () => {
    const storage = fakeStorage({
      async getMaster() {
        throw new StorageError('R2 504');
      },
    });
    const r = await call('file', { storage });
    expect(r.status).toBe(503);
    expect(JSON.parse(r.text).error).toMatchObject({ code: 'master_unavailable', skill: 'lesson-workflow' });
  });

  it('过期 token 回 JSON，状态码与页面一致', async () => {
    const stale = signToken(SECRET, {
      orderId: 'ord_abc',
      ttlDays: 1,
      now: NOW.getTime() - 5 * 86_400_000,
    });
    const r = await call('file', { token: stale });
    expect(r.status).toBe(410);
    expect(JSON.parse(r.text).error.code).toBe('expired');
  });

  it('缺 token：400', async () => {
    const r = await call('file', { token: null });
    expect(r.status).toBe(400);
    expect(JSON.parse(r.text).error.code).toBe('missing_token');
  });

  it('别人的 token 签名验不过：401，且不查库', async () => {
    const forged = signToken('another-secret-that-is-long-enough-32', {
      orderId: 'ord_abc',
      ttlDays: 30,
      now: NOW.getTime(),
    });
    const r = await call('file', { token: forged });
    expect(r.status).toBe(401);
    expect(r.db.downloads).toEqual([]);
  });
});
