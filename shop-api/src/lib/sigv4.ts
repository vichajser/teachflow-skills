import { createHash, createHmac } from 'node:crypto';

// AWS Signature Version 4。R2 走 S3 兼容接口，所以签名算法完全一样。
// 这里只实现单次签名的 header 方式（不做 chunked、不做 presign）——
// 上传母版和取回母版都是一次性整包请求，够用。

export interface SignInput {
  method: string;
  /** 完整 URL，含 query。 */
  url: string;
  /** 调用方给的头。host 会被强制覆盖为 URL 的 host。 */
  headers: Record<string, string>;
  body: Buffer;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  /** 便于测试注入时间。 */
  now?: Date;
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** AWS 的 URI 转义：只有 A-Z a-z 0-9 - _ . ~ 不转义，路径里的 / 保留。 */
function uriEscape(str: string, keepSlash: boolean): string {
  let out = '';
  for (const ch of Buffer.from(str, 'utf8')) {
    const c = String.fromCharCode(ch);
    if (/[A-Za-z0-9\-_.~]/.test(c) || (keepSlash && c === '/')) {
      out += c;
    } else {
      out += `%${ch.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return out;
}

function canonicalUri(pathname: string): string {
  // URL 已经把路径百分号编码过一轮，先解回来再按 AWS 规则编码，
  // 否则含空格或中文的 key 会被编码两次。
  return uriEscape(decodeURIComponent(pathname), true) || '/';
}

function canonicalQuery(search: URLSearchParams): string {
  const pairs: Array<[string, string]> = [];
  search.forEach((value, key) => pairs.push([uriEscape(key, false), uriEscape(value, false)]));
  pairs.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

export interface CanonicalParts {
  canonicalRequest: string;
  signedHeaders: string;
  amzDate: string;
  scope: string;
  stringToSign: string;
  signature: string;
  /** 实际参与签名的全部头。signRequest 直接用它，避免两处各自拼头而漏签。 */
  headers: Record<string, string>;
}

/** 拆出来单独导出，是为了能用 AWS 官方测试向量逐段比对。 */
export function buildCanonical(input: SignInput): CanonicalParts {
  const url = new URL(input.url);
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256Hex(input.body);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers)) {
    headers[k.toLowerCase().trim()] = v.replace(/\s+/g, ' ').trim();
  }
  headers.host = url.host;
  headers['x-amz-date'] = amzDate;
  // x-amz-content-sha256 是 S3 系列的强制头，其它服务不带——带了会让
  // signedHeaders 与官方测试向量对不上。
  if (input.service === 's3') headers['x-amz-content-sha256'] = payloadHash;

  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join('');

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri(url.pathname),
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return { canonicalRequest, signedHeaders, amzDate, scope, stringToSign, signature, headers };
}

/** 返回可直接交给 fetch 的完整头集合（签名覆盖的头 + authorization）。 */
export function signRequest(input: SignInput): Record<string, string> {
  const parts = buildCanonical(input);
  return {
    ...parts.headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${parts.scope}, ` +
      `SignedHeaders=${parts.signedHeaders}, Signature=${parts.signature}`,
  };
}
