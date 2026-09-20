import type { Pool } from 'pg';
import { unarchivedReleases } from '../db/releases.ts';
import { releasesOwedNotices } from '../db/notices.ts';

/** 刚发布不到这么久的版本不碰——正常任务多半正在跑，抢它没有意义。 */
const SETTLE_MS = 60 * 60 * 1000;
/** 补发更新通知的回溯窗口。更久之前的版本不再补，见 releasesOwedNotices。 */
const NOTICE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** 单次最多补多少个归档。一次补完没有好处，只会把 R2 的出口占满。 */
const ARCHIVE_BATCH = 20;

export interface ReconcileDeps {
  pool: Pool;
  /** 与发版接口用的是同一个投递函数。 */
  enqueue(job: string, data: Record<string, unknown>): Promise<void>;
  now?(): Date;
}

export interface ReconcileResult {
  /** 补投了归档任务的 skill@version。 */
  archives: string[];
  /** 补投了更新通知任务的 release id。 */
  notices: string[];
}

/**
 * 每天一次的补救扫描。
 *
 * 存在的理由是发版接口里那个窗口：事务已提交、任务还没投递成功。pg-boss v10
 * 没法把投递塞进业务事务，所以那个窗口关不掉，只能事后补。接口在这种情况下
 * 回的是 500 并附上 release id，运维照样可以手动重投——这个任务是兜底，
 * 不是替代。
 *
 * 它自己不干活，只补投任务：真正的归档逻辑在 archive-master，发信逻辑在
 * notify-update，两者都已经做成可重复执行的。在这里再实现一遍就会有两份
 * 判断「什么算做完了」的代码，而它们迟早会不一致。
 */
export async function reconcile(deps: ReconcileDeps): Promise<ReconcileResult> {
  const now = deps.now ? deps.now() : new Date();

  const stale = await unarchivedReleases(
    deps.pool,
    new Date(now.getTime() - SETTLE_MS),
    ARCHIVE_BATCH,
  );
  const archives: string[] = [];
  for (const release of stale) {
    await deps.enqueue('archive-master', {
      skillId: release.skillId,
      version: release.version,
    });
    archives.push(`${release.skillId}@${release.version}`);
  }

  const owed = await releasesOwedNotices(deps.pool, new Date(now.getTime() - NOTICE_WINDOW_MS));
  const notices: string[] = [];
  for (const release of owed) {
    await deps.enqueue('notify-update', {
      releaseId: release.id,
      skillId: release.skillId,
      version: release.version,
    });
    notices.push(release.id);
  }

  return { archives, notices };
}
