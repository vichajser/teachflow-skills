import { describe, it, expect, afterEach, vi } from 'vitest';
import { install, uninstall, NODES, EDGE_KEYS, type Recorder } from './flow-diagram-harness';

/**
 * 关系图演出的回归覆盖。
 *
 * 为什么要有这个文件：Task 9 的评审跑了 13 个变异——把 `started` 取反让图永远
 * 藏着、drawEdge 终值写错让连线永不闭合、reduced-motion 守卫整个删掉、
 * 阈值 0.35 改成 1 让动画几乎不触发——**13 个全绿**。整个动画模块当时零测试。
 * Task 10 要把它挂上首页，Task 13 还要在同一批元素上加悬停，没有守卫的话
 * 这两步都可能把演出悄悄弄坏。
 *
 * 断言对象是控制流与写入顺序，不是像素：过渡是否真的渲染出来，由人在浏览器里
 * 三态核对（R-36），那件事测试证明不了。
 */

/** 被测模块零导出、import 即执行 init()，所以每个场景都要重新 import */
async function run(options = {}): Promise<Recorder> {
  const rec = install(options);
  vi.resetModules();
  // 被测文件零导出（R-2），tsc 因此把它看成脚本而不是模块，报 TS2306。
  // 运行时没有任何问题（Vite 照常打成 ES 模块）；为了保住 R-2 不给源文件
  // 加一个纯为取悦类型检查的 `export {}`，在这里显式标注预期错误。
  // @ts-expect-error TS2306: 零导出的叶子模块不是 tsc 眼里的 module
  await import('@/components/FlowDiagram/flow-diagram');
  return rec;
}

afterEach(() => {
  uninstall();
});

describe('init guards', () => {
  it('does nothing at all when the SVG is not rendered', async () => {
    // R-31：md 断点以下整棵 SVG 子树 display:none。此时若照样 hide()，
    // 元素被压成 opacity:0 却永远等不到观察器回调——图彻底消失。
    const rec = await run({ svgRendered: false });
    expect(rec.writes, 'nothing may be hidden').toEqual([]);
    expect(rec.observers, 'no observer may be constructed').toEqual([]);
    expect(rec.timers, 'no timer may be scheduled').toEqual([]);
  });

  it('falls back to getClientRects when checkVisibility is missing', async () => {
    // 老一些的浏览器没有 checkVisibility。回退分支若判反，动画在那些浏览器上
    // 永不初始化——而"永不初始化"恰恰是静默的：页面停在静态终态，看不出坏了。
    const hidden = await run({ svgRendered: false, hasCheckVisibility: false });
    expect(hidden.observers).toEqual([]);

    const shown = await run({ svgRendered: true, hasCheckVisibility: false });
    expect(shown.observers).toHaveLength(1);
  });

  it('renders the final state untouched under prefers-reduced-motion', async () => {
    const rec = await run({ reducedMotion: true });
    expect(rec.writes).toEqual([]);
    expect(rec.timers).toEqual([]);
  });

  it('leaves the diagram visible when IntersectionObserver is unavailable', async () => {
    // 这里若先藏后等，元素会被藏够 4 秒才还原，白白闪一下且毫无收益。
    const rec = await run({ hasIntersectionObserver: false });
    expect(rec.writes).toEqual([]);
    expect(rec.timers).toEqual([]);
  });
});

describe('showtime', () => {
  it('hides the nodes and waits at a threshold that a tall figure can reach', async () => {
    const rec = await run();
    const hidden = rec.writes.filter((w) => w.prop === 'opacity' && w.value === '0');
    expect(hidden.map((w) => w.el).sort()).toEqual([...NODES, 'input'].sort());

    // 阈值改成 1 时，比视口高的图永远无法 100% 可见，演出几乎不会触发。
    expect(rec.observers[0]!.threshold).toBeGreaterThan(0);
    expect(rec.observers[0]!.threshold).toBeLessThanOrEqual(0.5);
  });

  it('reflows between the initial value and the final value of every fade', async () => {
    // R-30 的全部要害。少了这次回流，浏览器把初值与终值合并进一次样式重算，
    // 过渡根本不播——而 DOM 终态看起来完全正常，任何"查最终样式"的断言都抓不住。
    const rec = await run();
    rec.observers[0]!.fire();

    for (const el of [...NODES, 'input']) {
      const start = rec.indexOf(el, 'opacity', '0');
      const end = rec.indexOf(el, 'opacity', '1');
      const reflow = rec.reflowIndex(el);
      expect(start, `${el} never gets a start value`).toBeGreaterThanOrEqual(0);
      expect(end, `${el} never reaches opacity 1`).toBeGreaterThan(start);
      expect(reflow, `${el} never reflows`).toBeGreaterThan(start);
      expect(reflow, `${el} reflows after its final value`).toBeLessThanOrEqual(end);
    }
  });

  it('draws every edge from full offset down to zero', async () => {
    const rec = await run();
    rec.observers[0]!.fire();

    for (const key of EDGE_KEYS) {
      const offsets = rec.valuesOf(key, 'strokeDashoffset');
      expect(offsets, `edge ${key} does not animate`).toEqual(['123.45', '0']);
      expect(rec.reflowIndex(key), `edge ${key} never reflows`).toBeGreaterThanOrEqual(0);
    }
  });

  it('reflows before arming each edge transition, not after', async () => {
    // R-43：只断言"回流发生过"抓不住写入顺序错乱。transition 若先于回流写入，
    // 回流本身就带着过渡把 dashoffset 从终态 0 推向 length，紧接着的 `= '0'`
    // 又就地反转这场过渡——两次抵消，线恒停在 0。浏览器实测：错序时 700ms 内
    // offset 恒为 0；正序时 345 → 201 → 88 → 15 → 0。DOM 终态两者完全相同，
    // 所以任何"查最终样式"的断言都抓不住，只有写入顺序能。
    const rec = await run();
    rec.observers[0]!.fire();

    const firstIndexOf = (el: string, prop: string) =>
      rec.writes.findIndex((w) => w.el === el && w.prop === prop);

    for (const key of EDGE_KEYS) {
      const initial = rec.indexOf(key, 'strokeDashoffset', '123.45');
      const transition = firstIndexOf(key, 'transition');
      const final = rec.indexOf(key, 'strokeDashoffset', '0');
      const reflow = rec.reflowIndex(key);

      expect(transition, `edge ${key} never gets a transition`).toBeGreaterThanOrEqual(0);
      expect(reflow, `edge ${key} reflows before its initial offset`).toBeGreaterThan(initial);
      expect(
        reflow,
        `edge ${key} arms its transition before the reflow — the draw cancels itself`,
      ).toBeLessThanOrEqual(transition);
      expect(final, `edge ${key} never reaches offset 0`).toBeGreaterThan(transition);
    }
  });

  it('plays the four beats in order, from input to the report node', async () => {
    const rec = await run();
    rec.observers[0]!.fire();

    // transition 形如 `opacity 420ms ease-out 700ms, transform 420ms ease-out 700ms`，
    // 最后一个 Nms 就是延迟（拍号）；取第一个会取到时长，四拍全都相等。
    const delayOf = (el: string) => {
      const t = rec.writes.find((w) => w.el === el && w.prop === 'transition');
      const all = [...(t?.value.matchAll(/(\d+)ms/g) ?? [])];
      if (all.length === 0) throw new Error(`no transition recorded for ${el}`);
      return Number(all.at(-1)![1]);
    };

    // 四拍必须严格递进；报告节点与输入同拍的话，"汇聚"这层意思就没了。
    expect(delayOf('input')).toBeLessThan(delayOf('lesson-workflow'));
    expect(delayOf('lesson-workflow')).toBeLessThan(delayOf('ppt-workflow'));
    expect(delayOf('ppt-workflow')).toBeLessThan(delayOf('report-workflow'));

    // 四个二级节点同时亮起——视觉上表达"互相独立、按需选用"（spec §4.1 拍 3）
    const stage2 = ['ppt-workflow', 'audio-workflow', 'word-workflow', 'worksheet-workflow'];
    expect(new Set(stage2.map(delayOf)).size).toBe(1);
  });

  it('drops the input box in rather than fading it in place', async () => {
    const rec = await run();
    rec.observers[0]!.fire();
    const transforms = rec.valuesOf('input', 'transform');
    expect(transforms[0], 'input has no drop-in offset').toMatch(/translateY\(-?\d+px\)/);
    expect(transforms).toContain('none');
  });

  it('clears every inline style it set once the show is over', async () => {
    // 残留的 transition 会和 Task 13 的悬停过渡打架；残留的 dasharray 会让
    // 后续任何 stroke 改动看起来像虚线。演出后必须回到零内联样式。
    const rec = await run();
    rec.observers[0]!.fire();

    // 必须按精确延迟取：init() 先登记了 4000ms 的兜底、play() 里才登记
    // 3600ms（BEAT_MS*4+800）的清理。区间匹配会取到兜底——而兜底在 started
    // 之后本就该空转，于是测试会误报"没清理干净"。
    const cleanup = rec.timers.find((t) => t.delay === 3600);
    expect(cleanup, 'no cleanup timer scheduled at BEAT_MS*4+800').toBeDefined();
    cleanup!.run();

    for (const el of [...NODES, 'input']) {
      expect(rec.valuesOf(el, 'opacity').at(-1), `${el} keeps an inline opacity`).toBe('');
      expect(rec.valuesOf(el, 'transition').at(-1), `${el} keeps a transition`).toBe('');
    }
    for (const key of EDGE_KEYS) {
      expect(rec.valuesOf(key, 'strokeDashoffset').at(-1)).toBe('');
      expect(rec.valuesOf(key, 'strokeDasharray').at(-1)).toBe('');
    }
  });

  it('survives a diagram that is missing the input group', async () => {
    const rec = await run({ omitInput: true });
    expect(() => rec.observers[0]!.fire()).not.toThrow();
  });
});

describe('the 4s fallback', () => {
  it('reveals the nodes when the figure is never scrolled into view', async () => {
    const rec = await run();
    const fallback = rec.timers.find((t) => t.delay === 4000);
    expect(fallback, 'no fallback timer').toBeDefined();
    fallback!.run();

    for (const el of [...NODES, 'input']) {
      expect(rec.valuesOf(el, 'opacity').at(-1), `${el} stays hidden forever`).toBe('');
    }
  });

  it('does not touch a show already in progress', async () => {
    // `started` 判反时：滚过去的图永远藏着，而进入视口的图会在某一拍被拦腰
    // 清掉 opacity。两种坏法都只在特定时序下现形，肉眼极难复现。
    const rec = await run();
    rec.observers[0]!.fire();
    const before = rec.writes.length;

    rec.timers.find((t) => t.delay === 4000)!.run();
    expect(rec.writes.length, 'fallback wrote styles mid-show').toBe(before);
  });

  it('disconnects the observer as soon as it fires, so the show runs once', async () => {
    const rec = await run();
    rec.observers[0]!.fire();
    expect(rec.observers[0]!.disconnected).toBe(true);
  });
});
