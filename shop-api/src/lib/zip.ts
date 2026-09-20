import { crc32, inflateRawSync, deflateRawSync } from 'node:zlib';

// 最小 zip 读写。只覆盖我们自己产出的包：无 zip64、无加密、无跨盘。
// 够用就停——解析面越小，能被喂进来的畸形结构越少。

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const CENTRAL_FIXED = 46;
const LOCAL_FIXED = 30;
const EOCD_FIXED = 22;

export const METHOD_STORE = 0;
export const METHOD_DEFLATE = 8;

export interface ZipEntry {
  name: string;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  /** 以 '/' 结尾的条目是目录记录，没有内容。 */
  isDirectory: boolean;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

interface Eocd {
  entryCount: number;
  cdSize: number;
  cdOffset: number;
  offset: number;
}

function findEocd(buf: Buffer): Eocd {
  if (buf.length < EOCD_FIXED) throw new ZipError('文件太小，不是 zip');
  // 注释最长 65535 字节，从尾部往前找签名即可。
  const earliest = Math.max(0, buf.length - EOCD_FIXED - 0xffff);
  for (let i = buf.length - EOCD_FIXED; i >= earliest; i -= 1) {
    if (buf.readUInt32LE(i) !== SIG_EOCD) continue;
    const commentLen = buf.readUInt16LE(i + 20);
    if (i + EOCD_FIXED + commentLen !== buf.length) continue;
    const entryCount = buf.readUInt16LE(i + 10);
    const cdSize = buf.readUInt32LE(i + 12);
    const cdOffset = buf.readUInt32LE(i + 16);
    if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      throw new ZipError('不支持 zip64');
    }
    if (buf.readUInt16LE(i + 4) !== 0 || buf.readUInt16LE(i + 6) !== 0) {
      throw new ZipError('不支持跨盘 zip');
    }
    if (cdOffset + cdSize > buf.length) throw new ZipError('中央目录越界');
    return { entryCount, cdSize, cdOffset, offset: i };
  }
  throw new ZipError('找不到中央目录结束记录，不是 zip');
}

export function readCentralDirectory(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  const entries: ZipEntry[] = [];
  let p = eocd.cdOffset;

  for (let n = 0; n < eocd.entryCount; n += 1) {
    if (p + CENTRAL_FIXED > eocd.cdOffset + eocd.cdSize) {
      throw new ZipError('中央目录条目被截断');
    }
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) throw new ZipError('中央目录签名错误');

    const flags = buf.readUInt16LE(p + 8);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + CENTRAL_FIXED, p + CENTRAL_FIXED + nameLen);

    entries.push({
      name,
      method: buf.readUInt16LE(p + 10),
      crc32: buf.readUInt32LE(p + 16),
      compressedSize: buf.readUInt32LE(p + 20),
      uncompressedSize: buf.readUInt32LE(p + 24),
      localHeaderOffset: buf.readUInt32LE(p + 42),
      isDirectory: name.endsWith('/'),
    });

    p += CENTRAL_FIXED + nameLen + extraLen + commentLen;
  }

  return entries;
}

/** 解出一个条目的内容。用中央目录里的尺寸作准，本地头只用来定位数据起点。 */
export function readEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const p = entry.localHeaderOffset;
  if (p + LOCAL_FIXED > buf.length) throw new ZipError(`${entry.name}：本地头越界`);
  if (buf.readUInt32LE(p) !== SIG_LOCAL) throw new ZipError(`${entry.name}：本地头签名错误`);

  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + LOCAL_FIXED + nameLen + extraLen;
  const end = start + entry.compressedSize;
  if (end > buf.length) throw new ZipError(`${entry.name}：数据越界`);

  const raw = buf.subarray(start, end);
  if (entry.method === METHOD_STORE) return Buffer.from(raw);
  if (entry.method === METHOD_DEFLATE) return inflateRawSync(raw);
  throw new ZipError(`${entry.name}：不支持的压缩方法 ${entry.method}`);
}

function dosDateTime(date: Date): { time: number; date: number } {
  // zip 的时间戳只有 2 秒精度，1980 是纪元。
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

interface Encoded {
  nameBuf: Buffer;
  body: Buffer;
  method: number;
  crc: number;
  uncompressedSize: number;
  time: number;
  date: number;
}

function encode(name: string, content: Buffer, mtime: Date): Encoded {
  const nameBuf = Buffer.from(name, 'utf8');
  const deflated = deflateRawSync(content, { level: 9 });
  const useDeflate = deflated.length < content.length;
  const { time, date } = dosDateTime(mtime);
  return {
    nameBuf,
    body: useDeflate ? deflated : content,
    method: useDeflate ? METHOD_DEFLATE : METHOD_STORE,
    crc: crc32(content),
    uncompressedSize: content.length,
    time,
    date,
  };
}

function localHeader(e: Encoded): Buffer {
  const h = Buffer.alloc(LOCAL_FIXED);
  h.writeUInt32LE(SIG_LOCAL, 0);
  h.writeUInt16LE(20, 4); // version needed
  h.writeUInt16LE(0x800, 6); // 文件名按 UTF-8
  h.writeUInt16LE(e.method, 8);
  h.writeUInt16LE(e.time, 10);
  h.writeUInt16LE(e.date, 12);
  h.writeUInt32LE(e.crc, 14);
  h.writeUInt32LE(e.body.length, 18);
  h.writeUInt32LE(e.uncompressedSize, 22);
  h.writeUInt16LE(e.nameBuf.length, 26);
  h.writeUInt16LE(0, 28);
  return h;
}

function centralHeader(e: Encoded, localOffset: number): Buffer {
  const h = Buffer.alloc(CENTRAL_FIXED);
  h.writeUInt32LE(SIG_CENTRAL, 0);
  h.writeUInt16LE(20, 4); // version made by
  h.writeUInt16LE(20, 6); // version needed
  h.writeUInt16LE(0x800, 8);
  h.writeUInt16LE(e.method, 10);
  h.writeUInt16LE(e.time, 12);
  h.writeUInt16LE(e.date, 14);
  h.writeUInt32LE(e.crc, 16);
  h.writeUInt32LE(e.body.length, 20);
  h.writeUInt32LE(e.uncompressedSize, 24);
  h.writeUInt16LE(e.nameBuf.length, 28);
  h.writeUInt16LE(0, 30); // extra
  h.writeUInt16LE(0, 32); // comment
  h.writeUInt16LE(0, 34); // disk
  h.writeUInt16LE(0, 36); // internal attrs
  h.writeUInt32LE(0o644 << 16, 38); // external attrs：普通文件 rw-r--r--
  h.writeUInt32LE(localOffset, 42);
  return h;
}

function eocdRecord(entryCount: number, cdSize: number, cdOffset: number): Buffer {
  const h = Buffer.alloc(EOCD_FIXED);
  h.writeUInt32LE(SIG_EOCD, 0);
  h.writeUInt16LE(0, 4);
  h.writeUInt16LE(0, 6);
  h.writeUInt16LE(entryCount, 8);
  h.writeUInt16LE(entryCount, 10);
  h.writeUInt32LE(cdSize, 12);
  h.writeUInt32LE(cdOffset, 16);
  h.writeUInt16LE(0, 20);
  return h;
}

export interface ZipFileInput {
  name: string;
  content: Buffer | string;
}

/** 从零构造一个 zip。主要给测试与工具用。 */
export function buildZip(files: readonly ZipFileInput[], mtime = new Date('2026-01-01T00:00:00Z')): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const e = encode(file.name, Buffer.from(file.content as never), mtime);
    const lh = localHeader(e);
    centrals.push(centralHeader(e, offset), e.nameBuf);
    locals.push(lh, e.nameBuf, e.body);
    offset += lh.length + e.nameBuf.length + e.body.length;
  }

  const cd = Buffer.concat(centrals);
  return Buffer.concat([...locals, cd, eocdRecord(files.length, cd.length, offset)]);
}

/**
 * 往已有 zip 末尾追加一个条目：原有本地记录与中央目录字节原样保留，
 * 只在后面接一条新记录、补一条中央目录项、重写 EOCD。
 * 原条目的偏移不变，所以不需要重新压缩任何已有内容。
 */
export function appendEntry(
  buf: Buffer,
  name: string,
  content: Buffer | string,
  mtime = new Date('2026-01-01T00:00:00Z'),
): Buffer {
  const eocd = findEocd(buf);
  if (eocd.entryCount >= 0xfffe) throw new ZipError('条目数接近 16 位上限');

  const existingLocals = buf.subarray(0, eocd.cdOffset);
  const existingCd = buf.subarray(eocd.cdOffset, eocd.cdOffset + eocd.cdSize);

  const e = encode(name, Buffer.from(content as never), mtime);
  const lh = localHeader(e);
  const newLocalOffset = eocd.cdOffset;
  const ch = centralHeader(e, newLocalOffset);

  const newCdOffset = newLocalOffset + lh.length + e.nameBuf.length + e.body.length;
  const newCdSize = existingCd.length + ch.length + e.nameBuf.length;

  return Buffer.concat([
    existingLocals,
    lh,
    e.nameBuf,
    e.body,
    existingCd,
    ch,
    e.nameBuf,
    eocdRecord(eocd.entryCount + 1, newCdSize, newCdOffset),
  ]);
}
