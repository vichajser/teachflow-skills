import type { IncomingMessage, ServerResponse } from 'node:http';

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

/**
 * 统一的错误信封：`{ error: { code, message } }`。
 *
 * code 供程序判断，message 供人阅读——所以 message 永远是我们自己写死的句子，
 * 绝不回显内部路径、SQL 或上游响应体。额外字段（哪些字段缺了、当前最高版本）
 * 放在 error 对象里，调用方用得上，也不必再解析 message。
 */
export function sendError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): void {
  sendJson(res, status, { error: { code, message, ...extra } });
}

export function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    // 下载页不需要任何脚本、样式表或外部资源，策略写死到最紧。
    'content-security-policy':
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'",
  });
  res.end(html);
}

export class BodyTooLarge extends Error {
  constructor(limit: number) {
    super(`请求体超过 ${limit} 字节`);
    this.name = 'BodyTooLarge';
  }
}

/** 读原始请求体。webhook 验签要的是字节，不是解析结果，所以不走任何 parser。 */
export function readRawBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new BodyTooLarge(limit));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
