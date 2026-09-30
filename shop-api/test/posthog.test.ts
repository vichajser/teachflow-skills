import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPosthogMirror } from '../src/funnel/posthog.ts';

describe('createPosthogMirror', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('线上载荷用 distinct_id（snake_case）——distinctId 会被 PostHog 整批 400 拒收', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: { body?: string }) => {
        bodies.push(JSON.parse(init?.body ?? '{}'));
        return { ok: true } as Response;
      }),
    );

    const mirror = createPosthogMirror({ apiKey: 'phc_x', host: 'https://us.i.posthog.com' });
    mirror.capture('checkout_click', {
      distinctId: 'v-1',
      properties: { src: 'hero' },
      timestamp: '2026-09-29T00:00:00Z',
    });
    await mirror.flushNow();

    expect(bodies).toHaveLength(1);
    const body = bodies[0] as { api_key: string; batch: Record<string, unknown>[] };
    expect(body.api_key).toBe('phc_x');
    expect(body.batch[0]).toEqual({
      event: 'checkout_click',
      distinct_id: 'v-1',
      properties: { src: 'hero' },
      timestamp: '2026-09-29T00:00:00Z',
    });
  });

  it('失败只记一次日志、丢批不重试——镜像永远不碰主链路', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: { body?: string }) => {
        bodies.push(JSON.parse(init?.body ?? '{}'));
        return { ok: false, status: 500 } as Response;
      }),
    );

    const mirror = createPosthogMirror({ apiKey: 'phc_x', host: 'https://eu.i.posthog.com' });
    mirror.capture('page_view', { distinctId: 'a', properties: {}, timestamp: '2026-09-29T00:00:00Z' });
    mirror.capture('page_view', { distinctId: 'b', properties: {}, timestamp: '2026-09-29T00:00:01Z' });
    await mirror.flushNow();
    await mirror.flushNow(); // 缓冲已清空：不应再发

    expect(bodies).toHaveLength(1);
    expect((bodies[0] as { batch: unknown[] }).batch).toHaveLength(2);
    expect(errSpy).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});
