import { open, stat } from 'node:fs/promises';
import type { Pool } from 'pg';
import { loadConfig } from '../config.ts';
import { getPool, closePool } from '../db/pool.ts';
import { insertFunnelEvents, type FunnelEventInput } from '../funnel/events.ts';
import { pageViewOf, type CaddyLogEntry } from '../funnel/caddy-log.ts';
import { createPosthogMirror, type PosthogMirror } from '../funnel/posthog.ts';

/**
 * Caddy 访问日志 → funnel_events(page_view)。由 deploy/funnel-log-ingest.timer
 * 每 5 分钟跑一次（systemd oneshot）。
 *
 * 断点续读：offset 记在 funnel_log_state（字节偏移，只推进到最后一条完整行）。
 * 轮转（roll）后文件比 offset 小 → 从头读。单轮最多处理 64 MB，剩下留给
 * 下一轮——长期停摆后也不会一口气读爆内存。
 *
 * 失败语义：析构、落库、状态更新任何一步抛错都以非零退出，让 systemd 标红；
 * 下一次运行从上次的 offset 继续，已写入的行不会重复计数。
 */

const STATE_KEY = 'caddy-access';
const MAX_READ_BYTES = 64 * 1024 * 1024;

async function readOffset(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ value?: { offset?: unknown } }>(
    'SELECT value FROM funnel_log_state WHERE key = $1',
    [STATE_KEY],
  );
  const offset = rows[0]?.value?.offset;
  return typeof offset === 'number' && Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;
}

async function writeOffset(pool: Pool, offset: number): Promise<void> {
  await pool.query(
    `INSERT INTO funnel_log_state (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = now()`,
    [STATE_KEY, JSON.stringify({ offset })],
  );
}

function mirrorEvents(mirror: PosthogMirror | null, events: FunnelEventInput[]): void {
  if (!mirror) return;
  // bot 事件不进镜像（events.mirrorEvent 的口径一致：报表排除爬虫）。
  for (const evt of events) {
    if (evt.bot) continue;
    mirror.capture(evt.step, {
      distinctId: `anon-${evt.step}-${crypto.randomUUID()}`,
      properties: {
        step: evt.step,
        src: evt.src ?? null,
        lang: evt.lang ?? null,
        path: (evt.meta?.path as string | undefined) ?? null,
        $lib: 'teachflow-shop-api',
      },
      timestamp: (evt.occurredAt ?? new Date()).toISOString(),
    });
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = getPool(config.databaseUrl);
  const mirror = config.posthog ? createPosthogMirror(config.posthog) : null;

  let offset = await readOffset(pool);
  const info = await stat(config.caddyAccessLog);
  if (!info.isFile()) throw new Error(`${config.caddyAccessLog} 不是常规文件`);

  if (info.size < offset) {
    console.log(`[ingest] 检测到日志轮转（size ${info.size} < offset ${offset}），从头读`);
    offset = 0;
  }
  if (info.size === offset) {
    console.log('[ingest] 无新日志');
    await closePool();
    return;
  }

  const readLen = Math.min(info.size - offset, MAX_READ_BYTES);
  const handle = await open(config.caddyAccessLog, 'r');
  const buffer = Buffer.alloc(readLen);
  let raw: string;
  try {
    const { bytesRead } = await handle.read(buffer, 0, readLen, offset);
    raw = buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }

  // 只处理完整行：最后一行若没有换行符结尾，说明写了一半，留给下一轮。
  const lastNewline = raw.lastIndexOf('\n');
  if (lastNewline === -1) {
    console.log('[ingest] 本轮没有完整行（写入进行中）');
    await closePool();
    return;
  }
  const lines = raw.slice(0, lastNewline).split('\n');

  const events: FunnelEventInput[] = [];
  let bots = 0;
  let badLines = 0;
  for (const line of lines) {
    if (line.trim() === '') continue;
    let entry: CaddyLogEntry;
    try {
      entry = JSON.parse(line) as CaddyLogEntry;
    } catch {
      badLines += 1;
      continue;
    }
    const evt = pageViewOf(entry);
    if (!evt) continue;
    if (evt.bot) bots += 1;
    events.push(evt);
  }

  const written = await insertFunnelEvents(pool, events);
  mirrorEvents(mirror, events);

  const consumed = offset + Buffer.byteLength(raw.slice(0, lastNewline + 1), 'utf8');
  await writeOffset(pool, consumed);

  console.log(
    `[ingest] 行 ${lines.length}，页面访问 ${events.length}（其中爬虫 ${bots}），` +
      `落库 ${written}，坏行 ${badLines}，offset ${offset} → ${consumed}` +
      (readLen === MAX_READ_BYTES && offset + readLen < info.size ? '（本轮封顶，剩余下轮继续）' : ''),
  );

  if (mirror) await mirror.flushNow();
  await closePool();
}

main().catch((err: unknown) => {
  console.error('[ingest] 失败：', err instanceof Error ? err.message : err);
  process.exit(1);
});
