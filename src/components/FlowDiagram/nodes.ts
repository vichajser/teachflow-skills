import { SKILLS, STAGE_COLOR, type SkillId, type SkillStage } from '@/data/skills';

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

const STAGE2_ORDER: SkillId[] = [
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
