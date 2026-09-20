import { describe, it, expect } from 'vitest';
import { buildZip, appendEntry, readCentralDirectory, readEntry, ZipError } from '../src/lib/zip.ts';

const FILES = [
  { name: 'lesson-workflow/SKILL.md', content: '---\nname: lesson-workflow\n---\n본문\n' },
  { name: 'lesson-workflow/references/a.md', content: 'x'.repeat(4000) },
  { name: 'lesson-workflow/LICENSE', content: 'TeachFlow Skill Licence\n' },
];

describe('buildZip / readCentralDirectory', () => {
  it('往返一致，条目顺序保留', () => {
    const entries = readCentralDirectory(buildZip(FILES));
    expect(entries.map((e) => e.name)).toEqual(FILES.map((f) => f.name));
  });

  it('条目内容可原样读回，含非 ASCII', () => {
    const buf = buildZip(FILES);
    const entries = readCentralDirectory(buf);
    expect(readEntry(buf, entries[0]!).toString('utf8')).toBe(FILES[0]!.content);
    expect(readEntry(buf, entries[1]!).toString('utf8')).toBe(FILES[1]!.content);
  });

  it('可压缩内容走 deflate，不可压缩内容退回 store', () => {
    const entries = readCentralDirectory(
      buildZip([
        { name: 's/big.md', content: 'x'.repeat(4000) },
        { name: 's/tiny.md', content: 'a' },
      ]),
    );
    expect(entries[0]!.method).toBe(8);
    expect(entries[0]!.compressedSize).toBeLessThan(entries[0]!.uncompressedSize);
    expect(entries[1]!.method).toBe(0);
  });

  it('目录条目被识别', () => {
    const entries = readCentralDirectory(buildZip([{ name: 's/refs/', content: '' }]));
    expect(entries[0]!.isDirectory).toBe(true);
  });

  it('非 zip 字节抛 ZipError', () => {
    expect(() => readCentralDirectory(Buffer.from('not a zip at all'))).toThrow(ZipError);
    expect(() => readCentralDirectory(Buffer.alloc(0))).toThrow(ZipError);
  });

  it('中央目录偏移被改坏时抛错而不是返回垃圾', () => {
    const buf = buildZip(FILES);
    buf.writeUInt32LE(0, buf.length - 6); // EOCD 的 cdOffset
    expect(() => readCentralDirectory(buf)).toThrow(ZipError);
  });
});

describe('appendEntry', () => {
  const original = buildZip(FILES);
  const appended = appendEntry(original, 'lesson-workflow/LICENSE-HOLDER.txt', 'order: ord_1\n');

  it('追加后仍是可解析的 zip，条目数加一', () => {
    const entries = readCentralDirectory(appended);
    expect(entries).toHaveLength(FILES.length + 1);
    expect(entries.at(-1)!.name).toBe('lesson-workflow/LICENSE-HOLDER.txt');
  });

  it('新条目内容正确', () => {
    const entries = readCentralDirectory(appended);
    expect(readEntry(appended, entries.at(-1)!).toString('utf8')).toBe('order: ord_1\n');
  });

  it('原有条目的名称、CRC、偏移、内容全部不变', () => {
    const before = readCentralDirectory(original);
    const after = readCentralDirectory(appended).slice(0, before.length);
    for (let i = 0; i < before.length; i += 1) {
      expect(after[i]!.name).toBe(before[i]!.name);
      expect(after[i]!.crc32).toBe(before[i]!.crc32);
      expect(after[i]!.localHeaderOffset).toBe(before[i]!.localHeaderOffset);
      expect(readEntry(appended, after[i]!)).toEqual(readEntry(original, before[i]!));
    }
  });

  it('可以连续追加两次', () => {
    const twice = appendEntry(appended, 'lesson-workflow/NOTE.txt', 'n');
    expect(readCentralDirectory(twice)).toHaveLength(FILES.length + 2);
    expect(readEntry(twice, readCentralDirectory(twice).at(-1)!).toString()).toBe('n');
  });
});
