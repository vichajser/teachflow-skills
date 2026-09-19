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

  it('points ready samples at a path under /samples/', () => {
    for (const sample of SAMPLES.filter(isReady)) {
      expect(sample.file, `${sample.id}`).toMatch(/^\/samples\//);
    }
  });

  it('carries no timing figure for a sample that has not been generated', () => {
    // spec §4.5：数字必须有依据，取自实际运行耗时。未生成 = 无依据。
    for (const sample of SAMPLES.filter((s) => !isReady(s))) {
      expect(sample.durationSeconds, `${sample.id}`).toBeNull();
    }
  });
});
