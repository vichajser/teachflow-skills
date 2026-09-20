import type { Pool } from 'pg';
import type { Storage } from '../lib/storage.ts';
import { getRelease, markArchived } from '../db/releases.ts';

export interface ArchiveDeps {
  pool: Pool;
  storage: Storage;
  now?(): Date;
}

export interface ArchiveData {
  skillId: string;
  version: string;
}

export type ArchiveOutcome =
  /** 本次推上去了。 */
  | 'archived'
  /** 之前已经归档过，什么也没做。 */
  | 'already'
  /** 库里没有这条发版记录，重试也不会有。 */
  | 'missing';

/**
 * 把母版 zip 推一份到 R2。
 *
 * 读的是本地母版（storage.getMaster 先查缓存再查磁盘），不是重新打包——
 * 归档的必须与卖出去的是同一份字节，重新打包会得到一个 sha256 对不上的包。
 *
 * 存储层出错就往上抛，交给 pg-boss 重试：R2 不可用是会自己恢复的那类故障，
 * 而在它恢复之前，发版与下载都不受影响（两者都只读本地母版）。
 */
export async function archiveMaster(
  deps: ArchiveDeps,
  data: ArchiveData,
): Promise<ArchiveOutcome> {
  const release = await getRelease(deps.pool, data.skillId, data.version);
  // 记录不存在就不是「等一会儿再试」能解决的，别让它在队列里反复重试。
  if (!release) return 'missing';
  if (release.archivedAt) return 'already';

  const buf = await deps.storage.getMaster(data.skillId, data.version);
  await deps.storage.archiveMaster(data.skillId, data.version, buf);
  await markArchived(deps.pool, release.id, deps.now ? deps.now() : new Date());
  return 'archived';
}
