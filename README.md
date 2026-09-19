# TeachFlow-KR 官网

TeachFlow-KR（面向韩国教师的六技能套装）的营销与合规官网。Astro + Tailwind 纯静态站，
英语/韩语双语，英语为默认语言。成品 `dist/` 由 Hetzner 上的 Caddy 直接托管，
**服务器不需要 Node 运行时**。

- 设计文档：`docs/superpowers/specs/2026-09-18-teachflow-website-design.md`
- 实施计划：`docs/superpowers/plans/2026-09-18-teachflow-website.md`

## 命令

```bash
npm install                          # 安装依赖
npm run dev                          # 本地开发服务器
npm run build                        # 构建到 dist/（已内置 ASTRO_TELEMETRY_DISABLED=1）
npm run verify                       # 校验 dist/——唯一的上线闸门，退出码 0 才可部署
```

`npm run verify` 只读 `dist/`、只依赖生产依赖里的 `fast-glob` + `node-html-parser`，
因此能在没装 devDependencies 的部署机上单独跑。需要 Astro/Tailwind/Vitest 的完整链
是 `npm run verify:all`（= `build` + `test` + `verify-build.mjs`），在开发机与 CI 上跑。
两条命令的分工见 `deploy/README.md`。

改完代码后本地自查：

```bash
rm -rf dist && npm run build && npm run test && npm run verify
```

## 目录结构

```
astro.config.mjs   Astro 配置（site、static 输出、Tailwind 插件、sitemap）
src/
  config/site.ts   站点唯一常量源：域名、公司主体、客服邮箱、价格
  i18n/            双语路由与文案（en.json / ko.json）
  content/         长文内容集合（skills / legal / faq，按语言分目录）
  components/      页头页脚、语言切换、SEO 头、价格块、关系图等
  layouts/         BaseLayout（全站骨架）与 LegalLayout（合规静音版式）
  pages/[lang]/    目录式双语路由；根 index.astro 是跳转壳，404.astro 是语言中立兜底
  styles/          Tailwind 入口与 @font-face（自托管 woff2）
deploy/            Hetzner 上的 Caddyfile 与部署步骤
scripts/           构建校验脚本（部署闸门）
tests/            单元测试（unit/）与对 dist/ 产物的断言（build/）
public/           静态资源（favicon、字体、样例文件）
```

## 需要自行放入的资源

**字体。** `src/styles/fonts.css` 声明了五个自托管 woff2，仓库**不含**二进制；
把它们放进 `public/fonts/`：

```
inter-latin-400.woff2
inter-latin-600.woff2
pretendard-korean-400.woff2
pretendard-korean-600.woff2
jetbrains-mono-400.woff2
```

放之前站点用系统字体栈渲染（`font-display: swap`，构建保持绿色）。缺失时
`npm run verify` 会打印一条**非阻断警告**（`⚠`）提示这些文件不在 `dist/` 里；
woff2 就位后警告自动消失。不得改用 CDN——`/legal/privacy` 向用户承诺了本站不向
任何第三方服务器发起请求（有测试守着）。

**样例文件。** `public/samples/` 的韩语成品由**独立工作流**生成后放入，不在本仓库
构建流程内。未就绪时卡片显示"样例准备中"占位态，不显示坏链。

## 部署

见 `deploy/README.md`。三步：本地 `build` + `verify`、`rsync dist/` 到服务器、
`SITE_DOMAIN=<域名> caddy reload`。域名确定后需同步改 `src/config/site.ts` 与
`astro.config.mjs` 两处（外加服务器上的 `SITE_DOMAIN` 环境变量）。
