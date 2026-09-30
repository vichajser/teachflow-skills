import { timingSafeEqual } from 'node:crypto';

/**
 * Bearer token 比较（admin 接口共用）。先比长度再定长比较：timingSafeEqual
 * 长度不等会抛错。
 */
export function bearerAuthorized(
  header: string | string[] | undefined,
  expected: string,
): boolean {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || !raw.startsWith('Bearer ')) return false;
  const provided = Buffer.from(raw.slice(7), 'utf8');
  const want = Buffer.from(expected, 'utf8');
  return provided.length === want.length && timingSafeEqual(provided, want);
}

/** 报表 HTML 里的动态值一律过这里——哪怕现在只有我们自己的数字与枚举。 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
