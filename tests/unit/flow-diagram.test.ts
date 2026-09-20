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
  // Task 13 起本文件 `import { CAPSULE } from './nodes'`（裁决 12：脚本侧从
  // CAPSULE 取半宽），因此它已经是一个 tsc 眼里的 module，原先那条
  // `@ts-expect-error TS2306`（零导出叶子模块）不再有可报的错误，留着会让
  // tsc 以 TS2578「未使用的 ts-expect-error」失败。R-2 的约束是"不导出任何
  // 供其他模块使用的符号"，import 不违反它——这里如实去掉过期指令。
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

/**
 * Task 13：悬停高亮与约束胶囊。
 *
 * 这些是**行为**断言，构建产物里查不到——`bindHover` 的监听器、`is-dimmed`
 * 类的增减、侧卡的 `hidden` 全发生在运行时。变异 N3（把 `bindHover` 从
 * reduced-motion 的早退分支之后调用）只有在这里才可能被杀掉。
 */
describe('hover binding (Task 13)', () => {
  it('binds pointer and touch enhancement on every node, and no focus', async () => {
    // 修复轮 1 起不再有 `focus` 监听器：节点不进 tab 序（见下一组断言），
    // 挂上去也永不触发。留下的两个是纯指针/触屏增强，不产生可聚焦性。
    const rec = await run();
    for (const id of NODES) {
      expect(rec.listeners, `${id} has no mouseenter handler`).toContainEqual({
        el: id,
        type: 'mouseenter',
      });
      expect(rec.listeners, `${id} cannot be opened on a touch screen`).toContainEqual({
        el: id,
        type: 'click',
      });
      expect(
        rec.listeners.some((l) => l.el === id && l.type === 'focus'),
        `${id} still binds focus — the node is not focusable, so it can never fire`,
      ).toBe(false);
    }
  });

  it('keeps the hover binding under prefers-reduced-motion (N3)', async () => {
    // 悬停高亮是信息获取手段，不是装饰（brief Step 5）。把 bindHover 挪到
    // reduced-motion 早退分支**之后**，这条即红——而构建产物完全看不出差别：
    // 静态标记与正常模式逐字节相同，只有运行时是否绑上监听器不同。
    const rec = await run({ reducedMotion: true });

    // 先确认这确实是早退分支：四拍演出一点都没跑（没有隐藏、没有定时器）。
    expect(rec.writes, 'reduced motion should skip the show').toEqual([]);
    expect(rec.timers, 'reduced motion should skip the show').toEqual([]);

    // 但悬停照样绑上了。
    for (const id of NODES) {
      expect(
        rec.listeners.some((l) => l.el === id && l.type === 'mouseenter'),
        `${id} loses hover when reduced motion is on`,
      ).toBe(true);
    }
  });

  it('dims the other nodes and shows only the hovered card', async () => {
    const rec = await run();
    rec.fire('ppt-workflow', 'mouseenter');

    expect(rec.classesOf('ppt-workflow')).toContain('is-focused');
    expect(rec.classesOf('ppt-workflow')).not.toContain('is-dimmed');
    for (const id of NODES.filter((n) => n !== 'ppt-workflow')) {
      expect(rec.classesOf(id), `${id} should dim`).toContain('is-dimmed');
      expect(rec.classesOf(id), `${id} should not focus`).not.toContain('is-focused');
    }

    // 六张卡里只有被悬停的那张可见。`hidden` 判反或整批 toggle 都会红。
    for (const id of NODES) {
      expect(rec.cardVisible(id), `card ${id} visibility`).toBe(id === 'ppt-workflow');
    }
  });

  it('highlights exactly the edges that touch the hovered node', async () => {
    const rec = await run();
    rec.fire('ppt-workflow', 'mouseenter');

    // 与 ppt-workflow 相连的只有两条：lesson→ppt 与 ppt→report。
    // 前后缀两条判据缺一不可——只写 startsWith 的话汇聚边永远不亮，
    // 只写 endsWith 的话分叉边永远不亮。
    const touching = ['lesson-workflow->ppt-workflow', 'ppt-workflow->report-workflow'];
    for (const key of EDGE_KEYS) {
      const cls = rec.classesOf(key);
      const expected = touching.includes(key);
      expect(cls.includes('is-focused'), `edge ${key} focus`).toBe(expected);
      expect(cls.includes('is-dimmed'), `edge ${key} dim`).toBe(!expected);
    }
  });

  it('clears every highlight when the pointer leaves the figure', async () => {
    const rec = await run();
    rec.fire('word-workflow', 'mouseenter');
    rec.fire('root', 'mouseleave');

    for (const id of NODES) {
      expect(rec.classesOf(id), `${id} stays dimmed`).toEqual([]);
    }
    for (const key of EDGE_KEYS) {
      expect(rec.classesOf(key), `edge ${key} stays dimmed`).toEqual([]);
    }
    for (const id of NODES) {
      expect(rec.cardVisible(id), `card ${id} stays visible`).toBe(false);
    }
  });

  it('clears the highlight on Escape, through a listener on document', async () => {
    // Escape 挂在 `document` 上，不是 `figure`（评审发现 8）：鼠标打开高亮时
    // 焦点在 `<body>`，keydown 从 body 沿祖先链冒泡，`figure` 不是它的一条祖先，
    // 挂在 figure 上永不触发。这条用 `rec.fire('document', …)` 触发——若监听器
    // 退回 `root`，`document` 上就没有监听器，Escape 清不掉，断言红。
    const rec = await run();
    rec.fire('audio-workflow', 'mouseenter');
    // 非 Escape 键不得复位：写成 `!== 'Enter'` 一类的反向判断会让任意按键
    // 都清空，键盘用户在别处按键时高亮一闪即逝。
    rec.fire('document', 'keydown', { key: 'Tab' });
    expect(rec.classesOf('audio-workflow'), 'Tab must not clear').toContain('is-focused');

    rec.fire('document', 'keydown', { key: 'Escape' });
    expect(rec.classesOf('audio-workflow'), 'Escape must clear').toEqual([]);
    expect(rec.cardVisible('audio-workflow')).toBe(false);
  });

  it('never makes the nodes focusable, from script or markup (fix round 1)', async () => {
    // 语义整个反过来（Task 13 修复轮 1，评审发现 1/2/4）。原先这条断言 JS 确实
    // 写上了 tabindex/role，理由是"不加键盘用户够不到节点"。那个理由不成立：
    // 整棵 <svg> 是 aria-hidden="true"，往里面加 tabindex 会让键盘用户 Tab 进
    // 六个读屏器念不出名字的停靠点（WCAG 2.1 SC 4.1.2、axe aria-hidden-focus），
    // 而 SVG <g> 又不会把 Enter 合成 click，"role=button"承诺的激活方式不存在。
    // 结构改由 <ol data-flow-list> 静态承担，节点只保留指针/触屏增强。
    const rec = await run();
    for (const id of NODES) {
      expect(rec.attrsOf(id).tabindex, `${id} became a tab stop inside aria-hidden`).toBeUndefined();
      expect(rec.attrsOf(id).role, `${id} claims a button role`).toBeUndefined();
    }
    // 也不能退化成"连指针/触屏都没了"：那是把交互整个删掉，不是修无障碍。
    for (const id of NODES) {
      expect(
        rec.listeners.some((l) => l.el === id && l.type === 'mouseenter'),
        `${id} lost its pointer enhancement`,
      ).toBe(true);
      expect(
        rec.listeners.some((l) => l.el === id && l.type === 'click'),
        `${id} lost its touch enhancement`,
      ).toBe(true);
    }
  });
});

describe('constraint pulse (Task 13)', () => {
  /**
   * 三站的节点及桩 DOM 里 `getBBox()` 给出的盒子（harness: x=300+idx*10,
   * y=120+idx*10, w=200）。索引取自 NODES 顺序：lesson=0、ppt=1、report=5。
   */
  const STOPS = [
    { id: 'lesson-workflow', x: 300, y: 120 },
    { id: 'ppt-workflow', x: 310, y: 130 },
    { id: 'report-workflow', x: 350, y: 170 },
  ];
  const WIDTH = 200;
  // 期望位移按 brief 给的公式算出，写成**字面量**而不是 import CAPSULE 再算一遍：
  // 从同一个常量推期望值的话，改常量会同时改变代码与期望，两者永远相等。
  // x = box.x + WIDTH/2 - 66, y = box.y - 34。
  const EXPECTED = STOPS.map((s) => `translate(${s.x + WIDTH / 2 - 66}, ${s.y - 34})`);

  /**
   * 触发"四拍走完"、启动脉冲，返回**脉冲自己排的**定时器（三站 + 收尾）。
   *
   * 分界的必要性（评审发现 6）：脉冲第三站也是 2800ms，与 `play()` 排的
   * "四拍走完"同值。靠 `find(t => t.delay === 2800)` 取站，永远拿到四拍那个，
   * 第三站从不执行。所以在启动前记下已登记的定时器数量作分界，之后追加的一律
   * 属于脉冲，不去猜 delay 值。
   */
  const beginPulse = (rec: Recorder) => {
    const fourBeats = rec.timers.find((t) => t.delay === 2800);
    expect(fourBeats, 'no timer at BEAT_MS * 4 — the pulse never starts').toBeDefined();
    const mark = rec.timers.length;
    fourBeats!.run();
    // 脉冲排的顺序确定：三站（0 / 1400 / 2800）随后是收尾（4200）。
    return rec.timers.slice(mark);
  };

  it('moves the capsule to each stop exact box, strictly downward', async () => {
    const rec = await run();
    rec.observers[0]!.fire();

    // 胶囊开演前是透明的（静态终态的一部分），到点才亮起。
    expect(rec.attrsOf('capsule').opacity).toBe('0');
    const pulse = beginPulse(rec);
    expect(rec.attrsOf('capsule').opacity, 'the capsule stays invisible').toBe('1');

    expect(pulse, 'the pulse scheduled the wrong number of timers').toHaveLength(4);
    const stopTimers = pulse.slice(0, 3);
    const end = pulse[3]!;

    // 逐站精确比对，不接受"形状对就行"：`translate(0,0)` 或"三站全同一个坐标"
    // 都能通过正则 `translate(n, n)`，却什么都没证明。
    const ys: number[] = [];
    for (const [i, timer] of stopTimers.entries()) {
      expect(timer.delay, `stop ${i} fires at the wrong time`).toBe(i * 1400);
      timer.run();
      const transform = rec.attrsOf('capsule').transform;
      expect(
        transform,
        `stop ${i} (${STOPS[i]!.id}) did not land on its own box`,
      ).toBe(EXPECTED[i]);
      ys.push(Number(transform!.match(/, ([\d.-]+)\)$/)![1]));
    }
    // "约束向下流"这件事本身：三站的 y 严格递增。
    expect(ys[0], 'the capsule does not move downward').toBeLessThan(ys[1]!);
    expect(ys[1], 'the capsule does not move downward').toBeLessThan(ys[2]!);

    // 走完最后一站后收起（`stops.length * CAPSULE_MS` = 4200ms）。
    expect(end.delay, 'the capsule never fades back out').toBe(4200);
    end.run();
    expect(rec.attrsOf('capsule').opacity).toBe('0');
  });

  it('pulses all three stops, each released by its own 400ms timer', async () => {
    // 评审发现 7：原断言只验第一站，`if (i === 0)` 这种"只给第一站闪"的变异
    // 存活。三站逐站验。400ms 的摘除定时器同样用分界法取（启动一个站后新追加
    // 的那批），不与别处可能同值的 delay 混淆。
    const rec = await run();
    rec.observers[0]!.fire();
    const pulse = beginPulse(rec);

    for (const [i, timer] of pulse.slice(0, 3).entries()) {
      const { id } = STOPS[i]!;
      const before = rec.timers.length;
      timer.run();

      expect(rec.classesOf(id), `stop ${i} (${id}) never pulsed`).toContain('is-pulsing');

      const releases = rec.timers.slice(before);
      expect(releases, `stop ${i} (${id}) scheduled no release`).toHaveLength(1);
      expect(releases[0]!.delay, `stop ${i} (${id}) release delay`).toBe(400);
      releases[0]!.run();
      expect(
        rec.classesOf(id),
        `stop ${i} (${id}) keeps pulsing forever`,
      ).not.toContain('is-pulsing');
    }
  });

  it('does not run under prefers-reduced-motion', async () => {
    // 整段演出在 reduced-motion 下不执行，脉冲自然也不该有：它是位移动效。
    const rec = await run({ reducedMotion: true });
    expect(rec.timers).toEqual([]);
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
