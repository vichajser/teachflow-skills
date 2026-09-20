# 样例产物的渲染源

`public/samples/` 下五张预览图，每张对应此目录里同名的 HTML。改样例先改这里的
HTML，再重渲染成 PNG，两边不要各自漂移。

## 内容来自哪里

内容由 `TeachFlow-KR/` 下对应的 skill 自身产出：`ppt-workflow`、`audio-workflow`、
`word-workflow`、`worksheet-workflow`、`report-workflow`，教材单元统一取
Unit 7 "Smart Life" 3/6차시。姓名与校名全部是占位（지호、민수、학생 A/B、
○○초등학교）——spec §7.4 禁止样例里出现任何真实学生或学校名称。

## 硬约束

- **零外部引用。** 五个文件里没有一处 `http(s)://`、`@import`、`url(`、
  外链 `src=`：CSS 全部内联，字体走系统栈。这不是洁癖——`/legal/privacy` 向
  买家承诺 "no third-party requests"，而这些 HTML 是样例图的来源，一旦引入
  远程字体或图片，渲染出的 PNG 就可能把第三方内容烘进站点资产里。
- **不编造数字。** 图里出现的数字只能是课时本身固有的（页码、차시、题量、
  分值）。任何"节省 N 分钟""准确率 N%"之类衡量产品表现的数字都不许写。

## 重新渲染

当前这批 PNG 是用浏览器打开本地 `file://` 页面、以 2x DPR 截图得到的
（渲染后再压成 192 色调色板 PNG 以控体积）。**没有留下一条可直接复跑的 shell
命令**：本机沙箱禁止写 Chrome 在 Darwin 上需要的临时 socket 目录，CLI 版
headless Chrome 因此起不来，当时走的是浏览器自动化通道。谁要重渲染，需要自备
一条浏览器自动化路径；输出尺寸对齐现有文件即可（见 `public/samples/`）。

家长通知书按 2x A4 出图（1588×2246），与 `report-workflow` 的版式规格一致；
另外四张统一 2400px 宽。

## 一处有意偏离

`report-workflow/references/poster-design.md` 规定家长通知书用暖米色/鼠尾草
配色并明确禁用藏青。这里用的是站点深色配色，因为这些是**官网样例图**，不是
今天就要打印给家长的文书；版式、六段顺序、8–10 条双语词汇表、第四节手写留白
都严格照 skill 执行。真要出可打印版本，配色需换回 skill 规定的那套。
