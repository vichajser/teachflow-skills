import { describe, it, expect } from 'vitest';
import { buildZip } from '../src/lib/zip.ts';
import { validateSkillZip } from '../src/lib/zip-validate.ts';

const SKILL = 'lesson-workflow';

function skillMd(fields: Record<string, string> = {}): string {
  const fm = { name: SKILL, version: '1.0.0', license: 'LicenseRef-TeachFlow-Proprietary', ...fields };
  const lines = Object.entries(fm)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n\n## 보안 및 접근 범위 고지\n`;
}

function good(extra: { name: string; content: string }[] = []) {
  return buildZip([
    { name: `${SKILL}/SKILL.md`, content: skillMd() },
    { name: `${SKILL}/README.md`, content: '# README\n' },
    { name: `${SKILL}/references/planning.md`, content: 'x'.repeat(2000) },
    ...extra,
  ]);
}

function reasonOf(buf: Buffer, skill = SKILL): string {
  const result = validateSkillZip(buf, skill);
  expect(result.ok).toBe(false);
  return (result as { reason: string }).reason;
}

describe('validateSkillZip', () => {
  it('合格包通过，并带回 frontmatter 里的版本号', () => {
    const result = validateSkillZip(good(), SKILL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.version).toBe('1.0.0');
      expect(result.entries).toHaveLength(3);
    }
  });

  it('拒绝非 zip 字节', () => {
    expect(reasonOf(Buffer.from('PK 骗你的'))).toMatch(/zip/);
  });

  it('拒绝嵌套压缩包', () => {
    expect(reasonOf(good([{ name: `${SKILL}/bundle.zip`, content: 'PK' }]))).toMatch(/嵌套压缩包/);
  });

  it('拒绝相对跳转路径', () => {
    expect(reasonOf(good([{ name: `${SKILL}/../evil.md`, content: 'x' }]))).toMatch(/相对跳转/);
  });

  it('拒绝绝对路径', () => {
    expect(reasonOf(buildZip([{ name: `/${SKILL}/SKILL.md`, content: skillMd() }]))).toMatch(
      /绝对路径/,
    );
  });

  it('拒绝反斜杠路径', () => {
    expect(reasonOf(good([{ name: `${SKILL}\\win.md`, content: 'x' }]))).toMatch(/反斜杠/);
  });

  it('拒绝 __MACOSX 残留', () => {
    expect(reasonOf(good([{ name: '__MACOSX/._SKILL.md', content: 'x' }]))).toMatch(/顶层目录|打包残留/);
  });

  it('拒绝隐藏文件', () => {
    expect(reasonOf(good([{ name: `${SKILL}/.DS_Store`, content: 'x' }]))).toMatch(/隐藏文件/);
    expect(reasonOf(good([{ name: `${SKILL}/.claude/x.md`, content: 'x' }]))).toMatch(/隐藏文件/);
  });

  it('拒绝顶层目录名与 skill id 不符', () => {
    expect(reasonOf(good(), 'ppt-workflow')).toMatch(/顶层目录必须是 ppt-workflow/);
  });

  it('拒绝双层嵌套目录', () => {
    const buf = buildZip([{ name: `${SKILL}/${SKILL}/SKILL.md`, content: skillMd() }]);
    expect(reasonOf(buf)).toMatch(/缺少 lesson-workflow\/SKILL\.md/);
  });

  it('拒绝缺少 SKILL.md', () => {
    const buf = buildZip([{ name: `${SKILL}/README.md`, content: '# x\n' }]);
    expect(reasonOf(buf)).toMatch(/缺少 lesson-workflow\/SKILL\.md/);
  });

  it('拒绝单文件超过 1 MB', () => {
    expect(reasonOf(good([{ name: `${SKILL}/huge.md`, content: 'x'.repeat(1_048_577) }]))).toMatch(
      /超过单文件上限/,
    );
  });

  it('拒绝解压总量超过 5 MB', () => {
    const big = Array.from({ length: 6 }, (_, i) => ({
      name: `${SKILL}/refs/${i}.md`,
      content: 'x'.repeat(1_000_000),
    }));
    expect(reasonOf(good(big))).toMatch(/解压总量/);
  });

  it('拒绝空包', () => {
    expect(reasonOf(buildZip([]))).toMatch(/空压缩包/);
  });

  it('拒绝 SKILL.md 没有 frontmatter', () => {
    const buf = buildZip([{ name: `${SKILL}/SKILL.md`, content: '# 没有 frontmatter\n' }]);
    expect(reasonOf(buf)).toMatch(/没有 frontmatter/);
  });

  it('拒绝 frontmatter 的 name 与目录名不一致', () => {
    const buf = buildZip([{ name: `${SKILL}/SKILL.md`, content: skillMd({ name: 'ppt-workflow' }) }]);
    expect(reasonOf(buf)).toMatch(/name 是 ppt-workflow/);
  });

  it('拒绝缺少 version 字段', () => {
    const buf = buildZip([{ name: `${SKILL}/SKILL.md`, content: skillMd({ version: '' }) }]);
    expect(reasonOf(buf)).toMatch(/缺少 version/);
  });

  it('拒绝非 X.Y.Z 的版本号', () => {
    const buf = buildZip([{ name: `${SKILL}/SKILL.md`, content: skillMd({ version: 'v1.2' }) }]);
    expect(reasonOf(buf)).toMatch(/不是 X\.Y\.Z/);
  });

  it('拒绝非法 skill id 参数', () => {
    expect(reasonOf(good(), 'Lesson_Workflow')).toMatch(/skill id 不合法/);
  });
});
