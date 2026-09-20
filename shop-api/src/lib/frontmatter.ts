// SKILL.md 的 frontmatter 是扁平的 key: value，没有嵌套、没有列表语法以外的结构。
// 这里只取我们要的几个标量键，不做通用 YAML 解析。

export function parseFrontmatter(text: string): Record<string, string> | null {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  const end = normalized.indexOf('\n---', 3);
  if (end === -1) return null;

  const out: Record<string, string> = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    if (key === '' || /\s/.test(key)) continue;
    let value = line.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function isSemver(v: string): boolean {
  return SEMVER.test(v);
}

/** 返回正数表示 a 比 b 新。仅支持 X.Y.Z，不接受预发布后缀。 */
export function compareSemver(a: string, b: string): number {
  const ma = SEMVER.exec(a);
  const mb = SEMVER.exec(b);
  if (!ma || !mb) throw new Error(`不是合法版本号：${!ma ? a : b}`);
  for (let i = 1; i <= 3; i += 1) {
    const diff = Number(ma[i]) - Number(mb[i]);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}
