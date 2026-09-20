import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { HARD_DAILY_CAP, reserveQuota, quotaUsed, utcDay } from '../src/db/quota.ts';
import { sendMail, type MailerDeps } from '../src/lib/mailer.ts';
import { withdrawalNotice, loadNotices, LegalTextError, DEFAULT_LEGAL_DIR } from '../src/lib/legal.ts';
import { deliveryMail, updateMail, resendMail, DISCLOSURE } from '../src/lib/emails.ts';

const NOW = new Date('2026-09-20T12:00:00Z');

/** 内存版 email_quota，自增与上限判断一步完成，和 SQL 语义一致。 */
function fakeQuotaPool() {
  const days = new Map<string, number>();
  const pool = {
    async query(sql: string, params: unknown[] = []) {
      if (sql.startsWith('INSERT INTO email_quota')) {
        const day = params[0] as string;
        const cap = params[1] as number;
        const now = days.get(day);
        if (now === undefined) {
          days.set(day, 1);
          return { rows: [{ sent: 1 }] };
        }
        if (now >= cap) return { rows: [] };
        days.set(day, now + 1);
        return { rows: [{ sent: now + 1 }] };
      }
      if (sql.startsWith('SELECT sent FROM email_quota')) {
        const sent = days.get(params[0] as string);
        return { rows: sent === undefined ? [] : [{ sent }] };
      }
      throw new Error(`未预期的 SQL：${sql}`);
    },
  } as unknown as Pool;
  return { pool, days };
}

interface Captured {
  url: string;
  init: RequestInit;
}

function fakeFetch(reply: () => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const fn = (async (url: string | URL, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return reply();
  }) as unknown as typeof globalThis.fetch;
  return { fn, calls };
}

function ok(id = 'msg_1'): Response {
  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function mailer(over: Partial<MailerDeps> = {}): MailerDeps {
  return {
    apiKey: 're_test_key',
    from: 'TeachFlow <noreply@tryteachflow.com>',
    pool: fakeQuotaPool().pool,
    dailyBudget: 80,
    now: () => NOW,
    fetch: fakeFetch(ok).fn,
    ...over,
  };
}

const ENVELOPE = {
  to: 'teacher@example.com',
  subject: '제목',
  text: '본문',
  kind: 'broadcast' as const,
};

describe('配额按 UTC 日历日算', () => {
  it('UTC 午夜后算新的一天', () => {
    expect(utcDay(new Date('2026-09-21T00:30:00Z'))).toBe('2026-09-21');
  });

  it('本地时间已跨日但 UTC 未跨日时，仍算旧的一天', () => {
    // 首尔时间 2026-09-21 00:30，UTC 还是 20 号。
    expect(utcDay(new Date('2026-09-20T15:30:00Z'))).toBe('2026-09-20');
  });
});

describe('配额占用', () => {
  it('逐次自增', async () => {
    const { pool } = fakeQuotaPool();
    expect(await reserveQuota(pool, '2026-09-20', 3)).toBe(true);
    expect(await reserveQuota(pool, '2026-09-20', 3)).toBe(true);
    expect(await quotaUsed(pool, '2026-09-20')).toBe(2);
  });

  it('到上限后返回 false，且不再自增', async () => {
    const { pool } = fakeQuotaPool();
    for (let i = 0; i < 3; i += 1) await reserveQuota(pool, '2026-09-20', 3);
    expect(await reserveQuota(pool, '2026-09-20', 3)).toBe(false);
    expect(await quotaUsed(pool, '2026-09-20')).toBe(3);
  });

  it('上限为 0 时直接拒绝，不落任何一行', async () => {
    const { pool, days } = fakeQuotaPool();
    expect(await reserveQuota(pool, '2026-09-20', 0)).toBe(false);
    expect(days.size).toBe(0);
  });

  it('各日独立计数', async () => {
    const { pool } = fakeQuotaPool();
    await reserveQuota(pool, '2026-09-20', 1);
    expect(await reserveQuota(pool, '2026-09-21', 1)).toBe(true);
  });

  it('未发过信的日子用量为 0', async () => {
    const { pool } = fakeQuotaPool();
    expect(await quotaUsed(pool, '2026-09-20')).toBe(0);
  });
});

describe('发信', () => {
  it('按 Resend 的接口形状发出请求', async () => {
    const f = fakeFetch(ok);
    const res = await sendMail(mailer({ fetch: f.fn }), ENVELOPE);

    expect(res).toEqual({ sent: true, id: 'msg_1' });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe('https://api.resend.com/emails');
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer re_test_key');
    expect(JSON.parse(f.calls[0]!.init.body as string)).toEqual({
      from: 'TeachFlow <noreply@tryteachflow.com>',
      to: ['teacher@example.com'],
      subject: '제목',
      text: '본문',
    });
  });

  it('群发用完当日预算后返回 quota，而不是抛错', async () => {
    const { pool } = fakeQuotaPool();
    const deps = mailer({ pool, dailyBudget: 2 });
    await sendMail(deps, ENVELOPE);
    await sendMail(deps, ENVELOPE);
    expect(await sendMail(deps, ENVELOPE)).toEqual({ sent: false, reason: 'quota' });
  });

  it('配额耗尽时不发请求', async () => {
    const { pool } = fakeQuotaPool();
    const f = fakeFetch(ok);
    const deps = mailer({ pool, dailyBudget: 0, fetch: f.fn });
    await sendMail(deps, ENVELOPE);
    expect(f.calls).toEqual([]);
  });

  it('群发预算用尽后，交易邮件仍能发——那 20 封就是留给它的', async () => {
    const { pool } = fakeQuotaPool();
    const deps = mailer({ pool, dailyBudget: 1 });
    await sendMail(deps, ENVELOPE);
    expect(await sendMail(deps, ENVELOPE)).toEqual({ sent: false, reason: 'quota' });
    const txn = await sendMail(deps, { ...ENVELOPE, kind: 'transactional' });
    expect(txn).toEqual({ sent: true, id: 'msg_1' });
  });

  it('交易邮件也越不过供应商硬顶', async () => {
    const { pool } = fakeQuotaPool();
    const deps = mailer({ pool, dailyBudget: 80 });
    for (let i = 0; i < HARD_DAILY_CAP; i += 1) {
      await sendMail(deps, { ...ENVELOPE, kind: 'transactional' });
    }
    expect(await sendMail(deps, { ...ENVELOPE, kind: 'transactional' })).toEqual({
      sent: false,
      reason: 'quota',
    });
  });

  it('预算高过硬顶时以硬顶为准', async () => {
    const { pool } = fakeQuotaPool();
    const deps = mailer({ pool, dailyBudget: 5000 });
    for (let i = 0; i < HARD_DAILY_CAP; i += 1) await sendMail(deps, ENVELOPE);
    expect(await sendMail(deps, ENVELOPE)).toEqual({ sent: false, reason: 'quota' });
  });

  it('供应商拒收时带上状态码', async () => {
    const f = fakeFetch(
      () =>
        new Response(JSON.stringify({ message: 'Daily quota exceeded' }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const res = await sendMail(mailer({ fetch: f.fn }), ENVELOPE);
    expect(res).toEqual({
      sent: false,
      reason: 'rejected',
      status: 429,
      detail: 'Daily quota exceeded',
    });
  });

  it('拒收后配额不退还——发没发出去这一侧分辨不了', async () => {
    const { pool } = fakeQuotaPool();
    const f = fakeFetch(() => new Response('nope', { status: 500 }));
    await sendMail(mailer({ pool, fetch: f.fn }), ENVELOPE);
    expect(await quotaUsed(pool, '2026-09-20')).toBe(1);
  });

  it('请求发不出去时状态码为 0', async () => {
    const f = fakeFetch(() => {
      throw new Error('getaddrinfo ENOTFOUND api.resend.com');
    });
    const res = await sendMail(mailer({ fetch: f.fn }), ENVELOPE);
    expect(res).toMatchObject({ sent: false, reason: 'rejected', status: 0 });
  });

  it('响应不是 JSON 时仍算发出，id 留空', async () => {
    const f = fakeFetch(() => new Response('', { status: 200 }));
    expect(await sendMail(mailer({ fetch: f.fn }), ENVELOPE)).toEqual({ sent: true, id: '' });
  });
});

describe('法定告知取自站点原文', () => {
  it('英文版含英欧与韩国两节', () => {
    const notice = withdrawalNotice('en');
    expect(notice).toContain('If you are a consumer in the UK or the EU');
    expect(notice).toContain('If you are a consumer in the Republic of Korea');
    expect(notice).toContain('Consumer Contracts Regulations 2013');
    expect(notice).toContain('Article 17');
  });

  it('韩文版是韩文，含청약철회与条号', () => {
    const notice = withdrawalNotice('ko');
    expect(notice).toContain('청약철회');
    expect(notice).toContain('제17조제2항제5호');
    expect(notice).toContain('한국소비자원');
  });

  it('只去 Markdown 记号，字句与 refund.md 一致', () => {
    const notice = withdrawalNotice('en');
    const source = readFileSync(join(DEFAULT_LEGAL_DIR, 'en', 'refund.md'), 'utf8')
      .replace(/\*\*(.+?)\*\*/gs, '$1')
      .replace(/<(https?:\/\/[^>]+)>/g, '$1')
      .replace(/^## /gm, '');
    for (const line of notice.split('\n')) {
      if (line.trim() === '') continue;
      expect(source).toContain(line);
    }
    expect(notice).not.toContain('**');
  });

  it('不含退款政策里与法定权利无关的小节', () => {
    const notice = withdrawalNotice('en');
    expect(notice).not.toContain('If you bought on Agensi');
    expect(notice).not.toContain('## Questions');
  });

  it('两种语言都能取到', () => {
    const notices = loadNotices();
    expect(notices.en.length).toBeGreaterThan(200);
    expect(notices.ko.length).toBeGreaterThan(200);
  });

  it('小节标题对不上时抛错，而不是发出一封缺告知的信', () => {
    const dir = mkdtempSync(join(tmpdir(), 'legal-'));
    mkdirSync(join(dir, 'en'));
    writeFileSync(join(dir, 'en', 'refund.md'), '---\nslug: refund\n---\n\n## Something else\n\nx\n');
    expect(() => withdrawalNotice('en', dir)).toThrow(LegalTextError);
  });

  it('文件缺失时抛错', () => {
    const dir = mkdtempSync(join(tmpdir(), 'legal-'));
    expect(() => withdrawalNotice('ko', dir)).toThrow(LegalTextError);
  });
});

describe('邮件正文', () => {
  const args = {
    lang: 'en' as const,
    orderId: 'ord_abc',
    downloadUrl: 'https://tryteachflow.com/download?t=xyz&lang=en',
    ttlDays: 30,
    skillCount: 6,
    notice: withdrawalNotice('en'),
  };

  it('交付邮件逐字包含法定告知', () => {
    const mail = deliveryMail(args);
    expect(mail.text).toContain(withdrawalNotice('en'));
  });

  it('韩文交付邮件用韩文告知', () => {
    const mail = deliveryMail({ ...args, lang: 'ko', notice: withdrawalNotice('ko') });
    expect(mail.subject).toBe('TeachFlow 다운로드 링크');
    expect(mail.text).toContain(withdrawalNotice('ko'));
    expect(mail.text).toContain('구매해 주셔서 감사합니다.');
  });

  it('交付邮件带下载地址、有效期与订单号', () => {
    const mail = deliveryMail(args);
    expect(mail.text).toContain(args.downloadUrl);
    expect(mail.text).toContain('works for 30 days');
    expect(mail.text).toContain('ord_abc');
  });

  it('落款与站点页脚同一行文', () => {
    expect(DISCLOSURE).toBe('CROSSXTOP LTD · Registered in England and Wales · Company No. 16339041');
    expect(deliveryMail(args).text).toContain(DISCLOSURE);
  });

  it('更新通知带版本号与 changelog，不含法定告知', () => {
    const mail = updateMail({
      lang: 'en',
      skillId: 'lesson-workflow',
      version: '1.1.0',
      changelog: 'Adds a worked example.',
      downloadUrl: args.downloadUrl,
    });
    expect(mail.subject).toBe('TeachFlow update: lesson-workflow 1.1.0');
    expect(mail.text).toContain('Adds a worked example.');
    expect(mail.text).not.toContain('Consumer Contracts Regulations');
  });

  it('重发邮件告诉收件人「不是你发起的就忽略」', () => {
    const mail = resendMail({
      lang: 'en',
      orderId: 'ord_abc',
      downloadUrl: args.downloadUrl,
      ttlDays: 30,
    });
    expect(mail.text).toContain('If you did not ask for this, ignore this email.');
  });

  it('三种邮件都不用感叹号，也不含 emoji', () => {
    const texts = [
      deliveryMail(args).text,
      deliveryMail({ ...args, lang: 'ko', notice: withdrawalNotice('ko') }).text,
      updateMail({
        lang: 'ko',
        skillId: 'lesson-workflow',
        version: '1.1.0',
        changelog: '예시를 하나 더했습니다.',
        downloadUrl: args.downloadUrl,
      }).text,
      resendMail({ lang: 'ko', orderId: 'ord_abc', downloadUrl: args.downloadUrl, ttlDays: 30 })
        .text,
    ];
    for (const t of texts) {
      expect(t).not.toContain('!');
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
