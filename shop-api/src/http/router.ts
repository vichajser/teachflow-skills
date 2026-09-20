import type { IncomingMessage, ServerResponse } from 'node:http';

// 七条路由不值得一个框架。这里只支持精确段与 :name 单段参数，
// 没有通配、没有正则、没有中间件栈——面越小越不会出意外。

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  /** 已解析的 URL；路径来自 req.url，host 来自配置，不信任 Host 头。 */
  url: URL;
  params: Record<string, string>;
  /** 取客户端 IP：优先取 Caddy 写入的 X-Forwarded-For 最左一跳。 */
  clientIp: string;
}

export type Handler = (ctx: RequestContext) => Promise<void> | void;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s !== '');
}

export function clientIpOf(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (first) {
    const hop = first.split(',')[0]!.trim();
    if (hop !== '') return hop;
  }
  return req.socket.remoteAddress ?? '0.0.0.0';
}

export function createRouter(baseUrl: string) {
  const routes: Route[] = [];

  function add(method: string, pattern: string, handler: Handler): void {
    routes.push({ method: method.toUpperCase(), segments: splitPath(pattern), handler });
  }

  function match(method: string, path: string): { handler: Handler; params: Record<string, string> } | null {
    const parts = splitPath(path);
    for (const route of routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i += 1) {
        const seg = route.segments[i]!;
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = decodeURIComponent(parts[i]!);
        } else if (seg !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', baseUrl);
    const found = match(req.method ?? 'GET', url.pathname);
    if (!found) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    await found.handler({ req, res, url, params: found.params, clientIp: clientIpOf(req) });
  }

  return { add, match, handle };
}

export type Router = ReturnType<typeof createRouter>;
