import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { signRequest } from './sigv4.ts';

// 母版的权威副本在本机磁盘（MASTER_DIR）——下载请求要读它，走网络太慢也太脆。
// R2 是异地归档：机器没了还能把六个包和全部历史版本取回来。
// 所以写入分两步：putMaster 本地落盘（同步、必须成功），archiveMaster 推 R2
// （由 worker 异步做，失败可重试，不挡发版）。

export interface StorageOptions {
  masterDir: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** 便于测试注入。默认用全局 fetch。 */
  fetchImpl?: typeof fetch;
  /** 内存缓存上限，字节。默认 64 MiB。 */
  cacheBytes?: number;
}

export function masterKey(skillId: string, version: string): string {
  return `masters/${skillId}/${version}.zip`;
}

export class StorageError extends Error {}

export interface Storage {
  /** 本地落盘。发版路径上调用，必须成功。 */
  putMaster(skillId: string, version: string, buf: Buffer): Promise<void>;
  /** 推一份到 R2。worker 调用，失败可重试。 */
  archiveMaster(skillId: string, version: string, buf: Buffer): Promise<void>;
  /** 内存缓存 → 本地磁盘 → R2 回源（回源后补写本地）。 */
  getMaster(skillId: string, version: string): Promise<Buffer>;
  /** 健康检查用：能否与 R2 通上话。不抛错，只回布尔。 */
  probe(): Promise<boolean>;
}

export function createStorage(options: StorageOptions): Storage {
  const doFetch = options.fetchImpl ?? fetch;
  const limit = options.cacheBytes ?? 64 * 1024 * 1024;
  const endpoint = `https://${options.accountId}.r2.cloudflarestorage.com`;

  // Map 的迭代顺序就是插入顺序：命中时先删后插，队首自然是最久未用的。
  const cache = new Map<string, Buffer>();
  let cached = 0;

  function cacheGet(key: string): Buffer | undefined {
    const hit = cache.get(key);
    if (!hit) return undefined;
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  function cachePut(key: string, buf: Buffer): void {
    if (buf.length > limit) return;
    const existing = cache.get(key);
    if (existing) {
      cache.delete(key);
      cached -= existing.length;
    }
    cache.set(key, buf);
    cached += buf.length;
    while (cached > limit) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cached -= cache.get(oldest.value)!.length;
      cache.delete(oldest.value);
    }
  }

  function localPath(skillId: string, version: string): string {
    return path.join(options.masterDir, skillId, `${version}.zip`);
  }

  async function r2(method: string, key: string, body: Buffer): Promise<Response> {
    const url = `${endpoint}/${options.bucket}/${key}`;
    const headers = signRequest({
      method,
      url,
      headers: method === 'PUT' ? { 'content-type': 'application/zip' } : {},
      body,
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      region: 'auto',
      service: 's3',
    });
    return doFetch(url, {
      method,
      headers,
      body: method === 'PUT' ? new Uint8Array(body) : undefined,
    });
  }

  return {
    async putMaster(skillId, version, buf) {
      const target = localPath(skillId, version);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buf);
      cachePut(masterKey(skillId, version), buf);
    },

    async archiveMaster(skillId, version, buf) {
      const res = await r2('PUT', masterKey(skillId, version), buf);
      if (!res.ok) {
        throw new StorageError(`R2 归档失败：${res.status}`);
      }
    },

    async getMaster(skillId, version) {
      const key = masterKey(skillId, version);
      const hit = cacheGet(key);
      if (hit) return hit;

      try {
        const buf = await readFile(localPath(skillId, version));
        cachePut(key, buf);
        return buf;
      } catch {
        // 本地缺失走回源。正常情况下不会发生——只有换机或误删才会。
      }

      const res = await r2('GET', key, Buffer.alloc(0));
      if (!res.ok) {
        throw new StorageError(`母版不存在：${skillId}@${version}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const target = localPath(skillId, version);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buf);
      cachePut(key, buf);
      return buf;
    },

    async probe() {
      try {
        const res = await r2('GET', '', Buffer.alloc(0));
        // 列桶返回 200；权限不对会是 403。两者都说明网络与签名链路是通的，
        // 但只有 200 算健康。
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
