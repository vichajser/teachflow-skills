import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SKILLS } from '@/data/skills';
import { LOCALES } from '@/i18n/config';

/**
 * `astro:content` is unavailable to vitest, so the 12 markdown files are read
 * from disk. The parser below deliberately understands only the frontmatter
 * subset these files use — scalars and block sequences of scalars. Anything
 * else throws, so a malformed file fails loudly instead of parsing as empty.
 */
type Frontmatter = Record<string, string | string[]>;

function parseFrontmatter(source: string, file: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
  if (!match) throw new Error(`${file}: no frontmatter block`);

  const data: Frontmatter = {};
  let currentList: string | null = null;

  for (const raw of match[1]!.split(/\r?\n/)) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;

    const item = /^\s{2}-\s+(.*)$/.exec(raw);
    if (item) {
      if (currentList === null) throw new Error(`${file}: list item without a key`);
      const value = item[1]!.trim();
      // A bare `: ` inside an unquoted YAML scalar turns the item into a nested
      // mapping, which then fails the collection's `z.array(z.string())`. This
      // parser would otherwise read it as a plain string and go green — which is
      // exactly the false pass `verify-fm.rb` (real Psych YAML) caught on
      // `예: 45분 × 3차시`. Quote the value to keep it a string.
      if (/: /.test(value) && !/^["'].*["']$/.test(value)) {
        throw new Error(
          `${file}: list item contains an unquoted ": " and would parse as a mapping: ${raw.trim()}`,
        );
      }
      (data[currentList] as string[]).push(value.replace(/^["']|["']$/g, ''));
      continue;
    }

    const scalar = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(raw);
    if (!scalar) throw new Error(`${file}: unparsable frontmatter line: ${raw}`);
    const [, key, value] = scalar;
    if (value === '') {
      data[key!] = [];
      currentList = key!;
    } else {
      const scalarValue = value!.trim();
      // 同样的陷阱在顶层标量上也成立：`title: 수업: 슬라이드` 会被真 YAML
      // 读成嵌套映射，而这个手写解析器会当成普通字符串放行。今天 12 份文件
      // 里没有这种写法，但守卫要对称，否则将来第一次写出来时是静默通过。
      if (/: /.test(scalarValue) && !/^["'].*["']$/.test(scalarValue)) {
        throw new Error(
          `${file}: scalar contains an unquoted ": " and would parse as a mapping: ${raw.trim()}`,
        );
      }
      data[key!] = scalarValue.replace(/^["']|["']$/g, '');
      currentList = null;
    }
  }

  return data;
}

const SKILL_IDS = SKILLS.map((s) => s.id).sort();
const KEYS = ['id', 'lang', 'title', 'tagline', 'inputs', 'checks'];

function load(lang: string, id: string) {
  const rel = `src/content/skills/${lang}/${id}.md`;
  return { rel, data: parseFrontmatter(readFileSync(resolve(process.cwd(), rel), 'utf8'), rel) };
}

describe('skill content files', () => {
  it('ships one file per skill per locale', () => {
    for (const lang of LOCALES) {
      const ids = SKILL_IDS.map((id) => load(lang, id).data.id).sort();
      expect(ids, `${lang} content is not symmetric with SKILLS`).toEqual(SKILL_IDS);
    }
  });

  it('gives en and ko the same frontmatter keys', () => {
    for (const id of SKILL_IDS) {
      const en = Object.keys(load('en', id).data).sort();
      const ko = Object.keys(load('ko', id).data).sort();
      expect(en, `frontmatter keys differ for ${id}`).toEqual(ko);
      expect(en).toEqual([...KEYS].sort());
    }
  });

  it('matches id, lang and filename in every file', () => {
    for (const lang of LOCALES) {
      for (const id of SKILL_IDS) {
        const { rel, data } = load(lang, id);
        expect(data.id, rel).toBe(id);
        expect(data.lang, rel).toBe(lang);
      }
    }
  });

  it('has a non-empty title, tagline, inputs and checks everywhere', () => {
    for (const lang of LOCALES) {
      for (const id of SKILL_IDS) {
        const { rel, data } = load(lang, id);
        expect(typeof data.title, rel).toBe('string');
        expect((data.title as string).length, rel).toBeGreaterThan(0);
        expect((data.tagline as string).length, rel).toBeGreaterThan(0);
        expect(data.inputs, rel).toBeInstanceOf(Array);
        expect(data.checks, rel).toBeInstanceOf(Array);
        expect((data.inputs as string[]).length, rel).toBeGreaterThan(0);
        expect((data.checks as string[]).length, rel).toBeGreaterThan(0);
      }
    }
  });

  // Korean copy must be Korean, not an English placeholder left behind.
  it('writes real Korean for the Korean files', () => {
    for (const id of SKILL_IDS) {
      const { rel, data } = load('ko', id);
      const prose = [data.title, data.tagline, ...(data.inputs as string[]), ...(data.checks as string[])].join(
        ' ',
      );
      expect(/[가-힣]/.test(prose), `${rel} contains no Hangul`).toBe(true);
    }
  });

  it('has a non-empty body under the frontmatter', () => {
    for (const lang of LOCALES) {
      for (const id of SKILL_IDS) {
        const { rel } = load(lang, id);
        const body = readFileSync(resolve(process.cwd(), rel), 'utf8')
          .replace(/^---[\s\S]*?\n---\n/, '')
          .trim();
        expect(body.length, `${rel} has an empty body`).toBeGreaterThan(80);
      }
    }
  });
});
