import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStorage, masterKey, StorageError, type Storage } from '../src/lib/storage.ts';

const CREDS = {
  accountId: 'acct',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  bucket: 'teachflow-masters',
};

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function fakeR2(objects: Map<string, Buffer>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    calls.push({
      url: href,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const key = href.split(`/${CREDS.bucket}/`)[1] ?? '';
    if (init?.method === 'PUT') {
      objects.set(key, Buffer.from(init.body as Uint8Array));
      return new Response(null, { status: 200 });
    }
    const hit = objects.get(key);
    if (!hit) return new Response('no such key', { status: 404 });
    return new Response(new Uint8Array(hit), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

let dir: string;
let objects: Map<string, Buffer>;
let calls: Call[];
let storage: Storage;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'tf-master-'));
  objects = new Map();
  const r2 = fakeR2(objects);
  calls = r2.calls;
  storage = createStorage({ ...CREDS, masterDir: dir, fetchImpl: r2.fetchImpl });
});

describe('masterKey', () => {
  it('按 skill 与版本分目录，版本在文件名里', () => {
    expect(masterKey('lesson-workflow', '1.2.0')).toBe('masters/lesson-workflow/1.2.0.zip');
  });
});

describe('putMaster', () => {
  it('落到本地磁盘，路径可预测', async () => {
    await storage.putMaster('lesson-workflow', '1.0.0', Buffer.from('zip-bytes'));
    const onDisk = await readFile(path.join(dir, 'lesson-workflow', '1.0.0.zip'));
    expect(onDisk.toString()).toBe('zip-bytes');
  });

  it('不碰 R2——归档是 worker 的事，不挡发版', async () => {
    await storage.putMaster('lesson-workflow', '1.0.0', Buffer.from('zip-bytes'));
    expect(calls).toHaveLength(0);
  });
});

describe('archiveMaster', () => {
  it('PUT 到 bucket 下的母版键，且带签名头', async () => {
    await storage.archiveMaster('ppt-workflow', '2.0.1', Buffer.from('archive-me'));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.url).toBe(
      'https://acct.r2.cloudflarestorage.com/teachflow-masters/masters/ppt-workflow/2.0.1.zip',
    );
    expect(calls[0]!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
    expect(objects.get('masters/ppt-workflow/2.0.1.zip')!.toString()).toBe('archive-me');
  });

  it('非 2xx 抛 StorageError，让 worker 重试', async () => {
    const failing = createStorage({
      ...CREDS,
      masterDir: dir,
      fetchImpl: (async () => new Response('denied', { status: 403 })) as unknown as typeof fetch,
    });
    await expect(failing.archiveMaster('a', '1.0.0', Buffer.alloc(1))).rejects.toBeInstanceOf(
      StorageError,
    );
  });
});

describe('getMaster', () => {
  it('本地命中就不联网', async () => {
    await storage.putMaster('lesson-workflow', '1.0.0', Buffer.from('local'));
    expect((await storage.getMaster('lesson-workflow', '1.0.0')).toString()).toBe('local');
    expect(calls).toHaveLength(0);
  });

  it('本地缺失时回源 R2，并补写本地副本', async () => {
    objects.set('masters/word-workflow/1.0.0.zip', Buffer.from('from-r2'));
    const got = await storage.getMaster('word-workflow', '1.0.0');
    expect(got.toString()).toBe('from-r2');
    expect(calls).toHaveLength(1);

    const onDisk = await readFile(path.join(dir, 'word-workflow', '1.0.0.zip'));
    expect(onDisk.toString()).toBe('from-r2');
  });

  it('两处都没有就抛 StorageError', async () => {
    await expect(storage.getMaster('nope', '1.0.0')).rejects.toBeInstanceOf(StorageError);
  });

  it('第二次从内存缓存出，磁盘文件被删掉也照样返回', async () => {
    await storage.putMaster('lesson-workflow', '1.0.0', Buffer.from('cached'));
    await storage.getMaster('lesson-workflow', '1.0.0');
    await rm(path.join(dir, 'lesson-workflow', '1.0.0.zip'));

    expect((await storage.getMaster('lesson-workflow', '1.0.0')).toString()).toBe('cached');
    expect(calls).toHaveLength(0);
  });
});

describe('LRU 淘汰', () => {
  // 缓存只留得下两份 4 字节的包。
  async function tinyCache() {
    const r2 = fakeR2(objects);
    const s = createStorage({ ...CREDS, masterDir: dir, fetchImpl: r2.fetchImpl, cacheBytes: 9 });
    for (const v of ['1.0.0', '2.0.0', '3.0.0']) {
      objects.set(`masters/a/${v}.zip`, Buffer.from('aaaa'));
      await s.putMaster('a', v, Buffer.from('aaaa'));
      await rm(path.join(dir, 'a', `${v}.zip`)); // 抹掉本地，让缓存未命中必然走 R2
    }
    return { s, calls: r2.calls };
  }

  it('超出上限时淘汰最久未用的那份', async () => {
    const { s, calls: c } = await tinyCache();
    // 先查最新的：还在缓存里，不该联网。
    await s.getMaster('a', '3.0.0');
    expect(c).toHaveLength(0);
    // 最早写入的那份已被挤出，只能回源。
    await s.getMaster('a', '1.0.0');
    expect(c).toHaveLength(1);
  });

  it('命中会刷新位置——刚用过的不会被下一次写入挤掉', async () => {
    const { s, calls: c } = await tinyCache();
    await s.getMaster('a', '2.0.0'); // 命中，2.0.0 变成最近使用
    objects.set('masters/a/4.0.0.zip', Buffer.from('aaaa'));
    await s.putMaster('a', '4.0.0', Buffer.from('aaaa')); // 挤掉 3.0.0
    await rm(path.join(dir, 'a', '4.0.0.zip'));

    const before = c.length;
    await s.getMaster('a', '2.0.0');
    expect(c).toHaveLength(before);
  });

  it('单个包大过整个上限就不进缓存，但内容照常返回', async () => {
    const r2 = fakeR2(objects);
    const s = createStorage({ ...CREDS, masterDir: dir, fetchImpl: r2.fetchImpl, cacheBytes: 2 });
    objects.set('masters/a/1.0.0.zip', Buffer.from('aaaa'));
    await s.putMaster('a', '1.0.0', Buffer.from('aaaa'));
    await rm(path.join(dir, 'a', '1.0.0.zip'));

    expect((await s.getMaster('a', '1.0.0')).toString()).toBe('aaaa');
    expect(r2.calls).toHaveLength(1);
  });
});

describe('probe', () => {
  it('列桶返回 200 算健康', async () => {
    objects.set('', Buffer.from('<ListBucketResult/>'));
    expect(await storage.probe()).toBe(true);
  });

  it('网络异常不抛错，只回 false', async () => {
    const broken = createStorage({
      ...CREDS,
      masterDir: dir,
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    expect(await broken.probe()).toBe(false);
  });
});
