/**
 * PostHog 镜像（可选，POSTHOG_API_KEY 未设则完全不启用）。
 *
 * 设计边界：这是**服务端到服务端**的传输——站点页面仍然零第三方请求、零脚本、
 * 零 cookie（privacy.md 只披露「匿名的聚合漏斗事件可能经第三方处理器处理」）。
 *
 * 只做尽力而为：内存缓冲、定时批量发、失败丢弃并记一条日志，绝不重试风暴，
 * 也绝不让调用方等待网络——统计镜像慢了、挂了，都不许碰购买主链路。
 *
 * 端点用 v1 /batch/（api_key 放请求体）。若将来 PostHog 下线该端点，改用
 * `/i/v0/e/`（Bearer 头）即可，载荷结构不变——这是一次本地改动，不是事故。
 */

export interface PosthogConfig {
  apiKey: string;
  host: string;
}

export interface PosthogCapture {
  event: string;
  distinctId: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_THRESHOLD = 25;
const MAX_BUFFER = 1_000;

export interface PosthogMirror {
  capture(event: string, cap: Omit<PosthogCapture, 'event'>): void;
  /** 摄取脚本退出前调用：把缓冲里的事件发完再退。 */
  flushNow(): Promise<void>;
}

export function createPosthogMirror(config: PosthogConfig): PosthogMirror {
  const buffer: PosthogCapture[] = [];
  let warned = false;
  const timer: NodeJS.Timeout = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);
  timer.unref();

  async function flush(): Promise<void> {
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, FLUSH_THRESHOLD);
    try {
      const res = await fetch(`${config.host}/batch/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // 线上格式是 snake_case：PostHog 只认 distinct_id（2026-09-29 线上实测
        // 用 distinctId 会 400 整批拒收）。内部类型保持 camelCase，仅在此处转换。
        body: JSON.stringify({
          api_key: config.apiKey,
          batch: batch.map(({ event, distinctId, properties, timestamp }) => ({
            event,
            distinct_id: distinctId,
            properties,
            timestamp,
          })),
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok && !warned) {
        warned = true;
        console.error(`[funnel] PostHog 镜像响应 ${res.status}，本批已丢弃（后续不再重复报错）`);
      }
    } catch (err) {
      if (!warned) {
        warned = true;
        console.error(
          '[funnel] PostHog 镜像发送失败：',
          err instanceof Error ? err.message : err,
          '（本批已丢弃，后续不再重复报错）',
        );
      }
    }
  }

  return {
    capture(event, cap) {
      buffer.push({ event, ...cap });
      if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
      if (buffer.length >= FLUSH_THRESHOLD) void flush();
    },
    async flushNow() {
      while (buffer.length > 0) await flush();
    },
  };
}
