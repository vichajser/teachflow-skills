import { createServer } from 'node:http';
import { loadConfig } from './config.ts';
import { getPool, closePool } from './db/pool.ts';
import { createRouter } from './http/router.ts';
import { sendError } from './http/respond.ts';
import { createStorage } from './lib/storage.ts';
import { loadNotices } from './lib/legal.ts';
import { getAdapter } from './mor/index.ts';
import { healthRoute } from './routes/health.ts';
import { downloadPageRoute, downloadFileRoute } from './routes/download.ts';
import { resendLinkRoute } from './routes/resend-link.ts';
import { adminReleasesRoute, releasesListRoute } from './routes/admin-releases.ts';
import { webhookRoute } from './routes/webhooks.ts';
import { createBoss, ensureQueues, enqueue } from './jobs/queue.ts';

// 对外的那一半。后台任务在 worker.ts 里另起一个进程，理由见那个文件的开头。
//
// 这个进程只监听 127.0.0.1：外面站着 Caddy，它负责 TLS 与把 /api/* 和
// /download 转进来。直接对公网开一个没有 TLS 的端口没有任何用处。
const BIND = '127.0.0.1';

async function main(): Promise<void> {
  // 下面三件事都刻意放在监听之前：配置缺项、MoR 供应商没实现、退款政策
  // 原文取不到——三者都会让某一类请求在运行时静默地走错，而它们全都是
  // 部署时一次就能发现的问题。宁可起不来。
  const config = loadConfig();
  const adapter = getAdapter(config.morProvider);
  loadNotices();

  const pool = getPool(config.databaseUrl);
  const storage = createStorage({
    masterDir: config.masterDir,
    accountId: config.r2.accountId,
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
    bucket: config.r2.bucket,
  });

  // API 侧只投递任务，不消费——work() 全部在 worker.ts 里。
  const boss = createBoss(config.databaseUrl);
  await boss.start();
  await ensureQueues(boss);
  const put = (job: string, data: Record<string, unknown>): Promise<void> =>
    enqueue(boss, job, data);

  const mailer = {
    apiKey: config.resendApiKey,
    from: config.mailFrom,
    pool,
    dailyBudget: config.dailyMailBudget,
  };

  const router = createRouter(config.publicBaseUrl);

  router.add('GET', '/api/health', healthRoute({ pool, probeStorage: () => storage.probe() }));

  const download = {
    pool,
    storage,
    tokenSecret: config.downloadTokenSecret,
  };
  router.add('GET', '/download', downloadPageRoute(download));
  router.add('GET', '/api/download/:skillId', downloadFileRoute(download));

  router.add(
    'POST',
    '/api/orders/resend-link',
    resendLinkRoute({
      pool,
      mailer,
      tokenSecret: config.downloadTokenSecret,
      ttlDays: config.downloadTokenTtlDays,
      publicBaseUrl: config.publicBaseUrl,
    }),
  );

  router.add(
    'POST',
    '/api/webhooks/polar',
    webhookRoute({
      adapter,
      secret: config.polarWebhookSecret,
      pool,
      skillIds: config.bundleSkillIds,
      enqueue: put,
    }),
  );

  router.add(
    'POST',
    '/api/admin/releases',
    adminReleasesRoute({
      adminToken: config.adminToken,
      pool,
      storage,
      enqueue: put,
    }),
  );
  router.add('GET', '/api/admin/releases', releasesListRoute({ adminToken: config.adminToken, pool }));

  const server = createServer((req, res) => {
    router.handle(req, res).catch((err: unknown) => {
      // 处理器里漏出来的异常。只打类型与消息，不打堆栈里的请求内容——
      // 那里面可能有 token。客户端拿到的永远是同一句话。
      console.error('[api]', req.method, new URL(req.url ?? '/', config.publicBaseUrl).pathname,
        err instanceof Error ? err.message : err);
      if (!res.headersSent) sendError(res, 500, 'internal_error', '服务器内部错误。');
      else res.end();
    });
  });

  // 买家的浏览器在下载大 zip 时可能慢，但请求头本身没有理由慢。
  server.headersTimeout = 20_000;
  server.requestTimeout = 300_000;

  await new Promise<void>((resolve) => server.listen(config.port, BIND, resolve));
  console.log(`[api] 监听 ${BIND}:${config.port}，站点根 ${config.publicBaseUrl}`);

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log(`[api] 收到 ${signal}，停止接受新连接`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await boss.stop({ wait: false });
    await closePool();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('[api] 启动失败：', err instanceof Error ? err.message : err);
  process.exit(1);
});
