/// <reference types="astro/client" />

/**
 * 站点只有一个构建期环境变量。声明在这里，是为了让 `astro check` 在
 * 写错名字时报错——`import.meta.env` 默认是 any，拼错的变量名会静默
 * 变成 undefined，而 `/buy` 对 undefined 的反应恰好是"结账未开放"，
 * 一个看上去完全正常的页面。
 */
interface ImportMetaEnv {
  /** Polar 托管结账页的完整 URL。不设则 /buy 渲染为尚未开放。 */
  readonly PUBLIC_BUY_CTA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
