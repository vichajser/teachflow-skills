import PgBoss from 'pg-boss';

// 这是整个工程里唯一 import pg-boss 的地方。任务本身（archive-master、
// notify-update、send-delivery、reconcile）只收依赖、不认队列，所以它们能在没有队列的
// 情况下被直接调用和测试。

export const ARCHIVE_MASTER = 'archive-master';
export const NOTIFY_UPDATE = 'notify-update';
export const SEND_DELIVERY = 'send-delivery';
export const RECONCILE = 'reconcile';
export const PRUNE_RATE_LIMITS = 'prune-rate-limits';

export const QUEUES = [
  ARCHIVE_MASTER,
  NOTIFY_UPDATE,
  SEND_DELIVERY,
  RECONCILE,
  PRUNE_RATE_LIMITS,
] as const;

/**
 * 每个队列的重试策略。
 *
 * archive-master 给到十次、指数退避：它等的是 R2 恢复，而在此期间发版和下载
 * 都照常（两者只读本地母版），所以慢慢等没有代价。
 * notify-update 只重试五次：它抛错的唯一原因是投递方暂时不可用，真出了持续
 * 故障，每天的 reconcile 会重新投一份，不需要队列里那一条反复挣扎。
 */
function optionsFor(job: string): PgBoss.SendOptions {
  if (job === ARCHIVE_MASTER) {
    return { retryLimit: 10, retryDelay: 120, retryBackoff: true };
  }
  if (job === NOTIFY_UPDATE) {
    return { retryLimit: 5, retryDelay: 60, retryBackoff: true };
  }
  return { retryLimit: 3, retryDelay: 60 };
}

export function createBoss(databaseUrl: string): PgBoss {
  const boss = new PgBoss({ connectionString: databaseUrl });
  // 不挂这个监听，pg-boss 内部的错误会变成 unhandled error 直接掀掉进程。
  boss.on('error', (err: Error) => {
    console.error('[boss]', err.message);
  });
  return boss;
}

/** v10 要求队列先存在才能投递。重复建是无操作，每次启动都调一遍最省事。 */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of QUEUES) {
    await boss.createQueue(name);
  }
}

/**
 * 投递一个任务。发版接口注入的就是它。
 *
 * extra 用来传 startAfter（配额顺延）与 singletonKey（reconcile 的补投去重）。
 * 顺延那一次刻意不带 singletonKey：顺延是在任务自己还活着的时候投的，
 * 带上 key 会被当成「已经有一个同键的在跑」而丢掉，剩下的信就再也发不出去。
 */
export async function enqueue(
  boss: PgBoss,
  job: string,
  data: Record<string, unknown>,
  extra: PgBoss.SendOptions = {},
): Promise<void> {
  await boss.send(job, data, { ...optionsFor(job), ...extra });
}
