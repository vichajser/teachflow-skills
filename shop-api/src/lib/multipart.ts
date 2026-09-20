// 只解析 multipart/form-data 里我们真正用到的那一小块：若干文本字段 + 一个文件。
// 不支持嵌套 multipart、不支持 quoted-printable、不支持 content-transfer-encoding。
// 唯一的调用方是操作者自己的 CLI，输入形状是已知的。

export class MultipartError extends Error {}

export interface MultipartPart {
  name: string;
  filename?: string;
  contentType?: string;
  data: Buffer;
}

export function boundaryOf(contentType: string | undefined): string {
  if (!contentType) throw new MultipartError('缺少 content-type');
  const [type, ...params] = contentType.split(';');
  if (type!.trim().toLowerCase() !== 'multipart/form-data') {
    throw new MultipartError('content-type 不是 multipart/form-data');
  }
  for (const param of params) {
    const eq = param.indexOf('=');
    if (eq === -1) continue;
    if (param.slice(0, eq).trim().toLowerCase() !== 'boundary') continue;
    const raw = param.slice(eq + 1).trim();
    const value = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    if (value === '') break;
    return value;
  }
  throw new MultipartError('content-type 缺少 boundary');
}

function headerValue(headerBlock: string, name: string): string | undefined {
  for (const line of headerBlock.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    if (line.slice(0, colon).trim().toLowerCase() === name) return line.slice(colon + 1).trim();
  }
  return undefined;
}

function dispositionParam(disposition: string, key: string): string | undefined {
  // filename 里可能有分号，所以按 key=" 定位再找配对的引号，不能直接 split(';')。
  const marker = `${key}="`;
  const start = disposition.toLowerCase().indexOf(marker);
  if (start === -1) return undefined;
  const from = start + marker.length;
  const end = disposition.indexOf('"', from);
  if (end === -1) return undefined;
  return disposition.slice(from, end);
}

export function parseMultipart(body: Buffer, contentType: string | undefined): MultipartPart[] {
  const boundary = boundaryOf(contentType);
  const dash = Buffer.from(`--${boundary}`, 'utf8');
  // 分隔符必须带前导 CRLF，只有正文第一个除外。上传的是 zip，二进制里
  // 恰好出现 boundary 字节并非不可能；只认裸的 `--boundary` 会把文件拦腰截断。
  const crlfDash = Buffer.from(`\r\n--${boundary}`, 'utf8');
  const parts: MultipartPart[] = [];

  let cursor: number;
  if (body.subarray(0, dash.length).equals(dash)) {
    cursor = 0;
  } else {
    const first = body.indexOf(crlfDash);
    if (first === -1) throw new MultipartError('正文里找不到 boundary');
    cursor = first + 2;
  }

  while (true) {
    const afterDelimiter = cursor + dash.length;
    if (body.subarray(afterDelimiter, afterDelimiter + 2).toString() === '--') break; // 结束标记

    const bodyStart = body.indexOf('\r\n\r\n', afterDelimiter);
    if (bodyStart === -1) throw new MultipartError('分段缺少头部终止符');

    const next = body.indexOf(crlfDash, bodyStart);
    if (next === -1) throw new MultipartError('分段没有收尾 boundary');

    const headerBlock = body.subarray(afterDelimiter, bodyStart).toString('utf8');
    // next 指向数据后面那个 CRLF，它属于分隔符而不属于数据。
    const data = body.subarray(bodyStart + 4, next);

    const disposition = headerValue(headerBlock, 'content-disposition');
    if (!disposition) throw new MultipartError('分段缺少 content-disposition');
    const name = dispositionParam(disposition, 'name');
    if (!name) throw new MultipartError('分段缺少字段名');

    parts.push({
      name,
      filename: dispositionParam(disposition, 'filename'),
      contentType: headerValue(headerBlock, 'content-type'),
      data,
    });

    cursor = next + 2;
  }

  if (parts.length === 0) throw new MultipartError('没有解析出任何分段');
  return parts;
}

/** 文本字段：同名重复取第一个，缺失返回 undefined。 */
export function fieldOf(parts: MultipartPart[], name: string): string | undefined {
  const hit = parts.find((p) => p.name === name && p.filename === undefined);
  return hit ? hit.data.toString('utf8') : undefined;
}

export function fileOf(parts: MultipartPart[], name: string): MultipartPart | undefined {
  return parts.find((p) => p.name === name && p.filename !== undefined);
}
