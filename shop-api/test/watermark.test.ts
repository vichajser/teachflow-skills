import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildZip, readCentralDirectory, readEntry } from '../src/lib/zip.ts';
import { injectLicenceHolder, licenceHolderText, fingerprint } from '../src/lib/watermark.ts';
import { BRAND } from '../src/brand.ts';

const HOLDER = {
  skillId: 'lesson-workflow',
  version: '1.0.0',
  orderId: 'ord_abc123',
  email: 'Teacher@example.com',
  purchasedAt: new Date('2026-09-01T10:00:00Z'),
};

const SOURCE = buildZip([
  { name: 'lesson-workflow/SKILL.md', content: '---\nname: lesson-workflow\n---\n' },
  { name: 'lesson-workflow/LICENSE', content: 'TeachFlow Skill Licence\n' },
  { name: 'lesson-workflow/references/a.md', content: 'x'.repeat(3000) },
]);

const DOWNLOADED = new Date('2026-09-20T12:34:56Z');
const MARKED = injectLicenceHolder(SOURCE, HOLDER, DOWNLOADED);

describe('injectLicenceHolder', () => {
  it('产出的仍是可解析的 zip，且多出持有人记录', () => {
    const names = readCentralDirectory(MARKED).map((e) => e.name);
    expect(names).toContain('lesson-workflow/LICENSE-HOLDER.txt');
    expect(names).toHaveLength(4);
  });

  it('记录写在 skill 目录内，不在包根', () => {
    const names = readCentralDirectory(MARKED).map((e) => e.name);
    expect(names.every((n) => n.startsWith('lesson-workflow/'))).toBe(true);
  });

  it('记录含订单号、邮箱、版本与指纹', () => {
    const entry = readCentralDirectory(MARKED).find((e) => e.name.endsWith('LICENSE-HOLDER.txt'))!;
    const text = readEntry(MARKED, entry).toString('utf8');
    expect(text).toContain('ord_abc123');
    expect(text).toContain('Teacher@example.com');
    expect(text).toContain('1.0.0');
    expect(text).toContain(fingerprint(HOLDER));
  });

  it('原有条目的名称、CRC、偏移与内容一字节未变', () => {
    const before = readCentralDirectory(SOURCE);
    const after = readCentralDirectory(MARKED);
    for (let i = 0; i < before.length; i += 1) {
      expect(after[i]!.name).toBe(before[i]!.name);
      expect(after[i]!.crc32).toBe(before[i]!.crc32);
      expect(after[i]!.compressedSize).toBe(before[i]!.compressedSize);
      expect(after[i]!.localHeaderOffset).toBe(before[i]!.localHeaderOffset);
      expect(readEntry(MARKED, after[i]!)).toEqual(readEntry(SOURCE, before[i]!));
    }
  });

  it('不改动母版缓冲区本身', () => {
    const copy = Buffer.from(SOURCE);
    injectLicenceHolder(SOURCE, HOLDER, DOWNLOADED);
    expect(SOURCE).toEqual(copy);
  });

  it('同一笔订单重复下载得到相同字节', () => {
    expect(injectLicenceHolder(SOURCE, HOLDER, DOWNLOADED)).toEqual(MARKED);
  });
});

describe('fingerprint', () => {
  it('对大小写不同的同一邮箱稳定', () => {
    expect(fingerprint({ ...HOLDER, email: 'TEACHER@EXAMPLE.COM' })).toBe(fingerprint(HOLDER));
  });

  it('换订单、换 skill 都会变', () => {
    expect(fingerprint({ ...HOLDER, orderId: 'ord_other' })).not.toBe(fingerprint(HOLDER));
    expect(fingerprint({ ...HOLDER, skillId: 'ppt-workflow' })).not.toBe(fingerprint(HOLDER));
  });

  it('是 16 位十六进制，不泄露邮箱原文', () => {
    const fp = fingerprint(HOLDER);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    expect(fp).not.toContain('teacher');
  });
});

describe('licenceHolderText', () => {
  const text = licenceHolderText(HOLDER, DOWNLOADED);

  it('英韩双语，且含许可标识与主体信息', () => {
    expect(text).toContain('Licence holder record');
    expect(text).toContain('라이선스 보유자 기록');
    expect(text).toContain(BRAND.licenceId);
    expect(text).toContain(BRAND.companyName);
    expect(text).toContain(BRAND.companyNumber);
  });

  it('不含感叹号与表情符号', () => {
    expect(text).not.toMatch(/[!！]/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('不含 URL——记录是随包分发的静态文本，链接会过期', () => {
    expect(text).not.toMatch(/https?:\/\//);
  });
});

describe('brand 常量与站点 site.ts 同步', () => {
  it('产品名、公司名、公司号、注册地、客服邮箱四处一致', async () => {
    const siteTs = await readFile(
      path.join(import.meta.dirname, '..', '..', 'src', 'config', 'site.ts'),
      'utf8',
    );
    const read = (key: string): string | undefined =>
      new RegExp(`${key}:\\s*'([^']*)'`).exec(siteTs)?.[1];

    expect(read('productName')).toBe(BRAND.productName);
    expect(read('companyName')).toBe(BRAND.companyName);
    expect(read('companyNumber')).toBe(BRAND.companyNumber);
    expect(read('registeredIn')).toBe(BRAND.registeredIn);
    expect(read('supportEmail')).toBe(BRAND.supportEmail);
  });
});
