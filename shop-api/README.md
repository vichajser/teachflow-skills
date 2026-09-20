# shop-api

TeachFlow 的发行系统：发版、履约、下载、更新分发。

站点本身是纯静态的（Astro 构建出 `dist/`，Caddy 直接托管）。这个服务是站点
旁边的一小块动态部分，Caddy 把 `/api/*` 与 `/download*` 反代给它。

它做四件事：

1. **发版** —— 你把一个 skill 的 zip 传上来，它校验、落盘、登记版本、排两个
   后台任务（推一份到 R2 归档、给已购买的人发更新通知）。
2. **履约** —— 收 Polar 的 webhook，按邮箱登记权益，发出第一封带下载链接的信。
3. **下载** —— 凭签名 token 发母版 zip，每次下载记一笔。
4. **重发链接** —— 买家自己输邮箱就能重新拿到链接，不需要账号，也不需要找人工。

---

## 为什么没有构建步骤

Node 22.18 起可以直接运行 `.ts`（类型标注在运行时被剥掉）。所以这里没有
`tsc`、没有打包器、没有 `dist/`：`node src/server.ts` 就是生产启动命令。

代价是几条必须守住的写法，破坏它们会在**运行时**而不是构建时爆：

- 模块导入必须写全扩展名：`./config.ts`，不是 `./config`。
- 不能用 `enum`、`namespace`、构造函数参数属性（`constructor(private x: T)`）——
  这些是需要生成代码的 TypeScript 特性，剥类型标注剥不掉。
- 类型只能用 `import type` 引入。

## 依赖

生产依赖只有两个：`pg`（数据库驱动）与 `pg-boss`（任务队列）。

其余全部用 Node 内置能力实现：HTTP 用 `node:http` 加一个几十行的路由表，
JWT 与 S3 SigV4 签名用 `node:crypto`，读写 zip 用 `node:zlib` 的裸 deflate，
调 R2 与 Resend 用内置 `fetch`。这不是为了炫技——少一个依赖就少一个在发版
当天装不上、或者某天被撤包的东西，而发版是出了事最需要能跑的那条路径。

> **本机未验证的部分。** 写这套代码的沙箱里 npm 镜像取不到 `pg-boss`，所以
> `src/server.ts`、`src/worker.ts`、`src/jobs/queue.ts` 三个文件**从未真正运行
> 过**，只做了 `node --check` 的语法检查。其余模块有 289 个单元测试覆盖，全绿。
> 第一次在服务器上 `npm install` 之后，请按下面「上线自检」一节逐条跑一遍。

---

## 本地跑起来

```bash
cd shop-api
npm install
cp .env.example .env    # 按里面的注释逐项填
```

`.env` 不会被自动读取（进程只认真实环境变量）。本地跑用：

```bash
set -a; source .env; set +a
npm run migrate   # 建表 + 登记六个 skill id，可重复执行
npm start         # 监听 127.0.0.1:8787
```

后台进程另开一个终端：

```bash
set -a; source .env; set +a
npm run worker
```

测试不需要数据库，也不需要任何环境变量：

```bash
npx vitest run --config vitest.config.ts
```

（在仓库根目录跑 `npm test` **不会**跑到这些用例——根 vitest 配置只收
`tests/**`。根目录另有 `npm run verify:api` 指向这里。）

---

## 环境变量

完整清单、每一项的含义与取得方式，都写在 [`.env.example`](.env.example) 的注释里。
校验规则在 [`src/config.ts`](src/config.ts)：缺项会在启动时**一次列出全部缺失
项**然后退出，不会带着半份配置跑起来。

密钥只从环境变量读，不写进数据库、不打进日志。日志里邮箱只留域名部分，
webhook 正文入库但从不打印。

---

## 接口

| 方法 | 路径 | 鉴权 | 用途 |
|---|---|---|---|
| GET | `/api/health` | 无 | 存活探测：库连得上、R2 通得到 |
| POST | `/api/admin/releases` | Bearer | 发一个新版本（multipart 上传 zip） |
| GET | `/api/admin/releases` | Bearer | 列出已发版本，核对用 |
| POST | `/api/webhooks/polar` | 签名 | 收结算事件，登记权益、发货 |
| POST | `/api/orders/resend-link` | 无（限流） | 重发下载链接，恒定回 202 |
| GET | `/download` | query token | 买家看到的下载页 |
| GET | `/api/download/:skillId` | query token | 真正的文件流 |

错误响应统一是 `{ "error": { "code": ..., "message": ... } }`。

`/api/orders/resend-link` 无论邮箱存不存在都回 202、都不透露任何信息——否则
这个接口就成了一个「谁买过」的查询器。

---

## 发一个版本

打包与发版是两步，分别由两个脚本完成（都只用 Python 标准库）：

```bash
python3 ../tools/package.py --skill lesson-workflow          # 产出 zip
export API_BASE=https://tryteachflow.com
export ADMIN_TOKEN=...
python3 ../tools/publish.py \
    --skill lesson-workflow \
    --version 1.2.0 \
    --zip dist/lesson-workflow.zip \
    --changelog-en "Worksheet answer keys now ship with every lesson." \
    --changelog-ko "이제 모든 수업에 정답지가 함께 제공됩니다."
```

服务端在一个事务里校验 zip、落盘、写 `releases` 行；事务提交之后才排队。
顺序是刻意的：排队在事务里的话，任务可能在数据还没可见时就被 worker 取走。

changelog 的两种语言都要给——更新通知按买家的语言选一份发出去，缺一种就会
有一批人收到空白正文。

---

## 上线自检

第一次部署、以及每次改动 `server.ts` / `worker.ts` / `queue.ts` 之后跑一遍：

```bash
# 1. 进程起来了，库和 R2 都通
curl -s https://tryteachflow.com/api/health

# 2. 反代没有被语言重定向吃掉（回 200，不是 302 到 /en）
curl -sI https://tryteachflow.com/api/health | head -1

# 3. 鉴权确实在拦（回 401）
curl -sI https://tryteachflow.com/api/admin/releases | head -1

# 4. 后台进程活着，两个定时任务已登记
sudo journalctl -u shop-api-worker -n 20
# 期望看到 "[worker] 已就绪"

# 5. 发一个版本，然后确认归档与通知两个任务都跑完了
sudo journalctl -u shop-api-worker -n 50 | grep -E '\[archive\]|\[notify\]'
```

第 4、5 条是重点：worker 在开发机上从未运行过，`pg-boss` 的行为是照文档写的。

## 部署

两个 systemd unit 在 [`../deploy/`](../deploy/)：`shop-api.service` 与
`shop-api-worker.service`。反代配置在 [`../deploy/Caddyfile`](../deploy/Caddyfile)
的 `@shop` 一节。完整步骤见 [`../deploy/README.md`](../deploy/README.md)。

**worker 只能有一份。** 更新通知是「查名单 → 逐封发 → 发一封记一笔」，两份
同时跑会让同一个买家收到两封信。
