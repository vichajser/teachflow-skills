import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { notifyUpdate, nextQuotaWindow, type NotifyDeps } from '../src/jobs/notify-update.ts';
import { verifyToken } from '../src/lib/token.ts';

const SECRET = 'notify-update-token-secret-at-least-32-bytes';
const BASE = 'https://tryteachflow.com';
const NOW = new Date('2026-09-20T15:00:00Z');
const RELEASE_ID = '42';
const PUBLISHED = new Date('2026-09-20T09:00:00Z');

interface Buyer {
  id: string;
  email: string;
  locale: 'en' | 'ko';
  /** 下单时间。晚于发版时间的人不该收到通知。 */
  createdAt?: Date;
}

interface DbOptions {
  buyers?: Buyer[];
  /** 库里没有这条发版记录。 */
  missingRelease?: boolean;
  /** 当天还能发几封。默认够用。 */
  quotaLeft?: number;
}

/**
 * 内存版 Postgres：只认这条路径真正发出的四条语句。
 *
 * email_quota 用真的计数器而不是布尔开关——配额顺延要测的正是「发到第 N 封
 * 才停」，一个开关会让所有断点都退化成第一封。
 */
function fakeDb(opts: DbOptions = {}) {
  const buyers = opts.buyers ?? [];
  const notices = new Set<string>();
  let quotaLeft = opts.quotaLeft ?? 1000;

  const pool = {
    async query(sql: string, params: unknown[] = []) {
      const text = sql.trim();

      if (text.startsWith('SELECT * FROM releases WHERE id')) {
        if (opts.missingRelease) return { rows: [] };
        return {
          rows: [
            {
              id: RELEASE_ID,
              skill_id: 'lesson-workflow',
              version: '1.2.0',
              sha256: 'a'.repeat(64),
              size_bytes: 1024,
              r2_key: 'masters/lesson-workflow/1.2.0.zip',
              changelog_en: 'Worksheet answer keys now ship with every lesson.',
              changelog_ko: '이제 모든 수업에 정답지가 함께 제공됩니다.',
              published_at: PUBLISHED,
              archived_at: null,
            },
          ],
        };
      }

      if (text.startsWith('SELECT o.id, o.buyer_email, o.locale')) {
        const publishedAt = params[2] as Date;
        return {
          rows: buyers
            .filter((b) => (b.createdAt ?? new Date('2026-09-01T00:00:00Z')) < publishedAt)
            .filter((b) => !notices.has(`${b.id}:${RELEASE_ID}`))
            .map((b) => ({ id: b.id, buyer_email: b.email, locale: b.locale })),
        };
      }

      if (text.startsWith('INSERT INTO update_notices')) {
        notices.add(`${params[0] as string}:${params[1] as string}`);
        return { rows: [] };
      }

      if (text.startsWith('INSERT INTO email_quota')) {
        if (quotaLeft <= 0) return { rows: [] };
        quotaLeft -= 1;
        return { rows: [{ sent: 1 }] };
      }

      throw new Error(`未预期的 SQL：${text}`);
    },
  } as unknown as Pool;

  return { pool, notices };
}

interface SentMail {
  to: string;
  subject: string;
  text: string;
}

interface MailerOptions {
  /** 第 n 封（从 1 数）起返回这个状态码。 */
  failFrom?: number;
  status?: number;
}

function fakeMailer(pool: Pool, opts: MailerOptions = {}) {
  const sent: SentMail[] = [];
  let n = 0;
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    n += 1;
    const body = JSON.parse(init.body) as { to: string[]; subject: string; text: string };
    if (opts.failFrom !== undefined && n >= opts.failFrom) {
      const status = opts.status ?? 422;
      return { ok: false, status, async json() { return { message: 'nope' }; } };
    }
    sent.push({ to: body.to[0]!, subject: body.subject, text: body.text });
    return { ok: true, status: 200, async json() { return { id: `re_${n}` }; } };
  }) as unknown as typeof globalThis.fetch;

  return {
    sent,
    deps: { apiKey: 'test-key', from: 'TeachFlow <hello@tryteachflow.com>', pool, dailyBudget: 80, fetch: fetchImpl, now: () => NOW },
  };
}

interface RunOptions {
  db?: ReturnType<typeof fakeDb>;
  mailer?: ReturnType<typeof fakeMailer>;
}

function build(opts: RunOptions = {}) {
  const db = opts.db ?? fakeDb();
  const mailer = opts.mailer ?? fakeMailer(db.pool);
  const rescheduled: { at: Date; releaseId: string }[] = [];
  const deps: NotifyDeps = {
    pool: db.pool,
    mailer: mailer.deps,
    tokenSecret: SECRET,
    ttlDays: 30,
    publicBaseUrl: BASE,
    now: () => NOW,
    async reschedule(at, data) {
      rescheduled.push({ at, releaseId: data.releaseId });
    },
  };
  return { db, mailer, deps, rescheduled };
}

function buyers(count: number, locale: 'en' | 'ko' = 'en'): Buyer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ord_${i + 1}`,
    email: `teacher${i + 1}@example.com`,
    locale,
  }));
}

describe('nextQuotaWindow', () => {
  it('把工作排到次日 UTC 00:05', () => {
    expect(nextQuotaWindow(new Date('2026-09-20T15:00:00Z')).toISOString()).toBe(
      '2026-09-21T00:05:00.000Z',
    );
  });

  it('当天 00:05 之前用尽配额时，仍然排到次日——额度是按 UTC 日历日算的', () => {
    // 00:01 用尽意味着今天这一整天的额度已经没了，五分钟后重试只会再撞一次墙。
    expect(nextQuotaWindow(new Date('2026-09-20T00:01:00Z')).toISOString()).toBe(
      '2026-09-21T00:05:00.000Z',
    );
  });

  it('正好落在 00:05 时顺延到明天，不会排给此刻的自己', () => {
    expect(nextQuotaWindow(new Date('2026-09-20T00:05:00.000Z')).toISOString()).toBe(
      '2026-09-21T00:05:00.000Z',
    );
  });

  it('跨月也照样是次日', () => {
    expect(nextQuotaWindow(new Date('2026-09-30T23:59:00Z')).toISOString()).toBe(
      '2026-10-01T00:05:00.000Z',
    );
  });
});

describe('notifyUpdate', () => {
  it('给每个待通知的买家发一封，并各记一笔', async () => {
    const db = fakeDb({ buyers: buyers(3) });
    const { deps, mailer } = build({ db });

    const result = await notifyUpdate(deps, { releaseId: RELEASE_ID });

    expect(result).toEqual({ sent: 3, dropped: 0, remaining: 0, rescheduledAt: null });
    expect(mailer.sent.map((m) => m.to)).toEqual([
      'teacher1@example.com',
      'teacher2@example.com',
      'teacher3@example.com',
    ]);
    expect(db.notices.size).toBe(3);
  });

  it('重跑时已发的那些不再发', async () => {
    const db = fakeDb({ buyers: buyers(2) });
    const first = build({ db });
    await notifyUpdate(first.deps, { releaseId: RELEASE_ID });

    const second = build({ db });
    const result = await notifyUpdate(second.deps, { releaseId: RELEASE_ID });

    expect(result.sent).toBe(0);
    expect(second.mailer.sent).toEqual([]);
  });

  it('配额耗尽时把剩下的排到次日 00:05，已发的不算在欠账里', async () => {
    const db = fakeDb({ buyers: buyers(5), quotaLeft: 2 });
    const { deps, mailer, rescheduled } = build({ db });

    const result = await notifyUpdate(deps, { releaseId: RELEASE_ID });

    expect(result.sent).toBe(2);
    expect(result.remaining).toBe(3);
    expect(result.rescheduledAt?.toISOString()).toBe('2026-09-21T00:05:00.000Z');
    expect(rescheduled).toEqual([{ at: result.rescheduledAt, releaseId: RELEASE_ID }]);
    expect(mailer.sent).toHaveLength(2);
    // 顺延那一轮查出来的应当正好是没发的三个。
    expect(db.notices.size).toBe(2);
  });

  it('顺延之后再跑，只发剩下的三封', async () => {
    const db = fakeDb({ buyers: buyers(5), quotaLeft: 2 });
    await notifyUpdate(build({ db }).deps, { releaseId: RELEASE_ID });

    // 次日：额度重置。
    const next = fakeDb({ buyers: buyers(5) });
    // 复用第一轮的已发记录：把它们塞进新库的 notices 集合。
    for (const key of db.notices) next.notices.add(key);
    const second = build({ db: next });
    const result = await notifyUpdate(second.deps, { releaseId: RELEASE_ID });

    expect(result.sent).toBe(3);
    expect(second.mailer.sent.map((m) => m.to)).toEqual([
      'teacher3@example.com',
      'teacher4@example.com',
      'teacher5@example.com',
    ]);
  });

  it('地址被永久拒收时记一笔了结，不再每天重试同一个死地址', async () => {
    const db = fakeDb({ buyers: buyers(2) });
    const mailer = fakeMailer(db.pool, { failFrom: 2, status: 422 });
    const { deps } = build({ db, mailer });

    const result = await notifyUpdate(deps, { releaseId: RELEASE_ID });

    expect(result).toEqual({ sent: 1, dropped: 1, remaining: 0, rescheduledAt: null });
    expect(db.notices.size).toBe(2);
  });

  it('供应商暂时故障时抛错交给队列退避，已发的部分保留', async () => {
    const db = fakeDb({ buyers: buyers(3) });
    const mailer = fakeMailer(db.pool, { failFrom: 2, status: 503 });
    const { deps } = build({ db, mailer });

    await expect(notifyUpdate(deps, { releaseId: RELEASE_ID })).rejects.toThrow(/还欠 2 封/);
    expect(db.notices.size).toBe(1);
  });

  it('抛出的错误里不带收件人地址', async () => {
    const db = fakeDb({ buyers: buyers(1) });
    const mailer = fakeMailer(db.pool, { failFrom: 1, status: 500 });
    const { deps } = build({ db, mailer });

    await expect(notifyUpdate(deps, { releaseId: RELEASE_ID })).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('@example.com') }),
    );
  });

  it('韩语买家收到韩语标题与韩语变更说明', async () => {
    const db = fakeDb({ buyers: [{ id: 'ord_ko', email: 'teacher@example.com', locale: 'ko' }] });
    const { deps, mailer } = build({ db });

    await notifyUpdate(deps, { releaseId: RELEASE_ID });

    expect(mailer.sent[0]!.subject).toContain('업데이트');
    expect(mailer.sent[0]!.text).toContain('정답지');
    expect(mailer.sent[0]!.text).not.toContain('answer keys');
  });

  it('英语买家收到英语标题与英语变更说明', async () => {
    const db = fakeDb({ buyers: [{ id: 'ord_en', email: 'teacher@example.com', locale: 'en' }] });
    const { deps, mailer } = build({ db });

    await notifyUpdate(deps, { releaseId: RELEASE_ID });

    expect(mailer.sent[0]!.subject).toContain('update');
    expect(mailer.sent[0]!.text).toContain('answer keys');
  });

  it('信里的链接带一个当前有效、指向该订单的 token', async () => {
    const db = fakeDb({ buyers: [{ id: 'ord_link', email: 'teacher@example.com', locale: 'en' }] });
    const { deps, mailer } = build({ db });

    await notifyUpdate(deps, { releaseId: RELEASE_ID });

    const match = /https:\/\/tryteachflow\.com\/download\?t=([^\s)]+)/.exec(mailer.sent[0]!.text);
    expect(match).not.toBeNull();
    const verified = verifyToken(SECRET, decodeURIComponent(match![1]!), NOW.getTime());
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.claims.orderId).toBe('ord_link');
  });

  it('发版之后才下单的人不收通知——他拿到的本来就是新版', async () => {
    const db = fakeDb({
      buyers: [
        { id: 'ord_old', email: 'old@example.com', locale: 'en' },
        {
          id: 'ord_new',
          email: 'new@example.com',
          locale: 'en',
          createdAt: new Date('2026-09-20T10:00:00Z'),
        },
      ],
    });
    const { deps, mailer } = build({ db });

    const result = await notifyUpdate(deps, { releaseId: RELEASE_ID });

    expect(result.sent).toBe(1);
    expect(mailer.sent.map((m) => m.to)).toEqual(['old@example.com']);
  });

  it('发版记录不存在时静默收工，不重试也不发信', async () => {
    const db = fakeDb({ missingRelease: true, buyers: buyers(3) });
    const { deps, mailer } = build({ db });

    const result = await notifyUpdate(deps, { releaseId: RELEASE_ID });

    expect(result).toEqual({ sent: 0, dropped: 0, remaining: 0, rescheduledAt: null });
    expect(mailer.sent).toEqual([]);
  });

  it('没人需要通知时不占用任何配额', async () => {
    const db = fakeDb({ buyers: [], quotaLeft: 0 });
    const { deps, rescheduled } = build({ db });

    const result = await notifyUpdate(deps, { releaseId: RELEASE_ID });

    expect(result).toEqual({ sent: 0, dropped: 0, remaining: 0, rescheduledAt: null });
    expect(rescheduled).toEqual([]);
  });

  it('第一封就没配额时不发信，直接顺延全部', async () => {
    const db = fakeDb({ buyers: buyers(4), quotaLeft: 0 });
    const { deps, mailer, rescheduled } = build({ db });

    const result = await notifyUpdate(deps, { releaseId: RELEASE_ID });

    expect(result.sent).toBe(0);
    expect(result.remaining).toBe(4);
    expect(mailer.sent).toEqual([]);
    expect(rescheduled).toHaveLength(1);
  });
});
