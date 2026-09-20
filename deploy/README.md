# 部署到 Hetzner

静态站，`dist/` 由服务器上的 Caddy 直接托管，**服务器上不需要 Node 运行时**
（spec §2）。构建在本地或 CI 完成，只把产物 rsync 过去。

---

## 1. 本地构建并过闸门

```bash
rm -rf dist
ASTRO_TELEMETRY_DISABLED=1 npm run build
npm run verify
```

`npm run verify` 是**纯校验脚本**，只读 `dist/`、只依赖 `fast-glob` +
`node-html-parser`（两者在 `dependencies`）。它能在只装了生产依赖的环境里单独跑：

```bash
npm ci --omit=dev   # 或 npm install --omit=dev
npm run verify      # ✓ 26 HTML files verified (25 index pages)
```

退出码 0 才可部署；非 0 会把每条失败连同文件路径打印出来，逐条修**站点**，
不要为了让它变绿去放宽规则。

### `verify` 与 `verify:all` 的分工

| 命令 | 内容 | 需要什么 | 谁跑 |
|---|---|---|---|
| `npm run verify` | 只跑 `scripts/verify-build.mjs`，校验 `dist/` | `fast-glob` + `node-html-parser`（生产依赖即可） | **部署机 / 部署流水线** |
| `npm run verify:all` | `build` + `vitest run` + `verify-build.mjs` 的完整链 | Astro、Tailwind、Vitest（都在 `devDependencies`） | 开发机 / CI |

完整链需要全量安装才能跑（`astro build` 要 `@tailwindcss/vite` 与 `tailwindcss`，
测试要 `vitest`），而部署机往往只装生产依赖，`npm ci --omit=dev` 在读配置阶段
就会因缺少这两个包失败。所以两条命令拆开：**部署机上跑 `verify`，开发/CI 上跑
`verify:all`。**

> `ASTRO_TELEMETRY_DISABLED=1` 不是可有可无的：`astro build` 会尝试写
> `~/Library/Preferences/astro`（macOS）或 `~/.config/astro`（Linux），在受限
> 环境里会以 EPERM 失败。构建脚本已内置该变量，手动敲 `npx astro build` 时要自己带上。

---

## 2. 同步产物到服务器

```bash
rsync -avz --delete dist/ user@<hetzner-host>:/srv/teachflow/dist/
```

`--delete` 会清掉服务器上不再存在的旧文件——`dist/` 是唯一事实源，服务器目录
只作镜像。第一次部署前先确认 `/srv/teachflow/dist/` 存在且可写。

---

## 3. 重载 Caddy

把仓库里的 `deploy/Caddyfile` 放到服务器上的 `/etc/caddy/Caddyfile`（或 include
它），然后：

```bash
SITE_DOMAIN=<域名> caddy reload --config /etc/caddy/Caddyfile
```

首次加载或改语法后用 `caddy validate --config /etc/caddy/Caddyfile` 先验证，
再 `reload`。配置里的 `{$SITE_DOMAIN}` 由该环境变量在启动/重载时注入。

**不得给站点加 `basicauth`（或任何访问控制）。** Stripe 审核员必须能匿名访问；
用 Basic Auth "先不让人看到"是预发布站点最常见的驳回原因（spec §6.1 末行、
§9.3 第一条）。`deploy/Caddyfile` 里已就此留注记。

---

## 4. 域名确定后必改的两处

占位域名 `https://tryteachflow.com` 只允许出现在**两个**文件里：

1. `src/config/site.ts` 的 `SITE.domain`
2. `astro.config.mjs` 的 `site`

两处同步改成真实域名，重新构建（`canonical` / `hreflang` / `og:url` /
`sitemap` 都从这两处取）。**服务器上的 `SITE_DOMAIN` 环境变量也要同步改**——
它决定 Caddy 为哪些 Host 提供 TLS 证书。三处不一致会出现 canonical 指向旧域名
或证书域名不匹配。

`tests/unit/site.test.ts` 有一条守卫会扫描 `src/` 与 `public/`，任何第三个文件
里出现该占位域名都会让它变红。`scripts/verify-build.mjs` 另有一条自扫描，
保证校验脚本自身不硬编码域名。

---

## 5. spec §9.3 部署前清单（逐条）

- [x] **站点公开可访问，无 Basic Auth、无 `noindex`、无 "Coming Soon"** ——
      `npm run verify` 的 `public-access` 检查覆盖（robots.txt 不得 `Disallow: /`、
      每页不得含 `noindex`、不得出现 "coming soon"/"under construction"）。
      无 Basic Auth 这一条由 `deploy/Caddyfile` 的形态保证（配置里没有 `basicauth`）。
- [x] **页脚公司信息与提交给 Stripe 的法律主体逐字一致** ——
      `npm run verify` 的 `entity-details` 检查覆盖四项逐字串。
- [ ] **客服邮箱真实可达并已测试收信** —— **必须人工做。** 脚本只能检查
      `vichajser@gmail.com` 这个字符串出现在页面上，**不能**检查它收得到信。
      发一封测试邮件、确认进收件箱（不是垃圾箱），再确认页脚的 `mailto:` 点开
      预填正确。这一步跳过，Stripe 人工复审会拨回来。
- [x] **价格全站写作 `USD 19.90`** —— `npm run verify` 的 `price-notation`
      检查覆盖（任何 `$19` / `$19.9` / `$19.90` 形态都会被判失败）。

---

## 6. 无法在本地沙箱验证、需在服务器上确认的项

`scripts/verify-build.mjs` 与单测覆盖的是**静态产物**。以下依赖真实服务器行为，
本地（沙箱里**没有 `caddy` 二进制**）验不了，上线前必须在服务器上过一遍。

前两条**不是可选的健全性检查**：`deploy/Caddyfile` 里针对它们的两处改动
（`try_files` 的候选顺序、`handle_errors` 里 `file_server` 的 `status` 子指令）
都只有文档依据，**没有经过任何运行时验证**。这两条 `curl` 是它们唯一的验证出口。

```bash
DOMAIN=<域名>

# 1) 语法与 matcher 合法性——先过这一步再 reload。
caddy validate --config /etc/caddy/Caddyfile

# 2) 无尾斜杠 canonical 必须直接 200，绝不 308 跳到 /en/。
#    （R-13。对应 Caddyfile 的 `try_files {path}/index.html {path} {path}.html`：
#     若候选顺序写回裸 {path} 在前，/en 是真实目录会先在第一个候选命中，
#     file_server 就会发 308 目录规范化跳。）
curl -sI "https://$DOMAIN/en" | head -1        # 必须是 200，不是 308/301

# 3) 未命中路由必须返回真 404，不是软 200，且响应体是对应语言的 404 页。
#    （R-50 后半。对应 handle_errors 里 `file_server { status {err.status_code} }`：
#     少了 status 子指令，rewrite 后的投递会被当成成功，返回 200。）
curl -sI "https://$DOMAIN/en/does-not-exist" | head -1   # 必须是 404，不是 200
curl -s  "https://$DOMAIN/ko/does-not-exist" | grep -q '찾을 수 없' || echo 'ko 404 body wrong'
```

再顺手确认这几条（同样只能在此处验）：

- `curl -sI https://<域名>/` 返回 **302** 到 `/en`（`redir / /en 302`）。
- 未知语言前缀（如 `https://<域名>/fr`）302 到 `/en`（`@unknown_locale`）。
- HTML 页面真的拿到 `Cache-Control: public, max-age=0, must-revalidate`
  （`@html` 用反向排除写成；`curl -sI https://<域名>/en | grep -i cache-control`），
  静态资源拿到 `max-age=31536000, immutable`。
