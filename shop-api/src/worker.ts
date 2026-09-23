import { loadConfig } from './config.ts';
import { getPool, closePool } from './db/pool.ts';
import { createStorage } from './lib/storage.ts';
import { pruneRateLimits } from './lib/ratelimit.ts';
import { archiveMaster } from './jobs/archive-master.ts';
import { notifyUpdate, type NotifyData } from './jobs/notify-update.ts';
import { sendDelivery, type DeliveryData } from './jobs/send-delivery.ts';
import { reconcile } from './jobs/reconcile.ts';
import {
  ARCHIVE_MASTER,
  NOTIFY_UPDATE,
  SEND_DELIVERY,
  PRUNE_RATE_LIMITS,
  RECONCILE,
  createBoss,
  ensureQueues,
  enqueue,
} from './jobs/queue.ts';

// 后台进程。与 API 分开跑，理由只有一个：一次几十封的邮件扇出会把事件循环
// 占住好几秒，而下载接口是买家点了链接就在等的东西，不能陪着一起卡。
//
// 这个进程按「只有一份」设计。notify-update 是先查待发名单、再逐封发、发一封
// 记一笔，两份同时跑会在名单还没写完时读到同一批收件人，于是同一个人收两封。
// systemd 单元里没有任何让它起多份的配置，部署时也不要手动多起。

/**
 * pg-boss v10 的 work handler 收到的是一个 Job 数组。
 *
 * 这里仍然做一次形状判断：这个包在本机装不上（npm 镜像取不到），worker 从
 * 来没有真正跑起来过，靠读文档写下的 API 细节值不上一次线上崩溃。判断本身
 * 只有一行，猜错也不会有代价。
 */
function jobsOf<T>(arg: unknown): { id: string; data: T }[] {
  const list = Array.isArray(arg) ? arg : [arg];
  return list as { id: string; data: T }[];
}

/**
 * reconcile 补投时的去重键：同一个「对象」只排一个。
 *
 * 归档的对象是 skill@version，通知的对象是 release id；两边都带上任务名，
 * 免得将来加了别的队列时两个不同的任务撞上同一个键。
 */
function singletonKeyFor(job: string, data: Record<string, unknown>): string {
  const subject = data.releaseId ?? `${String(data.skillId)}@${String(data.version)}`;
  return `${job}:${String(subject)}`;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = getPool(config.databaseUrl);
  const storage = createStorage({
    masterDir: config.masterDir,
    accountId: config.r2.accountId,
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
    bucket: config.r2.bucket,
  });

  const boss = createBoss(config.databaseUrl);
  await boss.start();
  await ensureQueues(boss);

  await boss.work(ARCHIVE_MASTER, { batchSize: 1 }, async (arg: unknown) => {
    for (const job of jobsOf<{ skillId: string; version: string }>(arg)) {
      const outcome = await archiveMaster({ pool, storage }, job.data);
      console.log(`[archive] ${job.data.skillId}@${job.data.version} ${outcome}`);
    }
  });

  await boss.work(NOTIFY_UPDATE, { batchSize: 1 }, async (arg: unknown) => {
    for (const job of jobsOf<NotifyData>(arg)) {
      const result = await notifyUpdate(
        {
          pool,
          mailer: {
            apiKey: config.resendApiKey,
            from: config.mailFrom,
            replyTo: config.mailReplyTo,
            pool,
            dailyBudget: config.dailyMailBudget,
          },
          tokenSecret: config.downloadTokenSecret,
          ttlDays: config.downloadTokenTtlDays,
          publicBaseUrl: config.publicBaseUrl,
          // 顺延不带 singletonKey：见 queue.ts 里 enqueue 的注释。
          reschedule: (at, data) => enqueue(boss, NOTIFY_UPDATE, { ...data }, { startAfter: at }),
        },
        job.data,
      );
      console.log(
        `[notify] release ${job.data.releaseId} sent=${result.sent} dropped=${result.dropped}` +
          (result.rescheduledAt ? ` 顺延至 ${result.rescheduledAt.toISOString()}，还欠 ${result.remaining} 封` : ''),
      );
    }
  });

  await boss.work(SEND_DELIVERY, { batchSize: 1 }, async (arg: unknown) => {
    for (const job of jobsOf<DeliveryData>(arg)) {
      const result = await sendDelivery(
        {
          pool,
          mailer: {
            apiKey: config.resendApiKey,
            from: config.mailFrom,
            replyTo: config.mailReplyTo,
            pool,
            dailyBudget: config.dailyMailBudget,
          },
          tokenSecret: config.downloadTokenSecret,
          ttlDays: config.downloadTokenTtlDays,
          publicBaseUrl: config.publicBaseUrl,
        },
        job.data,
      );
      console.log(`[delivery] order ${job.data.orderId} ${result}`);
    }
  });

  await boss.work(RECONCILE, { batchSize: 1 }, async () => {
    const result = await reconcile({
      pool,
      // 补投带 singletonKey：同一个对象已经排着队时不再排第二个。
      // 去重只是让队列干净，正确性靠的是 releases.archived_at 与 update_notices。
      enqueue: (job, data) => enqueue(boss, job, data, { singletonKey: singletonKeyFor(job, data) }),
    });
    console.log(
      `[reconcile] 补投归档 ${result.archives.length} 个，补投通知 ${result.notices.length} 个`,
    );
  });

  await boss.work(PRUNE_RATE_LIMITS, { batchSize: 1 }, async () => {
    // 最长的窗口是一小时级别，留一天余量足够，也顺便留出排查现场。
    const before = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const removed = await pruneRateLimits(pool, before);
    console.log(`[prune] 清掉 ${removed} 行限流记录`);
  });

  // 两个定时任务都避开整点：整点是所有人的默认值，外部依赖在那一刻最忙。
  // reconcile 排在 02:40 UTC，比配额顺延的 00:05 晚两个多小时，免得它在
  // 顺延那一轮还没发完时就去补投同一个版本。
  await boss.schedule(RECONCILE, '40 2 * * *', {}, { tz: 'UTC' });
  await boss.schedule(PRUNE_RATE_LIMITS, '10 4 * * *', {}, { tz: 'UTC' });

  console.log('[worker] 已就绪');

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    // systemd 重启时 SIGTERM 可能连着来两次，第二次不该再走一遍关闭流程。
    if (stopping) return;
    stopping = true;
    console.log(`[worker] 收到 ${signal}，等当前任务跑完`);
    // wait: true 让 pg-boss 把手上的任务做完再断开——中途掐断会留下一条
    // active 状态的任务，要等它超时才会被别人接手。
    await boss.stop({ wait: true });
    await closePool();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('[worker] 启动失败：', err instanceof Error ? err.message : err);
  process.exit(1);
});
