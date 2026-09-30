# SEO / GEO 落地手册（2026-09-30）

> 逐步操作教程在 `docs/2026-09-30-seo-geo-tutorial.md`（含每一步的界面
> 导航与命令）。本文件是速查版：做什么、为什么、在哪登记。

代码侧改动已全部进仓库（本文件末尾有清单与守卫对照）。剩下的动作发生在
**仓库之外**——站长平台、第三方站点、DNS——每一步都需要站长本人账号，
无法从代码侧代做。

---

## 1. 搜索引擎站长平台（P0，未做 = 前面所有改动白费）

新域名不会被自动收录；三家平台各自注册、各自验证、各自提交 sitemap。
站点验证已预留 meta 注入（`src/config/site.ts` 的 `SITE_VERIFICATION`），
**不需要改任何代码**。验证码拿到后写进仓库根目录 `.env`（Astro 构建时
自动读取，且需长期保留——平台会定期复检）：

```bash
# .env 示例（三行按拿到的填，可分批）：
PUBLIC_SITE_VERIFICATION_GOOGLE=abc123...
PUBLIC_SITE_VERIFICATION_BING=def456...
PUBLIC_SITE_VERIFICATION_NAVER=ghi789...

npm run build   # 之后每次构建都自动带上
```

| 平台 | 入口 | 验证方式 | 提交什么 | 为什么重要 |
|---|---|---|---|---|
| Google Search Console | search.google.com/search-console | HTML 标记（`google-site-verification`） | `https://tryteachflow.com/sitemap-index.xml` | Google 收录 + 全部搜索表现数据 |
| Bing Webmaster | bing.com/webmasters | **直接导入 GSC**（一键）或 `msvalidate.01` | 同上 sitemap | Bing 收录；**ChatGPT 的网页检索走 Bing**，这一步同时服务 GEO |
| Naver Search Advisor | searchadvisor.naver.com | `naver-site-verification` | 同上 sitemap（在"요청/사이트맵"提交） | **韩语市场的第一搜索引擎**。ko 站点做得再好，Naver 不收录就等于韩国教师搜不到 |

三步都完成后，用 `site:tryteachflow.com`（Google / Bing）与 Naver 站内
`site:tryteachflow.com` 复核收录开始出现；GSC 的"网页索引编制"报告会给出
未收录页面的原因。

## 2. AI 引擎（GEO）的站外信号

robots.txt 已显式放行全部主流 AI 爬虫，llms.txt 与 JSON-LD 已上线。但
生成式引擎**引用一个站点的最大权重来自第三方来源**——新域名零外链时，
Perplexity / ChatGPT 几乎不会主动提到 TeachFlow。按投入产出排序：

1. **Product Hunt 发布**：一次发布 = 一个高权重第三方页面描述产品。
   Launch 当天准备好 tagline（i18n 里现成的）与 samples 页截图。
2. **G2 / Capterra 词条**：教育工具采购的检索入口，AI 引擎常引。
   创建厂商词条即可起步，不需要立刻有评论。
3. **Reddit**：r/TEFL、r/EnglishTeachers、r/EdTech 里以"我做了什么、
   怎么用"的口吻参与相关讨论（不是发广告）。AI 引擎对 Reddit 的引用
   权重显著。
4. **韩国侧**：네이버 카페（교사 커뮤니티）、블로그 리뷰。韩语教师在
   Naver 生态里，不在 Reddit 里。

外链纪律与站内一致：不买链接、不做无凭据宣称（`claims.test.mjs` 的
词表在站外同样适用——被 AI 引擎摘录的句子会被当成产品说过的话）。

## 3. CDN（P2，性能，建议尽快）

服务器在 Hetzner（德国），韩语教师访问 TTFB 偏高。上 Cloudflare（免费档够用）：

- DNS 把域名代理（橙云）到源站，Caddy 与 shop-api 全部不动；
- 源站已是纯静态 + 正确的 Cache-Control 头，CF 默认配置即可命中缓存；
- **注意**：`deploy/Caddyfile` 里 `X-Forwarded-For {remote_host}` 的注释
  已预告过这一步——CDN 接入后该行要改为读 Cloudflare 的可信头
  （`CF-Connecting-IP`），否则限流与漏斗日志记到的是 CF 边缘 IP。
  接入 CF 时同时在源站防火墙只放行 CF IP 段，防直连绕过。

## 4. 内容资产（blog）——刻意未做

空博客比没有博客更伤：零文章的 /blog/ 是又一个"未完成页面"。等有
**至少 3 篇真文章**（建议主题：AI 备课工作流、教材单元拆解、听力材料
制作）再上线。届时需要动的集成点（现在都有守卫提示）：

- `deploy/Caddyfile` `@unknown_locale` 清单加 `/blog/*`（清单注释有说明）；
- `astro.config.mjs` 的 `pageSources()` 给 blog 路由补内容集合映射；
- `tests/build/` 新增页面的语言对等断言（照抄 `pages.test.mjs` 的模式）。

## 5. 本次代码侧改动清单

| 改动 | 文件 | 守卫 |
|---|---|---|
| JSON-LD：Organization / WebSite / SoftwareApplication / FAQPage / BreadcrumbList | `src/lib/schema.ts`（唯一出口）+ `BaseLayout.astro` + 各页 | `tests/build/structured-data.test.mjs` |
| llms.txt | `src/pages/llms.txt.ts` | `tests/build/geo.test.mjs` |
| robots.txt AI 爬虫显式放行 | `src/pages/robots.txt.ts` | `tests/build/geo.test.mjs` + `smoke.test.mjs` |
| sitemap lastmod（git 按页注入）+ `/buy/success` 出表 | `astro.config.mjs` | `tests/build/seo.test.mjs` |
| 站长平台验证 meta（env 注入） | `src/config/site.ts` + `SeoHead.astro` | —（构建期注入，验证通过即撤） |
| og:site_name | `SeoHead.astro` | `tests/build/seo.test.mjs` |
| favicon.ico + Caddy 放行 | `public/favicon.ico` + `deploy/Caddyfile` | `tests/build/geo.test.mjs` |
| /skills 可引用导语（两语） | `src/pages/[lang]/skills.astro` + i18n 字典 | `tests/unit/i18n.test.ts`（键对等） |

守卫的边界：`verify-build.mjs` 与全部测试跑在 `dist/` 上，部署后仍只有
`deploy/README.md` §6 的 curl 清单能验证真实服务器行为（已补
`/llms.txt` 与 `/favicon.ico` 两条 200 检查）。
