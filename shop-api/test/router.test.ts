import { describe, it, expect, vi } from 'vitest';
import { createRouter, clientIpOf } from '../src/http/router.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';

const BASE = 'https://tryteachflow.com';

function fakeReq(method: string, url: string, headers: Record<string, string> = {}) {
  return { method, url, headers, socket: { remoteAddress: '127.0.0.1' } } as unknown as IncomingMessage;
}

function fakeRes() {
  const state = { status: 0, headers: {} as Record<string, string>, body: '' };
  const res = {
    writeHead(status: number, headers: Record<string, string>) {
      state.status = status;
      state.headers = headers;
    },
    end(chunk?: string) {
      state.body = chunk ?? '';
    },
  } as unknown as ServerResponse;
  return { res, state };
}

describe('createRouter', () => {
  it('解析单段参数', async () => {
    const router = createRouter(BASE);
    const seen: string[] = [];
    router.add('GET', '/api/download/:skillId', ({ params }) => {
      seen.push(params.skillId!);
    });

    const { res } = fakeRes();
    await router.handle(fakeReq('GET', '/api/download/lesson-workflow?token=abc'), res);
    expect(seen).toEqual(['lesson-workflow']);
  });

  it('参数做百分号解码', async () => {
    const router = createRouter(BASE);
    let got = '';
    router.add('GET', '/x/:v', ({ params }) => {
      got = params.v!;
    });
    const { res } = fakeRes();
    await router.handle(fakeReq('GET', '/x/1.0%2B1'), res);
    expect(got).toBe('1.0+1');
  });

  it('方法不匹配不会落到同路径的处理器上', async () => {
    const router = createRouter(BASE);
    const handler = vi.fn();
    router.add('POST', '/api/webhooks/polar', handler);

    const { res, state } = fakeRes();
    await router.handle(fakeReq('GET', '/api/webhooks/polar'), res);
    expect(handler).not.toHaveBeenCalled();
    expect(state.status).toBe(404);
  });

  it('段数不同不匹配', () => {
    const router = createRouter(BASE);
    router.add('GET', '/api/download/:skillId', () => {});
    expect(router.match('GET', '/api/download')).toBeNull();
    expect(router.match('GET', '/api/download/a/b')).toBeNull();
    expect(router.match('GET', '/api/download/a')).not.toBeNull();
  });

  it('尾斜杠与不带尾斜杠等价', () => {
    const router = createRouter(BASE);
    router.add('GET', '/api/health', () => {});
    expect(router.match('GET', '/api/health/')).not.toBeNull();
  });

  it('未匹配返回 404 JSON', async () => {
    const router = createRouter(BASE);
    const { res, state } = fakeRes();
    await router.handle(fakeReq('GET', '/nope'), res);
    expect(state.status).toBe(404);
    expect(state.headers['content-type']).toContain('application/json');
    // 与其余接口同一个错误信封：{ error: { code, message } }。
    expect(JSON.parse(state.body)).toEqual({
      error: { code: 'not_found', message: '没有这个接口。' },
    });
  });

  it('查询串不参与路径匹配', () => {
    const router = createRouter(BASE);
    router.add('GET', '/download', () => {});
    expect(router.match('GET', new URL('/download?token=x', BASE).pathname)).not.toBeNull();
  });
});

describe('clientIpOf', () => {
  it('取 X-Forwarded-For 最左一跳', () => {
    expect(clientIpOf(fakeReq('GET', '/', { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe(
      '203.0.113.7',
    );
  });

  it('无代理头时退回 socket 地址', () => {
    expect(clientIpOf(fakeReq('GET', '/'))).toBe('127.0.0.1');
  });

  it('代理头为空串时退回 socket 地址', () => {
    expect(clientIpOf(fakeReq('GET', '/', { 'x-forwarded-for': '' }))).toBe('127.0.0.1');
  });
});
