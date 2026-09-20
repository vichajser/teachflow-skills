import { describe, it, expect } from 'vitest';
import {
  VIEWBOX,
  FLOW_NODES,
  FLOW_EDGES,
  INPUT_NODE,
  edgePath,
} from '@/components/FlowDiagram/nodes';
import { SKILLS } from '@/data/skills';

describe('FLOW_NODES', () => {
  it('has a node for every shipped skill and nothing else', () => {
    expect(FLOW_NODES.map((n) => n.id).sort()).toEqual(
      SKILLS.map((s) => s.id).sort(),
    );
  });

  it('keeps every box inside the viewBox, INPUT_NODE included', () => {
    // INPUT_NODE 不在 FLOW_NODES 里，只循环 FLOW_NODES 就把它整个漏掉了：
    // 把 x 改成 900（右边缘 1140 > 960）照样全绿，而渲染出来的输入框
    // 已经被 viewBox 裁掉一半。它和六个节点画在同一张图上，就得受同一条约束。
    const boxes: { label: string; x: number; y: number; w: number; h: number }[] = [
      { label: 'input', ...INPUT_NODE },
      ...FLOW_NODES.map((n) => ({ label: n.id, x: n.x, y: n.y, w: n.w, h: n.h })),
    ];

    for (const box of boxes) {
      expect(box.x, `${box.label} left edge`).toBeGreaterThanOrEqual(0);
      expect(box.y, `${box.label} top edge`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w, `${box.label} right edge`).toBeLessThanOrEqual(VIEWBOX.w);
      expect(box.y + box.h, `${box.label} bottom edge`).toBeLessThanOrEqual(VIEWBOX.h);
    }
  });

  it('places the input box above the first stage without overlapping it', () => {
    const stage1Top = Math.min(
      ...FLOW_NODES.filter((n) => n.stage === 1).map((n) => n.y),
    );
    expect(INPUT_NODE.y + INPUT_NODE.h).toBeLessThan(stage1Top);
  });

  it('stacks the three stages top to bottom without overlap', () => {
    const bottomOf = (stage: number) =>
      Math.max(...FLOW_NODES.filter((n) => n.stage === stage).map((n) => n.y + n.h));
    const topOf = (stage: number) =>
      Math.min(...FLOW_NODES.filter((n) => n.stage === stage).map((n) => n.y));

    expect(bottomOf(1)).toBeLessThan(topOf(2));
    expect(bottomOf(2)).toBeLessThan(topOf(3));
  });

  it('lays the four stage-2 nodes side by side, not overlapping', () => {
    const stage2 = FLOW_NODES.filter((n) => n.stage === 2).sort((a, b) => a.x - b.x);
    expect(stage2).toHaveLength(4);
    for (let i = 1; i < stage2.length; i++) {
      expect(stage2[i]!.x).toBeGreaterThanOrEqual(stage2[i - 1]!.x + stage2[i - 1]!.w);
    }
  });
});

describe('FLOW_EDGES', () => {
  it('feeds the textbook input into lesson-workflow', () => {
    expect(FLOW_EDGES).toContainEqual({ from: 'input', to: 'lesson-workflow' });
  });

  it('fans lesson-workflow out to all four stage-2 skills', () => {
    const targets = FLOW_EDGES.filter((e) => e.from === 'lesson-workflow').map(
      (e) => e.to,
    );
    expect(targets.sort()).toEqual([
      'audio-workflow',
      'ppt-workflow',
      'word-workflow',
      'worksheet-workflow',
    ]);
  });

  it('funnels all four stage-2 skills into report-workflow', () => {
    const sources = FLOW_EDGES.filter((e) => e.to === 'report-workflow').map(
      (e) => e.from,
    );
    // 只断言 length===4 的话，四条 from 全指向同一个节点也算通过——
    // 那种图丢了三条汇聚边却依然绿灯。必须逐个点名，和上面的 fan-out 对称。
    expect(sources.sort()).toEqual([
      'audio-workflow',
      'ppt-workflow',
      'word-workflow',
      'worksheet-workflow',
    ]);
  });

  it('references only nodes that exist', () => {
    const ids = new Set<string>([...FLOW_NODES.map((n) => n.id), 'input']);
    for (const edge of FLOW_EDGES) {
      expect(ids.has(edge.from), `unknown edge source ${edge.from}`).toBe(true);
      expect(ids.has(edge.to), `unknown edge target ${edge.to}`).toBe(true);
    }
  });

  it('is exactly these nine edges — no extras, no duplicates', () => {
    // 上面三条只各自钉住自己那一段子图：fan-out 查 from==='lesson-workflow'，
    // funnel 查 to==='report-workflow'，存在性检查只问 id 在不在集合里。
    // 三条合起来仍然容得下一条 ppt→word 的横穿边——图上多画一条对角线，
    // 测试全绿。整张图的边集必须整体断言一次。
    const key = (e: { from: string; to: string }) => `${e.from}->${e.to}`;
    expect(FLOW_EDGES.map(key).sort()).toEqual(
      [
        'input->lesson-workflow',
        'lesson-workflow->ppt-workflow',
        'lesson-workflow->audio-workflow',
        'lesson-workflow->word-workflow',
        'lesson-workflow->worksheet-workflow',
        'ppt-workflow->report-workflow',
        'audio-workflow->report-workflow',
        'word-workflow->report-workflow',
        'worksheet-workflow->report-workflow',
      ].sort(),
    );
  });
});

describe('edgePath', () => {
  it('produces a cubic bezier starting at the source and ending at the target', () => {
    const d = edgePath({ from: 'input', to: 'lesson-workflow' });
    expect(d).toMatch(/^M [\d.]+ [\d.]+ C /);

    // 光有前缀正则等于没测端点：把 x2 写死成常数，所有边都会连到同一个位置，
    // 而正则照样命中。这里把每条边的起点与终点解析出来逐个核对。
    const lesson = FLOW_NODES.find((n) => n.id === 'lesson-workflow')!;
    const parse = (path: string) => {
      const m = path.match(
        /^M ([\d.-]+) ([\d.-]+) C [\d.-]+ [\d.-]+, [\d.-]+ [\d.-]+, ([\d.-]+) ([\d.-]+)$/,
      );
      if (!m) throw new Error(`unparseable path: ${path}`);
      return {
        start: [Number(m[1]), Number(m[2])],
        end: [Number(m[3]), Number(m[4])],
      };
    };

    expect(parse(d).start).toEqual([
      INPUT_NODE.x + INPUT_NODE.w / 2,
      INPUT_NODE.y + INPUT_NODE.h,
    ]);
    expect(parse(d).end).toEqual([lesson.x + lesson.w / 2, lesson.y]);
  });

  it('anchors every edge at the source bottom-centre and the target top-centre', () => {
    const box = (ref: string) =>
      ref === 'input' ? INPUT_NODE : FLOW_NODES.find((n) => n.id === ref)!;

    for (const edge of FLOW_EDGES) {
      const m = edgePath(edge).match(
        /^M ([\d.-]+) ([\d.-]+) C [\d.-]+ [\d.-]+, [\d.-]+ [\d.-]+, ([\d.-]+) ([\d.-]+)$/,
      );
      expect(m, `${edge.from} → ${edge.to} is not a single cubic bezier`).not.toBeNull();

      const from = box(edge.from);
      const to = box(edge.to);
      const label = `${edge.from} → ${edge.to}`;
      expect([Number(m![1]), Number(m![2])], `${label} start`).toEqual([
        from.x + from.w / 2,
        from.y + from.h,
      ]);
      expect([Number(m![3]), Number(m![4])], `${label} end`).toEqual([
        to.x + to.w / 2,
        to.y,
      ]);
    }
  });

  it('never returns NaN coordinates', () => {
    for (const edge of FLOW_EDGES) {
      expect(edgePath(edge), `${edge.from} → ${edge.to}`).not.toContain('NaN');
    }
  });
});
