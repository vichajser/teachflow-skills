import { SKILLS, STAGE_COLOR, type SkillId, type SkillStage } from '@/data/skills';
import { SAMPLES, isReady, type Sample } from '@/data/samples';
import { localizePath, type Locale } from '@/i18n/config';
import type { TranslationKey } from '@/i18n/t';

export const VIEWBOX = { w: 960, h: 640 } as const;

export interface FlowNode {
  id: SkillId;
  stage: SkillStage;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 该节点产出的文件扩展名，取自 SKILLS */
  outputs: readonly string[];
  /** 该节点需要的上游输入，Task 13 的悬停侧卡要用 */
  needs: readonly string[];
  /**
   * 侧卡展示用：这一步需要的材料，i18n 键。
   *
   * 与 `needs` 并存的理由：`needs` 是"上游节点产出的文件扩展名"这份数据，
   * 而侧卡要说的是"这一步需要什么材料"。二者在 `lesson-workflow` 处就分道——
   * 它的产物是 Markdown 文本（차시 분할 / 수업 지도안 / PPT 개요），不是可下载
   * 文件，`skills.ts` 于是把它的 `outputs` 记为 `[]`，四个二级节点的
   * `needs: STAGE1_OUTPUT` 便全是空数组。照 `needs.join()` 渲染会让五张卡
   * 挂着空标题。语义源是产品文档每个 skill 的 `#### 입력 자료` 表。
   */
  needsKey: TranslationKey;
  /** 侧卡展示用：这一步做出的东西，i18n 键（产品文档 `#### 산출물` 表） */
  makesKey: TranslationKey;
}

export interface FlowEdge {
  from: SkillId | 'input';
  to: SkillId;
}

/**
 * 教材 PDF + 학습자 정보 —— 演出第一拍从这里落下。
 *
 * 宽度 240 而非 200：英文标签 "Textbook PDF + learner profile" 在 14px 下
 * 自然宽约 177px，200 宽的盒子扣掉左右留白后只剩 176px，正好压线。
 * Task 12 换上 Inter 后字宽会变，压线的设计会翻车。中心点仍是 480
 * （360 + 240/2），所以 edgePath 生成的曲线一条都没动。
 */
export const INPUT_NODE = { x: 360, y: 16, w: 240, h: 56 } as const;

const NODE_H = 88;
const STAGE2_W = 200;
const STAGE2_GAP = 20;
const STAGE2_Y = 280;

// 四个二级节点水平居中排布：4×200 + 3×20 = 860，左边距 (960-860)/2 = 50
const stage2X = (index: number) => 50 + index * (STAGE2_W + STAGE2_GAP);

const STAGE2_ORDER: readonly SkillId[] = [
  'ppt-workflow',
  'audio-workflow',
  'word-workflow',
  'worksheet-workflow',
];

const outputsOf = (id: SkillId) =>
  SKILLS.find((s) => s.id === id)?.outputs ?? [];

/** 一级节点的产物就是二级节点的输入；四个二级节点的产物汇总成三级节点的输入 */
const STAGE1_OUTPUT = outputsOf('lesson-workflow');
const STAGE2_OUTPUTS = STAGE2_ORDER.flatMap(outputsOf);

/**
 * 侧卡的展示文案键，逐节点写死而不是 `flow.needs.${id}` 拼出来。
 * 拼出来的键在类型上恒等于 TranslationKey，任何拼写/改名都不会报错也不会
 * 变红；写死则 `TranslationKey` 会在编译期挡下不存在的键，测试里也能逐条
 * 核对它真的在字典中（而不是渲染成裸键或空串）。
 *
 * `Record<SkillId, …>` 覆盖全部六个节点：新增一个 skill 而忘了给它配两个键，
 * `tsc` 立刻报缺属性，而不是等到运行时渲染出一张只有标题的空卡。变异 N1
 * （把某个 needsKey 指向不存在的键）因此同时被编译期和运行期两层挡住。
 */
const CARD_KEYS: Record<
  SkillId,
  { needsKey: TranslationKey; makesKey: TranslationKey }
> = {
  'lesson-workflow': {
    needsKey: 'flow.needs.lesson-workflow',
    makesKey: 'flow.makes.lesson-workflow',
  },
  'ppt-workflow': {
    needsKey: 'flow.needs.ppt-workflow',
    makesKey: 'flow.makes.ppt-workflow',
  },
  'audio-workflow': {
    needsKey: 'flow.needs.audio-workflow',
    makesKey: 'flow.makes.audio-workflow',
  },
  'word-workflow': {
    needsKey: 'flow.needs.word-workflow',
    makesKey: 'flow.makes.word-workflow',
  },
  'worksheet-workflow': {
    needsKey: 'flow.needs.worksheet-workflow',
    makesKey: 'flow.makes.worksheet-workflow',
  },
  'report-workflow': {
    needsKey: 'flow.needs.report-workflow',
    makesKey: 'flow.makes.report-workflow',
  },
};

export const FLOW_NODES: readonly FlowNode[] = [
  {
    id: 'lesson-workflow',
    stage: 1,
    x: 300,
    y: 120,
    w: 360,
    h: NODE_H,
    outputs: STAGE1_OUTPUT,
    needs: ['textbook.pdf'],
    ...CARD_KEYS['lesson-workflow'],
  },
  ...STAGE2_ORDER.map((id, index) => ({
    id,
    stage: 2 as SkillStage,
    x: stage2X(index),
    y: STAGE2_Y,
    w: STAGE2_W,
    h: NODE_H,
    outputs: outputsOf(id),
    needs: STAGE1_OUTPUT,
    ...CARD_KEYS[id],
  })),
  {
    id: 'report-workflow',
    stage: 3,
    x: 330,
    y: 470,
    w: 300,
    h: NODE_H,
    outputs: outputsOf('report-workflow'),
    needs: STAGE2_OUTPUTS,
    ...CARD_KEYS['report-workflow'],
  },
];

export const FLOW_EDGES: readonly FlowEdge[] = [
  { from: 'input', to: 'lesson-workflow' },
  ...STAGE2_ORDER.map((id) => ({ from: 'lesson-workflow' as const, to: id })),
  ...STAGE2_ORDER.map((id) => ({ from: id, to: 'report-workflow' as const })),
];

const boxOf = (ref: SkillId | 'input') => {
  if (ref === 'input') return INPUT_NODE;
  const node = FLOW_NODES.find((n) => n.id === ref);
  if (!node) throw new Error(`Unknown flow node: ${ref}`);
  return node;
};

/** 从源节点底边中点到目标节点顶边中点的垂直三次贝塞尔 */
export function edgePath(edge: FlowEdge): string {
  const from = boxOf(edge.from);
  const to = boxOf(edge.to);

  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + to.w / 2;
  const y2 = to.y;
  const lift = (y2 - y1) / 2;

  return `M ${x1} ${y1} C ${x1} ${y1 + lift}, ${x2} ${y2 - lift}, ${x2} ${y2}`;
}

export function nodeColor(stage: SkillStage): string {
  return STAGE_COLOR[stage];
}

/**
 * 该节点的样例链接，没有就返回 null。
 *
 * 传 `samples` 进来而不是直接读模块级 `SAMPLES`，是为了让"样例就绪时给什么
 * 链接"这条规则可以被直接测到：今天五个样例的 `file` 全是 null，构建产物里
 * 一条样例链接都不会出现，只扫 `dist/` 的话"删掉链接渲染"这个变异完全不可见。
 *
 * 未生成（`file === null`）时不给链接，与 `/samples` 同一条纪律：宁可没有入口，
 * 也不给一个指向空文件的下载地址。`lesson-workflow` 不在 `SAMPLES` 里，因此
 * 它的卡片永远没有样例链接——这是对的，不为它伪造一个。
 */
export function sampleHref(
  id: SkillId,
  lang: Locale,
  samples: readonly Sample[] = SAMPLES,
): string | null {
  const sample = samples.find((s) => s.skillId === id && isReady(s));
  return sample ? `${localizePath('/samples', lang)}#${sample.id}` : null;
}
