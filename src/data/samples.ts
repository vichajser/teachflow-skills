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
 * **`file` 与 `previewImage` 的界线**（本轮填数据时定下的纪律）：
 * `previewImage` 是"长什么样"，`file` 是"你下载到的东西"。五个样例现在都有
 * 真实渲染的预览图，但只有听力音频的**实际交付格式**（.mp3）以原格式存在；
 * 另外四个标题写的是 .pptx/.xlsx/.docx/.png，而我们手上只有截图。
 * 把 `file` 指向截图，"Download" 按钮就会在标题写着 .pptx 的卡片上递出一张
 * PNG——那是对买家的虚假陈述，和编造数字是同一类错误。所以那四张卡
 * `file` 保持 null：有预览可看，但不谎称可下载。
 *
 * `durationSeconds` 同理仍全为 null：本字段的语义是**运行该 skill 的耗时**，
 * 不是音频时长。音频量到 50.09s，但那不是生成耗时，填进去就是偷换概念。
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
    previewImage: '/samples/unit07-slides.png',
    durationSeconds: null,
    title: { en: 'Unit 7 lesson slides (.pptx)', ko: '7단원 수업 슬라이드 (.pptx)' },
  },
  {
    id: 'unit07-listening',
    skillId: 'audio-workflow',
    file: '/samples/unit07-listening.mp3',
    previewImage: '/samples/unit07-listening.png',
    durationSeconds: null,
    title: { en: 'Unit 7 listening audio (.mp3)', ko: '7단원 듣기 음원 (.mp3)' },
  },
  {
    id: 'unit07-vocabulary',
    skillId: 'word-workflow',
    file: null,
    previewImage: '/samples/unit07-vocabulary.png',
    durationSeconds: null,
    title: { en: 'Unit 7 vocabulary table (.xlsx)', ko: '7단원 어휘 학습표 (.xlsx)' },
  },
  {
    id: 'unit07-worksheets',
    skillId: 'worksheet-workflow',
    file: null,
    previewImage: '/samples/unit07-worksheets.png',
    durationSeconds: null,
    title: { en: 'Unit 7 worksheets (.docx ×3)', ko: '7단원 수준별 학습지 (.docx ×3)' },
  },
  {
    id: 'unit07-parent-notice',
    skillId: 'report-workflow',
    file: null,
    previewImage: '/samples/unit07-parent-notice.png',
    durationSeconds: null,
    title: { en: 'Unit 7 parent notice (.png)', ko: '7단원 학부모 안내문 (.png)' },
  },
] as const;

export function isReady(sample: Sample): boolean {
  return sample.file !== null;
}
