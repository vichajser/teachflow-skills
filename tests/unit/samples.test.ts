import { describe, it, expect } from 'vitest';
import { SAMPLES, isReady } from '@/data/samples';
import { SKILLS } from '@/data/skills';

describe('SAMPLES', () => {
  it('covers every skill that produces a downloadable file', () => {
    const producing = SKILLS.filter((s) => s.outputs.length > 0).map((s) => s.id);
    const covered = new Set(SAMPLES.map((s) => s.skillId));
    for (const id of producing) {
      expect(covered.has(id), `no sample entry for ${id}`).toBe(true);
    }
  });

  it('has a unique id per sample', () => {
    const ids = SAMPLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('titles every sample in both locales', () => {
    for (const sample of SAMPLES) {
      expect(sample.title.en.length, `${sample.id}.en`).toBeGreaterThan(0);
      expect(sample.title.ko.length, `${sample.id}.ko`).toBeGreaterThan(0);
    }
  });

  // 断言全部条目，不是 `filter(isReady)`：五个 file 全是 null 时那个子集为空，
  // 循环体一次都不执行——把正则改成 /^https?:\/\// 都能活（旧版本实测如此）。
  // 今天的形态是"null 或本站路径"，两种可接受值显式写出来。
  it('points every sample at null or a path under /samples/', () => {
    for (const sample of SAMPLES) {
      const ok = sample.file === null || /^\/samples\//.test(sample.file);
      expect(ok, `${sample.id}.file is ${JSON.stringify(sample.file)}`).toBe(true);
    }
  });

  // `/legal/privacy` 的 "no third-party requests" 在源码侧的守卫：previewImage
  // 是 Sample 里唯一能打到站外的字段，设成远程 URL 会让 `/samples` 渲染跨源
  // <img>，而 legal.test.mjs:215-220 正断言那句话在页面上。
  it('never points a preview image off-site', () => {
    for (const sample of SAMPLES) {
      const ok =
        sample.previewImage === null || /^\/samples\//.test(sample.previewImage);
      expect(
        ok,
        `${sample.id}.previewImage is ${JSON.stringify(sample.previewImage)}`,
      ).toBe(true);
    }
  });

  it('carries no timing figure for a sample that has not been generated', () => {
    // spec §4.5：数字必须有依据，取自实际运行耗时。未生成 = 无依据。
    for (const sample of SAMPLES.filter((s) => !isReady(s))) {
      expect(sample.durationSeconds, `${sample.id}`).toBeNull();
    }
  });
});
