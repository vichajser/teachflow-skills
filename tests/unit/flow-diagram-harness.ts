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

  // —— Task 13 的悬停交互（`bindHover`）观察面 ——
  // 刻意与 `writes`/`timers` 分开：`bindHover` 不动内联样式也不排定时器，
  // 若把它的事件注册混进那两个数组，Task 9 那批"reduced-motion 下零写入零
  // 定时器"的断言就会被无关噪声污染。
  /** 每一次 addEventListener，按注册顺序 */
  listeners: { el: string; type: string }[];
  /** 某元素当前的类集合，按字母序 */
  classesOf(el: string): string[];
  /** 侧卡当前是否可见（`hidden === false`） */
  cardVisible(id: string): boolean;
  /** 逐个调用某元素上某类型的监听器，返回被调用的个数 */
  fire(el: string, type: string, event?: unknown): number;
  /** 元素当前的全部属性 */
  attrsOf(el: string): Record<string, string>;
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

  // 类、属性、监听器、侧卡可见性都挂在 label 上。类用 Set 而不是拼接串，
  // `classList.toggle(x, false)` 的幂等与 `remove` 的缺失都不需要单独建模。
  const classes = new Map<string, Set<string>>();
  const listeners = new Map<string, { type: string; fn: (e: unknown) => void }[]>();
  const cards = new Map<string, { hidden: boolean }>();

  const rec: Recorder = {
    writes: [],
    reflows: [],
    timers: [],
    observers: [],
    listeners: [],
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
    classesOf(el) {
      return [...(classes.get(el) ?? [])].sort();
    },
    cardVisible(id) {
      const card = cards.get(id);
      if (!card) throw new Error(`no card for ${id}`);
      return !card.hidden;
    },
    attrsOf(el) {
      return { ...(attrsOf.get(el) ?? {}) };
    },
    fire(el, type, event) {
      const own = (listeners.get(el) ?? []).filter((l) => l.type === type);
      for (const l of own) l.fn(event);
      return own.length;
    },
  };

  // 每个 label 的"当前属性"副本，供 `attrsOf` 读取 setAttribute 的结果
  const attrsOf = new Map<string, Record<string, string>>();

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
    attrsOf.set(label, { ...attrs });
    classes.set(label, new Set());
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
  // opacity="0" 是静态标记自带的初值（无 JS 时胶囊不可见），桩里照抄：
  // 缺了它，"开演前是透明的"这条断言在桩上永远拿不到 '0'。
  svg.children.push(
    make('capsule', 'g', { 'data-flow-capsule': '', opacity: '0' }),
  );

  const root = make('root', 'figure', { 'data-flow-diagram': '' });
  root.children.push(svg);

  // 侧卡在真实产物里是 root 的子元素、SVG 之外（md 以下 SVG 整棵 display:none，
  // 卡必须在它外面才点得到）。桩 DOM 照此摆放，否则 `bindHover` 的
  // `root.querySelectorAll('[data-flow-card]')` 一张都找不到。
  for (const id of NODE_IDS) {
    const card = make(`card:${id}`, 'article', { 'data-flow-card': id });
    cards.set(id, { hidden: true });
    root.children.push(card);
  }

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

    // —— Task 13：真实的 SVG 元素有这些成员，跨过去的都是它们 ——
    // `dataset` 由 `data-*` 属性派生，与浏览器同一套命名转换（`data-flow-node`
    // → `flowNode`）。写成静态对象会让 `n.dataset.flowNode` 恒为 undefined，
    // 于是 `bindHover` 在第一个节点就 `continue`，而所有断言仍然绿。
    host.dataset = new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          const attr = `data-${prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
          return el.attrs[attr];
        },
      },
    );

    host.setAttribute = (name: string, value: string) => {
      el.attrs[name] = value;
      const own = attrsOf.get(el.label);
      if (own) own[name] = value;
    };
    host.getAttribute = (name: string) => el.attrs[name] ?? null;

    host.classList = {
      add: (name: string) => classes.get(el.label)!.add(name),
      remove: (...names: string[]) =>
        names.forEach((n) => classes.get(el.label)!.delete(n)),
      toggle: (name: string, force?: boolean) => {
        const set = classes.get(el.label)!;
        const on = force ?? !set.has(name);
        if (on) set.add(name);
        else set.delete(name);
        return on;
      },
      contains: (name: string) => classes.get(el.label)!.has(name),
    };

    host.addEventListener = (type: string, fn: (e: unknown) => void) => {
      const list = listeners.get(el.label) ?? [];
      list.push({ type, fn });
      listeners.set(el.label, list);
      rec.listeners.push({ el: el.label, type });
    };

    // 用户单位坐标，与 <g transform> 同一套；节点盒子的真实值在这份桩里
    // 不重要，重要的是"每个节点拿到的是自己的盒子"，所以按索引给不同值。
    const nodeIndex = NODE_IDS.indexOf(el.label);
    host.getBBox = () => ({
      x: 300 + (nodeIndex < 0 ? 0 : nodeIndex) * 10,
      y: 120 + (nodeIndex < 0 ? 0 : nodeIndex) * 10,
      width: 200,
      height: 88,
    });

    // 侧卡的 `hidden` 是 `bindHover` 唯一的输出通道，必须可读可写。
    if (el.label.startsWith('card:')) {
      const id = el.label.slice('card:'.length);
      Object.defineProperty(el, 'hidden', {
        get: () => cards.get(id)!.hidden,
        set: (v: boolean) => {
          cards.get(id)!.hidden = v;
        },
      });
    }
  };

  // 每个元素都要装饰：侧卡虽然在 SVG 之外，`bindHover` 照样要读 `dataset`、
  // 写 `hidden`。漏掉它们的话 `c.dataset.flowCard` 直接抛 TypeError，而
  // 报错位置在 bindHover 内部，看起来像源码坏了。
  const inSvg = new Set(all(svg));
  decorate(root, false);
  for (const el of all(root)) {
    if (el === root) continue;
    decorate(el, inSvg.has(el));
  }

  const g = globalThis as unknown as Record<string, unknown>;

  g.document = {
    querySelector: (sel: string) =>
      matches(root, sel) ? root : (root as unknown as { querySelector(s: string): unknown }).querySelector(sel),
    // 裁决 8 之后 Escape 监听器挂在 `document` 上（鼠标打开高亮时焦点在
    // `<body>`，keydown 冒泡不到 `figure`）。桩里给 document 一个与元素同构的
    // 注册入口，label 固定 `'document'`，测试便能用 `rec.fire('document', …)`
    // 触发它——否则那条监听器在桩上永远不可达，Escape 行为无从断言。
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      const list = listeners.get('document') ?? [];
      list.push({ type, fn });
      listeners.set('document', list);
      rec.listeners.push({ el: 'document', type });
    },
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
