import { readCentralDirectory, readEntry, ZipError, type ZipEntry } from './zip.ts';
import { parseFrontmatter, isSemver } from './frontmatter.ts';

// 上传接口不重新打包内容，所以这层校验是唯一的把关点：
// 进来什么就发给买家什么，畸形结构在这里拦不住就永远拦不住了。

export const MAX_FILE_BYTES = 1_048_576; // 单文件 1 MB
export const MAX_TOTAL_BYTES = 5_242_880; // 解压总量 5 MB
export const MAX_ENTRIES = 500;

export type ValidationResult =
  | { ok: true; entries: ZipEntry[]; version: string }
  | { ok: false; reason: string };

function fail(reason: string): ValidationResult {
  return { ok: false, reason };
}

function checkName(name: string, skillId: string): string | null {
  if (name === '') return '存在空文件名条目';
  if (name.includes('\\')) return `路径含反斜杠：${name}`;
  if (name.startsWith('/')) return `绝对路径：${name}`;
  if (/^[a-zA-Z]:/.test(name)) return `盘符路径：${name}`;
  if (name.includes('\0')) return `路径含空字节：${name}`;
  if (name.toLowerCase().endsWith('.zip')) return `嵌套压缩包：${name}`;

  const segments = name.split('/').filter((s) => s !== '');
  if (segments.length === 0) return `无效路径：${name}`;
  for (const seg of segments) {
    if (seg === '..' || seg === '.') return `路径含相对跳转：${name}`;
    if (seg.startsWith('.')) return `隐藏文件或目录：${name}`;
    if (seg === '__MACOSX') return `打包残留：${name}`;
  }
  if (segments[0] !== skillId) return `顶层目录必须是 ${skillId}，实际是 ${segments[0]}`;
  return null;
}

/**
 * 校验一个待发布的 skill zip。全有或全无：任何一条不合格都整包拒绝，
 * 不做"修掉再收"——自动修包意味着发给买家的字节不是操作者看过的字节。
 */
export function validateSkillZip(buf: Buffer, expectedSkillId: string): ValidationResult {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(expectedSkillId)) {
    return fail(`skill id 不合法：${expectedSkillId}`);
  }

  let entries: ZipEntry[];
  try {
    entries = readCentralDirectory(buf);
  } catch (err) {
    return fail(err instanceof ZipError ? err.message : `无法解析 zip：${(err as Error).message}`);
  }

  if (entries.length === 0) return fail('空压缩包');
  if (entries.length > MAX_ENTRIES) return fail(`条目数超过 ${MAX_ENTRIES}`);

  let total = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    const problem = checkName(entry.name, expectedSkillId);
    if (problem) return fail(problem);
    if (seen.has(entry.name)) return fail(`重复条目：${entry.name}`);
    seen.add(entry.name);

    if (entry.isDirectory) continue;
    if (entry.uncompressedSize > MAX_FILE_BYTES) {
      return fail(`${entry.name} 解压后 ${entry.uncompressedSize} 字节，超过单文件上限`);
    }
    total += entry.uncompressedSize;
    if (total > MAX_TOTAL_BYTES) return fail(`解压总量超过 ${MAX_TOTAL_BYTES} 字节`);
  }

  const skillMd = entries.find((e) => e.name === `${expectedSkillId}/SKILL.md`);
  if (!skillMd) return fail(`缺少 ${expectedSkillId}/SKILL.md`);

  let text: string;
  try {
    text = readEntry(buf, skillMd).toString('utf8');
  } catch (err) {
    return fail(`无法读取 SKILL.md：${(err as Error).message}`);
  }

  const fm = parseFrontmatter(text);
  if (!fm) return fail('SKILL.md 没有 frontmatter');
  if (fm.name !== expectedSkillId) {
    return fail(`SKILL.md 的 name 是 ${fm.name ?? '(缺失)'}，与目录名 ${expectedSkillId} 不一致`);
  }
  if (!fm.version) return fail('SKILL.md 缺少 version 字段');
  if (!isSemver(fm.version)) return fail(`SKILL.md 的 version 不是 X.Y.Z：${fm.version}`);

  return { ok: true, entries, version: fm.version };
}
