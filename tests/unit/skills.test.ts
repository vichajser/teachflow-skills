import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SKILLS, STAGE_COLOR, stageClass } from '@/data/skills';
import { LOCALES } from '@/i18n/config';

describe('SKILLS', () => {
  it('describes exactly the six shipped skills, in pipeline order', () => {
    expect(SKILLS.map((s) => s.id)).toEqual([
      'lesson-workflow',
      'ppt-workflow',
      'audio-workflow',
      'word-workflow',
      'worksheet-workflow',
      'report-workflow',
    ]);
  });

  it('puts lesson-workflow alone in stage 1 and report-workflow alone in stage 3', () => {
    expect(SKILLS.filter((s) => s.stage === 1).map((s) => s.id)).toEqual([
      'lesson-workflow',
    ]);
    expect(SKILLS.filter((s) => s.stage === 3).map((s) => s.id)).toEqual([
      'report-workflow',
    ]);
    expect(SKILLS.filter((s) => s.stage === 2)).toHaveLength(4);
  });

  it('lists the real file extensions each skill produces', () => {
    const byId = Object.fromEntries(SKILLS.map((s) => [s.id, s.outputs]));
    expect(byId['ppt-workflow']).toEqual(['.pptx']);
    expect(byId['audio-workflow']).toEqual(['.mp3']);
    expect(byId['word-workflow']).toEqual(['.xlsx', '.csv']);
    expect(byId['worksheet-workflow']).toEqual(['.docx', '.docx', '.docx']);
    expect(byId['report-workflow']).toEqual(['.png']);
  });

  it('is sorted by order and gives every skill a distinct order', () => {
    const orders = SKILLS.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(SKILLS.length);
  });

  it('covers every stage', () => {
    expect(new Set(SKILLS.map((s) => s.stage))).toEqual(new Set([1, 2, 3]));
  });
});

describe('stage colours', () => {
  it('matches the palette the whole site encodes stages with', () => {
    expect(STAGE_COLOR).toEqual({
      1: '#22D3EE',
      2: '#2E7DFF',
      3: '#A855F7',
    });
  });

  it('returns a distinct class string per stage', () => {
    const classes = new Set([stageClass(1), stageClass(2), stageClass(3)]);
    expect(classes.size).toBe(3);
  });

  it('never routes a neon colour into body text (spec §5.1)', () => {
    for (const stage of [1, 2, 3] as const) {
      expect(stageClass(stage)).not.toMatch(/\btext-/);
    }
  });
});

/**
 * The six ids live in two places: this module and the `z.enum` in the content
 * collection schema. `astro:content` cannot be imported outside an Astro build,
 * so the schema is read as text. A silent divergence would let a content file
 * exist for a skill the site never renders, or vice versa.
 */
describe('content collection schema', () => {
  const config = readFileSync(resolve(process.cwd(), 'src/content.config.ts'), 'utf8');

  /** Reads the members of a `const NAME = z.enum([...])` declaration. */
  function enumMembers(name: string): string[] | null {
    const match = new RegExp(`${name}\\s*=\\s*z\\.enum\\(\\[([\\s\\S]*?)\\]\\)`).exec(config);
    if (!match) return null;
    return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  }

  it('binds the skill id enum to exactly the six SKILLS ids', () => {
    const declared = enumMembers('SKILL_ID');
    expect(declared, 'no `SKILL_ID = z.enum([...])` in src/content.config.ts').not.toBeNull();
    expect(declared).toEqual(SKILLS.map((s) => s.id));
  });

  it('binds the locale enum to exactly the i18n locales', () => {
    expect(enumMembers('LOCALE'), 'no `LOCALE = z.enum([...])`').toEqual([...LOCALES]);
  });

  it('actually uses those enums in the skills schema', () => {
    expect(config).toMatch(/\bid:\s*SKILL_ID\b/);
    expect(config).toMatch(/\blang:\s*LOCALE\b/);
  });

  it('gives every collection a loader (Astro 5 removed implicit directories)', () => {
    const loaders = [...config.matchAll(/loader:\s*glob\(/g)];
    const collections = [...config.matchAll(/defineCollection\(/g)];
    expect(collections.length).toBeGreaterThan(0);
    expect(loaders.length, 'each defineCollection needs its own glob loader').toBe(
      collections.length,
    );
  });
});
