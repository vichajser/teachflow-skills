/**
 * 站内图标的唯一来源：一组 24×24 的描边路径，随页面内联成 `<svg>`。
 *
 * 为什么是内联 SVG 而不是图标字体或图标库：
 * - `/legal/privacy` 写明本站不发任何第三方请求，图标 CDN 会当场证伪它；
 * - 图标字体要再加一份 woff2（本仓库已有 5 个字体文件缺失的既有问题），
 *   而 `no-js.test.mjs` 禁止首页之外出现 `<script>`，图标库更无从谈起；
 * - 路径直接进 HTML，零额外请求、零额外字节之外的运行时。
 *
 * 视觉语言照抄 `public/favicon.svg`：`fill="none"`、圆头圆角描边、只走线条，
 * 与 spec §5「开发者工具而非教育机构」的调性一致。颜色一律 `currentColor`，
 * 由调用方用一个 `text-*` 类给——spec §5.1 明确允许霓虹色用于
 * 「描边、连线、辉光与小面积图标」，图标正是被点名的那一类，禁的是正文。
 *
 * 每个图标只用 `<path>`（不用 `<circle>`/`<rect>`）：单一元素类型让
 * `Icon.astro` 的渲染退化成一次 map，也省掉一套属性分支。需要圆点时用
 * 零长度路径 + `stroke-linecap="round"`（如 `cart` 的两个轮子）。
 */
export const ICON_PATHS = {
  /* —— 六个 skill，与 `SKILLS` 的 id 一一对应 —— */

  /** lesson-workflow：教材原件 + 차시 分割线。流程的源头。 */
  'lesson-workflow': [
    'M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M14 3v4h4',
    'M9 13h6',
    'M9 17h4',
  ],
  /** ppt-workflow：投影幕 + 支架。 */
  'ppt-workflow': ['M3 5h18v11H3z', 'M12 16v4', 'M8 20h8'],
  /** audio-workflow：波形。 */
  'audio-workflow': ['M4 10v4', 'M8 7v10', 'M12 4v16', 'M16 7v10', 'M20 10v4'],
  /** word-workflow：带表头与列分隔的表格。 */
  'word-workflow': ['M3 5h18v14H3z', 'M3 10h18', 'M9 10v9'],
  /** worksheet-workflow：逐级变短的三条线 —— 수준별（分层）学习지。 */
  'worksheet-workflow': ['M5 3h14v18H5z', 'M9 8h6', 'M9 12h4', 'M9 16h2'],
  /** report-workflow：图片框（家长通知书交付为 .png）。 */
  'report-workflow': ['M3 5h18v14H3z', 'M3 16l5-5 4 4 3-3 6 6'],

  /* —— /security 的两条可验证事实 —— */

  /** 盾 + 勾：32 个 Markdown 文件里没有可执行代码。 */
  'shield-check': [
    'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    'M9 12l2 2 4-4',
  ],
  /** 云 + 斜杠：全程离线，不外发数据。 */
  'cloud-off': [
    'M7.5 18h9a3.5 3.5 0 0 0 .4-7 5.5 5.5 0 0 0-9.3-2.4',
    'M6.2 10.2A4 4 0 0 0 7.5 18',
    'M3 3l18 18',
  ],

  /* —— /docs —— */

  /** 文件夹：六个 skill 目录该放的位置。 */
  folder: ['M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z'],
  /** 终端：确认加载的那条命令。 */
  terminal: ['M3 5h18v14H3z', 'M7 10l2.5 2.5L7 15', 'M13 15h4'],

  /* —— 首页分节标题 —— */

  /** 九宫格：六个 skill 一览。 */
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  /** 叠层：成品预览。 */
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'],
  /** 锁：本地运行与隐私。 */
  lock: ['M6 11h12v9H6z', 'M9 11V8a3 3 0 0 1 6 0v3'],
  /** 购物车：购买。两个轮子是零长度路径，靠 round linecap 成为圆点。 */
  cart: ['M3 5h2l2.6 9.5h9.8L20 8H6.2', 'M10 19h.01', 'M17 19h.01'],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICON_PATHS;
