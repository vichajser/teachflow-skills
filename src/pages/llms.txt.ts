import type { APIRoute } from 'astro';
import { SITE } from '@/config/site';
import en from '@/i18n/en.json';

/**
 * llms.txt（llmstxt.org 约定）：给生成式引擎的站点概览，一份 Markdown、
 * 绝对链接、无 HTML。与 robots.txt 同款的路由而非 public/ 静态文件——
 * 文案与链接从 SITE / en.json 取，不出现第二处真相。
 *
 * 只写英文：消费方是 AI 爬虫，不是读者；韩文版页面在文末按语言分区列出。
 * 措辞纪律与 claims.test.mjs 同源——不做无凭据的宣称，不写价格数字
 * （verify-build 的金额扫描只看 *.html，但纪律不因文件后缀而改变）。
 */
export const GET: APIRoute = () => {
  const u = (path: string) => `${SITE.domain}${path}`;

  const body = `# TeachFlow

> ${en['site.tagline']}

${en['home.metaDescription']}

TeachFlow is a one-time-purchase bundle of six agent skills for English teachers.
The skills run inside an AI coding agent (Claude Code, Codex CLI, Cursor or
Google Gemini CLI) on the teacher's own computer. There is no subscription, no
account and no cloud service: each skill is a folder of plain-text instruction
files, and the teaching material stays on the machine it is processed on.

## Pages

- [Skills](${u('/en/skills')}): what each of the six skills is and what it produces
- [Samples](${u('/en/samples')}): real output files generated from one textbook unit
- [Install](${u('/en/install')}): click-only install in Finder or File Explorer, no terminal
- [Docs](${u('/en/docs')}): putting the six skills in place and preparing a first unit
- [FAQ](${u('/en/faq')}): what the skills need to run and how material is handled
- [Security & privacy](${u('/en/security')}): how teaching material is processed locally
- [Buy](${u('/en/buy')}): one payment for the complete bundle of six skills
- [Terms](${u('/en/legal/terms')}) / [Privacy](${u('/en/legal/privacy')}) / [Refund](${u('/en/legal/refund')}) / [Delivery](${u('/en/legal/delivery')})

## Korean

Every page above also exists in Korean under the /ko/ prefix:
${u('/ko')} · ${u('/ko/skills')} · ${u('/ko/samples')} · ${u('/ko/install')} · ${u('/ko/docs')} · ${u('/ko/faq')} · ${u('/ko/security')} · ${u('/ko/buy')}

Support: ${SITE.supportEmail} (${SITE.companyName}, registered in ${SITE.registeredIn})
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
