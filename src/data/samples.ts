import type { SkillId } from '@/data/skills';
import type { Locale } from '@/i18n/config';

export interface Sample {
  id: string;
  skillId: SkillId;
  /** public/samples/ 下的路径。未生成时为 null——渲染占位而不是坏链。 */
  file: string | null;
  previewImage: string | null;
  /** 实际运行该 skill 的耗时（秒）。无测量记录时为 null，页面不显示数字。 */
  durationSeconds: number | null;
  title: Record<Locale, string>;
}

/**
 * 样例产物由独立工作流生成（spec §7），与建站并行。
 * 生成后把 file / previewImage / durationSeconds 填上即可，页面自动从占位切换为真卡片。
 *
 * `previewImage` 只能是本站路径（`/samples/…`）或 null。指向远程 URL 会在
 * `/samples` 渲染一张跨源 `<img>`，直接证伪 `/legal/privacy` 的
 * "no third-party requests"——`tests/unit/samples.test.ts` 与
 * `tests/build/legal.test.mjs` 各守一侧。
 *
 * 隐私约束（spec §7.4）：样例文件中不得出现任何真实学生姓名或学校名。
 *
 * `lesson-workflow` 的产物（차시 분할、수업 지도안）是 Markdown 文本而非可下载文件，
 * 因此不在此列表中——`tests/unit/samples.test.ts` 只要求"产出文件的 skill"有条目。
 */
export const SAMPLES: readonly Sample[] = [
  {
    id: 'unit07-slides',
    skillId: 'ppt-workflow',
    file: null,
    previewImage: null,
    durationSeconds: null,
    title: { en: 'Unit 7 lesson slides (.pptx)', ko: '7단원 수업 슬라이드 (.pptx)' },
  },
  {
    id: 'unit07-listening',
    skillId: 'audio-workflow',
    file: null,
    previewImage: null,
    durationSeconds: null,
    title: { en: 'Unit 7 listening audio (.mp3)', ko: '7단원 듣기 음원 (.mp3)' },
  },
  {
    id: 'unit07-vocabulary',
    skillId: 'word-workflow',
    file: null,
    previewImage: null,
    durationSeconds: null,
    title: { en: 'Unit 7 vocabulary table (.xlsx)', ko: '7단원 어휘 학습표 (.xlsx)' },
  },
  {
    id: 'unit07-worksheets',
    skillId: 'worksheet-workflow',
    file: null,
    previewImage: null,
    durationSeconds: null,
    title: { en: 'Unit 7 worksheets (.docx ×3)', ko: '7단원 수준별 학습지 (.docx ×3)' },
  },
  {
    id: 'unit07-parent-notice',
    skillId: 'report-workflow',
    file: null,
    previewImage: null,
    durationSeconds: null,
    title: { en: 'Unit 7 parent notice (.png)', ko: '7단원 학부모 안내문 (.png)' },
  },
] as const;

export function isReady(sample: Sample): boolean {
  return sample.file !== null;
}
