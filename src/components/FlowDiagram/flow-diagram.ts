/**
 * 六 skill 关系图的四拍演出（spec §4.1）与悬停交互（spec §4.3）。
 *
 * 设计前提：SVG 在 HTML 里已经是终态。本脚本做的是**先把元素藏起来，再按拍放出来**。
 * 因此脚本失败、被拦截或未加载时，页面自然停在终态——这是想要的结果，不是降级。
 *
 * 本模块是叶子节点（R-2）：不导出任何符号，也没有 export 语句。`play` / `BEAT_MS`
 * 及全部助手函数都留在模块作用域内；Astro 把它当 ES 模块打包，顶层声明不会外泄。
 *
 * Task 13 的 `runConstraintPulse` / `bindHover` 同在本模块内、同样不导出（R-2 的
 * 续用）：T9 的接口块声明"不导出任何供其他模块使用的符号"，本任务的两个新函数
 * 只被本文件的 `init()` 调用。测试经由 `init()` 观察它们的行为，而不是直接调用。
 */

const BEAT_MS = 700;

/** 单次淡入 / 单条连线自绘的时长，与 `play()` 里推算清理时刻共用。 */
const REVEAL_MS = 420;
const DRAW_MS = 600;

function styleOf(el: Element): CSSStyleDeclaration {
  return (el as HTMLElement).style;
}

/**
 * 把元素压到"不可见"初态，返回撤销函数。
 * 撤销后元素回到零内联样式的终态——也就是 Task 8 直接渲染出来的样子。
 */
function hide(elements: Element[]): () => void {
  for (const el of elements) {
    styleOf(el).opacity = '0';
  }
  return () => {
    for (const el of elements) {
      styleOf(el).opacity = '';
    }
  };
}

/**
 * 放出一拍。
 *
 * R-30：初值必须先落地成"变更前样式"，再连同 transition 一起写入终值。
 * 少了这次强制回流，浏览器会把初值、transition、终值合并进同一次样式重算：
 * 要么没有可过渡的起始值（淡入不播），要么起始值自己也被过渡（落下变成抖动）。
 *
 * `restore()` 在 `play()` 之前清空了内联 opacity，终态本身是"可见"的，所以这里
 * 必须自己把 opacity 压回 0，淡入才有起点。调用方为拍 1 预置的 transform 也
 * 因为这次回流而被固定成起始值。
 */
function reveal(el: Element, delayMs: number): void {
  const style = styleOf(el);
  style.opacity = '0';
  // 强制回流：让 opacity 0（及调用方预置的 transform）成为本次样式变动的
  // "变更前样式"。此刻 transition 仍是默认值（时长 0），初值只就位、不会自己动。
  void el.getBoundingClientRect();
  style.transition = `opacity ${REVEAL_MS}ms ease-out ${delayMs}ms, transform ${REVEAL_MS}ms ease-out ${delayMs}ms`;
  style.opacity = '1';
  style.transform = 'none';
}

/**
 * 自绘一条连线（沿路径生长）。
 *
 * 写入顺序与 `reveal()` 必须一致：**先回流、后写 transition**。反过来写的话，
 * 回流这一下就带着 transition 开始把 dashoffset 从 0（终态）过渡到 length，
 * 紧接着的 `= '0'` 又把这场过渡就地反转——两次抵消，线永远停在 0，看起来
 * 和"根本没动画"一模一样。浏览器里实测：错序时 700ms 内 offset 恒为 0；
 * 正序时 345 → 201 → 88 → 15 → 0（R-43）。
 */
function drawEdge(path: SVGPathElement, delayMs: number): void {
  const length = path.getTotalLength();
  path.style.strokeDasharray = `${length}`;
  path.style.strokeDashoffset = `${length}`;
  // 强制回流：让 dashoffset=length 成为"变更前样式"。此刻 transition 仍是
  // 默认值（时长 0），初值只就位、不会自己动。
  void path.getBoundingClientRect();
  path.style.transition = `stroke-dashoffset ${DRAW_MS}ms ease-out ${delayMs}ms`;
  path.style.strokeDashoffset = '0';
}

function play(root: Element): void {
  const edge = (from: string, to: string) =>
    root.querySelector<SVGPathElement>(`[data-edge="${from}->${to}"]`);

  const node = (id: string) => root.querySelector(`[data-flow-node="${id}"]`);
  const input = root.querySelector('[data-flow-input]');

  // 拍 1：输入落下
  if (input) {
    styleOf(input).transform = 'translateY(-24px)';
    reveal(input, 0);
  }

  // 拍 2：一级节点点亮，输入连线自绘
  const lesson = node('lesson-workflow');
  const inputEdge = edge('input', 'lesson-workflow');
  if (inputEdge) drawEdge(inputEdge, BEAT_MS);
  if (lesson) reveal(lesson, BEAT_MS);

  // 拍 3：四条线同时生长，四个二级节点**同时**亮起——视觉上表达"互相独立、按需选用"
  const stage2 = [
    'ppt-workflow',
    'audio-workflow',
    'word-workflow',
    'worksheet-workflow',
  ];
  for (const id of stage2) {
    const e = edge('lesson-workflow', id);
    if (e) drawEdge(e, BEAT_MS * 2);
    const n = node(id);
    if (n) reveal(n, BEAT_MS * 2 + 200);
  }

  // 拍 4：四线收拢汇入课后节点
  for (const id of stage2) {
    const e = edge(id, 'report-workflow');
    if (e) drawEdge(e, BEAT_MS * 3);
  }
  const report = node('report-workflow');
  if (report) reveal(report, BEAT_MS * 3 + 200);

  // 四拍走完（BEAT_MS * 4）之后，约束胶囊沿主干下滑（spec §4.2）。
  // 排在四拍之后而不是同时：胶囊表达的是"约束从上位阶段流向下一阶段"，
  // 图自己都还没搭起来就滑过一遍，读起来是两件无关的事。
  window.setTimeout(() => runConstraintPulse(root), BEAT_MS * 4);

  // 演出结束后清掉内联样式，让 DOM 回到"零内联样式"的静态终态：
  // 后续 hover 交互不受残留 transition 影响，动画后的 DOM 与无 JS 时逐字节一致。
  window.setTimeout(() => {
    for (const el of root.querySelectorAll(
      '[data-flow-node], [data-flow-input], [data-edge]',
    )) {
      const style = styleOf(el);
      style.transition = '';
      style.opacity = '';
      style.transform = '';
      style.strokeDasharray = '';
      style.strokeDashoffset = '';
    }
  }, BEAT_MS * 4 + 800);
}

/** 胶囊在每一站停留的间隔，也是整段脉冲的总时长除数。 */
const CAPSULE_MS = 1400;

/**
 * 约束向下流动的发光胶囊（spec §4.2）。
 *
 * 每站：把胶囊移到该节点正上方居中（`box.x + box.width/2 - 66`，66 是胶囊半宽），
 * 给节点挂上 `.is-pulsing` 让它的描边闪一下，400ms 后摘掉。
 *
 * 用 `getBBox()` 而不是 `getBoundingClientRect()`：前者的坐标系是 SVG 用户单位，
 * 与 `<g transform>` 同一套；后者是 CSS 像素，要再乘一遍缩放比。节点坐标本就是
 * 用户单位，直接相加即可。
 *
 * 胶囊初始 opacity 为 0，本函数开始时才亮起，结束时回到 0——它表达的是过程，
 * 无 JS 时静态帧里不存在这个元素（见 FlowDiagram.astro 的注释）。
 */
function runConstraintPulse(root: Element): void {
  const capsule = root.querySelector<SVGGElement>('[data-flow-capsule]');
  if (!capsule) return;

  const stops = ['lesson-workflow', 'ppt-workflow', 'report-workflow'];
  capsule.setAttribute('opacity', '1');

  stops.forEach((id, i) => {
    window.setTimeout(() => {
      const node = root.querySelector<SVGGElement>(`[data-flow-node="${id}"]`);
      if (!node) return;
      const box = node.getBBox();
      capsule.setAttribute(
        'transform',
        `translate(${box.x + box.width / 2 - 66}, ${box.y - 34})`,
      );
      node.classList.add('is-pulsing');
      window.setTimeout(() => node.classList.remove('is-pulsing'), 400);
    }, i * CAPSULE_MS);
  });

  window.setTimeout(() => capsule.setAttribute('opacity', '0'), stops.length * CAPSULE_MS);
}

/**
 * 悬停 / 聚焦 / 点击节点时的连线与侧卡高亮（spec §4.3）。
 *
 * `tabindex` 与 `role="button"` 在 JS 里加，不写进 SVG 静态标记：无 JS 时这些
 * 节点根本不可交互，标成 `role="button"` 是向屏幕阅读器承诺一个不存在的行为。
 * `tests/build/flow-hooks.test.mjs` 有一条断言守着静态产物里零个
 * `[data-flow-node][role="button"]`。
 *
 * 点击也走同一条 focus：移动端没有 hover，点击是唯一的开卡方式。
 */
function bindHover(root: Element): void {
  const nodes = Array.from(root.querySelectorAll<SVGGElement>('[data-flow-node]'));
  const edges = Array.from(root.querySelectorAll<SVGPathElement>('[data-edge]'));
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-flow-card]'));

  const clear = (): void => {
    nodes.forEach((n) => n.classList.remove('is-dimmed', 'is-focused'));
    edges.forEach((e) => e.classList.remove('is-dimmed', 'is-focused'));
    cards.forEach((c) => {
      c.hidden = true;
    });
  };

  const focus = (id: string): void => {
    nodes.forEach((n) => {
      const self = n.dataset.flowNode === id;
      n.classList.toggle('is-focused', self);
      n.classList.toggle('is-dimmed', !self);
    });
    edges.forEach((e) => {
      const key = e.dataset.edge ?? '';
      const touches = key.startsWith(`${id}->`) || key.endsWith(`->${id}`);
      e.classList.toggle('is-focused', touches);
      e.classList.toggle('is-dimmed', !touches);
    });
    cards.forEach((c) => {
      c.hidden = c.dataset.flowCard !== id;
    });
  };

  for (const node of nodes) {
    const id = node.dataset.flowNode;
    if (!id) continue;
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    node.addEventListener('mouseenter', () => focus(id));
    node.addEventListener('focus', () => focus(id));
    node.addEventListener('click', () => focus(id));
  }

  root.addEventListener('mouseleave', clear);
  root.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') clear();
  });
}

/** SVG 是否真的被渲染（R-31）。`display:none` 子树下 getClientRects 为空。 */
function isRendered(el: Element): boolean {
  const check = (el as Element & { checkVisibility?: () => boolean })
    .checkVisibility;
  return typeof check === 'function'
    ? check.call(el)
    : el.getClientRects().length > 0;
}

function init(): void {
  const root = document.querySelector('[data-flow-diagram]');
  if (!root) return;

  // R-31：SVG 是 `hidden md:block`，md 断点以下整棵子树 display:none。
  // 此时 getTotalLength() 恒为 0，藏起来的元素也不会有机会被放出来，所以整段
  // 演出原地退出——不藏任何东西，也不排任何定时器。（断点只在 Tailwind 那侧
  // 定义，这里靠"是否真的被渲染"判断，不复制断点常量。）
  const svg = root.querySelector('svg');
  if (!svg || !isRendered(svg)) return;

  // 悬停高亮是**信息获取手段**，不是装饰：减少动态效果的用户同样需要它。
  // 所以它在 reduced-motion 的早退分支之前绑定——放到之后，开减少动态效果
  // 的读者悬停任何节点都不会有反应，而那不是"减少动效"，是功能消失。
  //
  // 仍排在 `isRendered` 之后：SVG 是 `hidden md:block`，窄屏下它整棵子树
  // `display:none`，此时给节点加 `tabindex`/`role="button"` 既点不到也读不到，
  // 侧卡本身也是 `hidden md:block`，绑了没有任何一处能触发。
  bindHover(root);

  // spec §8：prefers-reduced-motion 下直接渲染终态，不做任何位移
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // IntersectionObserver 缺席时不藏不演：直接保持静态终态，连 4 秒兜底也不必排。
  if (typeof IntersectionObserver === 'undefined') return;

  const animated = Array.from(
    root.querySelectorAll('[data-flow-node], [data-flow-input]'),
  );
  const restore = hide(animated);

  let started = false;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.disconnect();
        started = true;
        restore();
        // R-30：restore() 清掉内联 opacity 后先强制回流，让"零内联样式的终态"
        // 成为确定的变更前样式，再交给 play() 逐拍压回初值并放出。
        void root.getBoundingClientRect();
        play(root);
      }
    },
    { threshold: 0.35 },
  );

  observer.observe(root);

  // 兜底：若 4 秒内一次都没进入视口，把元素还原成终态，避免内容永远藏着。
  // 演出一旦开始就不再插手——否则这次 restore() 会在某一拍进行到一半时
  // 清掉 opacity，把动画拦腰截断。
  window.setTimeout(() => {
    if (started) return;
    observer.disconnect();
    restore();
  }, 4000);
}

init();
