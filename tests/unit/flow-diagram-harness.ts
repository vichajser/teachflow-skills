/**
 * 驱动 `flow-diagram.ts` 的极简 stub DOM。
 *
 * 为什么手写而不是装 jsdom：本沙箱的 npm registry 返回 403，装不了依赖。
 * 而且这里要断言的不是渲染结果，是**写入顺序与守卫分支**——每一次样式赋值、
 * 每一次强制回流、每一个定时器都要按序记下来，stub 反而比真 DOM 更好查。
 *
 * 被测模块是叶子模块（R-2，零导出），在 import 时就执行 init()。所以每个场景
 * 必须先 `vi.resetModules()` 再 `await import(...)`，让 init() 重跑一次。
 */

export interface Write {
  el: string;
  prop: string;
  value: string;
}

export interface Recorder {
  writes: Write[];
  reflows: string[];
  timers: { delay: number; run: () => void }[];
  observers: { threshold: number; disconnected: boolean; fire: () => void }[];
  /** 某元素上某属性的全部赋值，按发生顺序 */
  valuesOf(el: string, prop: string): string[];
  /** 事件流里的序号，用来断言"回流发生在初值与终值之间" */
  indexOf(el: string, prop: string, value: string): number;
  reflowIndex(el: string): number;
}

interface StubEl {
  label: string;
  attrs: Record<string, string>;
  tag: string;
  style: Record<string, string>;
  children: StubEl[];
}

const NODE_IDS = [
  'lesson-workflow',
  'ppt-workflow',
  'audio-workflow',
  'word-workflow',
  'worksheet-workflow',
  'report-workflow',
];

const EDGES = [
  'input->lesson-workflow',
  'lesson-workflow->ppt-workflow',
  'lesson-workflow->audio-workflow',
  'lesson-workflow->word-workflow',
  'lesson-workflow->worksheet-workflow',
  'ppt-workflow->report-workflow',
  'audio-workflow->report-workflow',
  'word-workflow->report-workflow',
  'worksheet-workflow->report-workflow',
];

export interface Options {
  /** SVG 是否真的被渲染（R-31）。false 模拟 md 断点以下的 display:none */
  svgRendered?: boolean;
  /** 浏览器是否提供 checkVisibility；false 走 getClientRects 回退路径 */
  hasCheckVisibility?: boolean;
  reducedMotion?: boolean;
  hasIntersectionObserver?: boolean;
  /** 省略 data-flow-input，检验稀疏 DOM 下不抛异常 */
  omitInput?: boolean;
}

/** 装好全局 document / window / IntersectionObserver，返回记录器 */
export function install(options: Options = {}): Recorder {
  const {
    svgRendered = true,
    hasCheckVisibility = true,
    reducedMotion = false,
    hasIntersectionObserver = true,
    omitInput = false,
  } = options;

  // 回流点用"此刻已发生多少次写入"定位，便于和 indexOf 的序号直接比较先后
  const reflowAt = new Map<string, number>();

  const rec: Recorder = {
    writes: [],
    reflows: [],
    timers: [],
    observers: [],
    valuesOf(el, prop) {
      return rec.writes.filter((w) => w.el === el && w.prop === prop).map((w) => w.value);
    },
    indexOf(el, prop, value) {
      return rec.writes.findIndex(
        (w) => w.el === el && w.prop === prop && w.value === value,
      );
    },
    reflowIndex(el) {
      return reflowAt.get(el) ?? -1;
    },
  };

  const make = (label: string, tag: string, attrs: Record<string, string>): StubEl => {
    const el: StubEl = { label, tag, attrs, style: {}, children: [] };
    const proxy = new Proxy(el.style, {
      set(target, prop: string, value: string) {
        target[prop] = value;
        rec.writes.push({ el: label, prop, value });
        return true;
      },
    });
    el.style = proxy;
    return el;
  };

  const svg = make('svg', 'svg', {});
  if (!omitInput) svg.children.push(make('input', 'g', { 'data-flow-input': '' }));
  for (const id of NODE_IDS) {
    svg.children.push(make(id, 'g', { 'data-flow-node': id }));
  }
  for (const key of EDGES) {
    svg.children.push(make(key, 'path', { 'data-edge': key }));
  }

  const root = make('root', 'figure', { 'data-flow-diagram': '' });
  root.children.push(svg);

  const all = (el: StubEl): StubEl[] => [el, ...el.children.flatMap(all)];

  const matches = (el: StubEl, selector: string): boolean =>
    selector
      .split(',')
      .map((s) => s.trim())
      .some((s) => {
        if (s === 'svg') return el.tag === 'svg';
        const m = s.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/);
        if (!m) throw new Error(`stub DOM cannot parse selector: ${s}`);
        const [, name, value] = m;
        if (!(name! in el.attrs)) return false;
        return value === undefined || el.attrs[name!] === value;
      });

  const decorate = (el: StubEl, insideSvg: boolean) => {
    const host = el as unknown as Record<string, unknown>;
    host.getBoundingClientRect = () => {
      rec.reflows.push(el.label);
      reflowAt.set(el.label, rec.writes.length);
      return { x: 0, y: 0, width: 10, height: 10 };
    };
    // 可见性必须逐元素回答，不能全局一个答案：真实 DOM 里 <figure> 永远渲染，
    // 只有 `hidden md:block` 的 <svg> 子树在 md 以下 display:none。全局一个答案
    // 的话，把守卫从 svg 挪到 root 的变异测不出来——而那正是 R-31 的要害。
    const rendered = () => (insideSvg ? svgRendered : true);
    host.getClientRects = () => (rendered() ? [{}] : []);
    if (hasCheckVisibility) host.checkVisibility = () => rendered();
    host.getTotalLength = () => 123.45;
    host.querySelector = (sel: string) =>
      all(el).slice(1).find((c) => matches(c, sel)) ?? null;
    host.querySelectorAll = (sel: string) =>
      all(el).slice(1).filter((c) => matches(c, sel));
  };
  decorate(root, false);
  for (const el of all(svg)) decorate(el, true);

  const g = globalThis as unknown as Record<string, unknown>;

  g.document = {
    querySelector: (sel: string) =>
      matches(root, sel) ? root : (root as unknown as { querySelector(s: string): unknown }).querySelector(sel),
  };

  g.window = {
    matchMedia: (query: string) => ({
      matches: /prefers-reduced-motion/.test(query) ? reducedMotion : false,
    }),
    setTimeout: (run: () => void, delay: number) => {
      rec.timers.push({ delay, run });
      return rec.timers.length;
    },
  };

  if (hasIntersectionObserver) {
    g.IntersectionObserver = class {
      constructor(
        private cb: (entries: { isIntersecting: boolean }[]) => void,
        private opts: { threshold: number },
      ) {
        rec.observers.push({
          threshold: opts.threshold,
          disconnected: false,
          fire: () => this.cb([{ isIntersecting: true }]),
        });
      }
      observe() {}
      disconnect() {
        const own = rec.observers[rec.observers.length - 1];
        if (own) own.disconnected = true;
      }
    };
  } else {
    delete g.IntersectionObserver;
  }

  return rec;
}

export function uninstall(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.document;
  delete g.window;
  delete g.IntersectionObserver;
}

export const NODES = NODE_IDS;
export const EDGE_KEYS = EDGES;
