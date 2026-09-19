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

  it('keeps every node inside the viewBox', () => {
    for (const node of FLOW_NODES) {
      expect(node.x, `${node.id} left edge`).toBeGreaterThanOrEqual(0);
      expect(node.y, `${node.id} top edge`).toBeGreaterThanOrEqual(0);
      expect(node.x + node.w, `${node.id} right edge`).toBeLessThanOrEqual(VIEWBOX.w);
      expect(node.y + node.h, `${node.id} bottom edge`).toBeLessThanOrEqual(VIEWBOX.h);
    }
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
    expect(sources).toHaveLength(4);
  });

  it('references only nodes that exist', () => {
    const ids = new Set<string>([...FLOW_NODES.map((n) => n.id), 'input']);
    for (const edge of FLOW_EDGES) {
      expect(ids.has(edge.from), `unknown edge source ${edge.from}`).toBe(true);
      expect(ids.has(edge.to), `unknown edge target ${edge.to}`).toBe(true);
    }
  });
});

describe('edgePath', () => {
  it('produces a cubic bezier starting at the source and ending at the target', () => {
    const d = edgePath({ from: 'input', to: 'lesson-workflow' });
    expect(d).toMatch(/^M [\d.]+ [\d.]+ C /);
  });

  it('never returns NaN coordinates', () => {
    for (const edge of FLOW_EDGES) {
      expect(edgePath(edge), `${edge.from} → ${edge.to}`).not.toContain('NaN');
    }
  });
});
