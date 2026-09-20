export type SkillId =
  | 'lesson-workflow'
  | 'ppt-workflow'
  | 'audio-workflow'
  | 'word-workflow'
  | 'worksheet-workflow'
  | 'report-workflow';

/** 1 = 流程源头；2 = 并列独立；3 = 课后终点（spec §5.2） */
export type SkillStage = 1 | 2 | 3;

export interface SkillMeta {
  id: SkillId;
  stage: SkillStage;
  order: number;
  /** 产物文件扩展名，按实际产出数量重复列出 */
  outputs: readonly string[];
}

export const SKILLS: readonly SkillMeta[] = [
  { id: 'lesson-workflow', stage: 1, order: 1, outputs: [] },
  { id: 'ppt-workflow', stage: 2, order: 2, outputs: ['.pptx'] },
  { id: 'audio-workflow', stage: 2, order: 3, outputs: ['.mp3'] },
  { id: 'word-workflow', stage: 2, order: 4, outputs: ['.xlsx', '.csv'] },
  {
    id: 'worksheet-workflow',
    stage: 2,
    order: 5,
    // 학생용 학습지 / 심화 도전 카드 / 교사용 정답지 —— 三份独立 docx
    outputs: ['.docx', '.docx', '.docx'],
  },
  { id: 'report-workflow', stage: 3, order: 6, outputs: ['.png'] },
];

export const STAGE_COLOR: Record<SkillStage, string> = {
  1: '#22D3EE',
  2: '#2E7DFF',
  3: '#A855F7',
};

/**
 * 霓虹色只走描边与辉光，不进正文（spec §5.1 约束）。
 * 因此这里返回的是 border/shadow 类，不含 text-*。
 *
 * switch 覆盖了 `SkillStage` 的全部三种取值，没有隐含的 `undefined` 返回路径，
 * 故不需要 default 分支。
 */
export function stageClass(stage: SkillStage): string {
  switch (stage) {
    case 1:
      return 'border-accent-glow shadow-[0_0_24px_rgba(34,211,238,0.25)]';
    case 2:
      return 'border-accent shadow-[0_0_24px_rgba(46,125,255,0.25)]';
    case 3:
      return 'border-accent-warm shadow-[0_0_24px_rgba(168,85,247,0.25)]';
  }
}

/**
 * 阶段色的**图标**版本，给 `<Icon>` 用（图标以 `currentColor` 描边，所以这里
 * 必须是 `text-*`）。
 *
 * 为什么与 `stageClass()` 分开两个函数、而不是在后者上追加一个 `text-*`：
 * `stageClass()` 的返回值套在卡片 `<a>`/`<article>` 上，那里的 `text-*` 会被
 * 未显式指定颜色的子元素继承，正文就会变成霓虹色——spec §5.1 逐字禁止
 * （"深底上的 #22D3EE 正文既刺眼又无法通过 WCAG AA"）。
 * `tests/unit/skills.test.ts` 有一条断言把这件事钉死：`stageClass()` 不得匹配
 * `/\btext-/`。而 §5.1 同一句话把"小面积图标"列为霓虹色**允许**的落点，
 * 所以图标色走这个独立函数，作用域只到那一个 `<svg>`。
 */
export function stageIconClass(stage: SkillStage): string {
  switch (stage) {
    case 1:
      return 'text-accent-glow';
    case 2:
      return 'text-accent';
    case 3:
      return 'text-accent-warm';
  }
}
