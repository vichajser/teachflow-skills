import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Astro 5 的规范位置是 `src/content.config.ts`（不是 Astro 4 的 `src/content/config.ts`），
// 且 `defineCollection` 必须显式给 `loader` —— 隐式目录扫描的写法在 5.x 已移除。
// 注意 `id` 同时出现在两处：文件名（loader 据此生成 entry.id）与 frontmatter 字段
// （由下面的 `z.enum` 校验）。两者必须一致，`tests/unit/skills-content.test.ts` 会断言。

const LOCALE = z.enum(['en', 'ko']);

const SKILL_ID = z.enum([
  'lesson-workflow',
  'ppt-workflow',
  'audio-workflow',
  'word-workflow',
  'worksheet-workflow',
  'report-workflow',
]);

const skills = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/skills' }),
  schema: z.object({
    id: SKILL_ID,
    lang: LOCALE,
    title: z.string(),
    tagline: z.string(),
    /** 教师需要提供什么（README §4 的"입력" 表） */
    inputs: z.array(z.string()).min(1),
    /** 教师拿到产物后必须自查什么（README §4 的"교사 확인 사항"） */
    checks: z.array(z.string()).min(1),
  }),
});

const legal = defineCollection({
  // `generateId` 是必需的，不是风格选择。glob loader 的 `generateIdDefault`
  // （node_modules/astro/dist/content/loaders/glob.js:9-12）对名为 `slug` 的
  // frontmatter 字段有特判：存在就**直接拿它当 entry id，完全忽略文件路径**。
  // 本集合的字段恰好叫 slug，于是 en/terms.md 与 ko/terms.md 同得 id "terms"，
  // 后读到的那份静默覆盖前一份 —— 八个文件只剩四个条目，且全是同一种语言，
  // 构建随即在 `Missing en legal content for "delivery"` 处失败。
  // skills 集合没踩到是因为它的字段叫 `id` 而不是 `slug`，走的是路径派生分支。
  // 这里显式按路径生成 id（'en/terms'），与 skills 集合的行为对齐。
  // schema 一字未改：slug 仍是必填的 z.enum，页面仍按 slug + lang 查询。
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/legal',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: z.object({
    slug: z.enum(['terms', 'privacy', 'refund', 'delivery']),
    lang: LOCALE,
    title: z.string(),
    description: z.string(),
    updated: z.string(),
  }),
});

const faq = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/faq' }),
  schema: z.object({
    lang: LOCALE,
    order: z.number(),
    question: z.string(),
  }),
});

export const collections = { skills, legal, faq };
