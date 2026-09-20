import { BRAND } from '../brand.ts';
import type { Lang } from '../lib/legal.ts';

// 下载页是站点上唯一一张服务端渲染的页面。样式内联、零脚本、零外部资源：
// 它必须在买家收到邮件的那一刻能打开，而不是等站点这一次构建的 hash
// 文件名还在不在。配色抄自 src/styles/global.css，抄的是值不是引用——
// 站点改色时这里不会自动跟上，但也不会因为站点重建而突然裸奔。

const PALETTE = {
  void: '#070B16',
  surface: '#0E1626',
  raised: '#16203A',
  border: '#1F2C4A',
  accent: '#2E7DFF',
  glow: '#22D3EE',
  hi: '#F2F6FF',
  body: '#C3CFE4',
  mute: '#7C8AA6',
} as const;

const CSS = `
*{box-sizing:border-box}
body{margin:0;padding:2.5rem 1.25rem;background:${PALETTE.void};color:${PALETTE.body};
font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue","Apple SD Gothic Neo","Noto Sans KR",sans-serif;
font-size:16px;line-height:1.6}
main{max-width:46rem;margin:0 auto}
h1{margin:0 0 .5rem;font-size:1.5rem;color:${PALETTE.hi};font-weight:600;letter-spacing:-.01em}
h2{margin:0 0 .25rem;font-size:1.05rem;color:${PALETTE.hi};font-weight:600}
p{margin:0 0 1rem}
a{color:${PALETTE.glow}}
.meta{color:${PALETTE.mute};font-size:.875rem;margin-bottom:2rem}
.item{background:${PALETTE.surface};border:1px solid ${PALETTE.border};border-radius:10px;
padding:1.25rem;margin-bottom:1rem}
.ver{color:${PALETTE.mute};font-size:.875rem;font-weight:400}
.log{margin:.5rem 0 1rem;white-space:pre-wrap}
.hash{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.75rem;
color:${PALETTE.mute};word-break:break-all;margin:.75rem 0 0}
.get{display:inline-block;padding:.5rem 1rem;border-radius:6px;background:${PALETTE.accent};
color:${PALETTE.hi};text-decoration:none;font-weight:600;font-size:.9375rem}
.note{background:${PALETTE.raised};border:1px solid ${PALETTE.border};border-radius:10px;
padding:1.25rem;margin:2rem 0 0;font-size:.9375rem}
footer{margin-top:2rem;padding-top:1.25rem;border-top:1px solid ${PALETTE.border};
color:${PALETTE.mute};font-size:.8125rem}
`.trim();

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 只给到日，不给时分：买家关心的是「哪天之前」，精确到秒只会让人算时区。 */
function day(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function kib(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

function shell(lang: Lang, title: string, inner: string): string {
  return [
    '<!doctype html>',
    `<html lang="${lang}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${CSS}</style>`,
    '</head>',
    '<body>',
    '<main>',
    inner,
    '<footer>',
    `<p>${escapeHtml(BRAND.companyName)} · Registered in ${escapeHtml(BRAND.registeredIn)} · Company No. ${escapeHtml(BRAND.companyNumber)}<br>`,
    `<a href="mailto:${BRAND.supportEmail}">${BRAND.supportEmail}</a></p>`,
    '</footer>',
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');
}

export interface DownloadItem {
  skillId: string;
  version: string;
  sizeBytes: number;
  sha256: string;
  changelog: string;
  href: string;
}

export interface PageArgs {
  lang: Lang;
  orderId: string;
  expiresAt: Date;
  items: readonly DownloadItem[];
}

const PAGE = {
  en: {
    title: 'Your TeachFlow downloads',
    heading: 'Your TeachFlow downloads',
    meta: (a: PageArgs) => `Order ${a.orderId}. This page works until ${day(a.expiresAt)}.`,
    get: 'Download',
    noteHead: 'About these files',
    note: (a: PageArgs) =>
      [
        `Every file carries your email address and order number. The licence is ${BRAND.licenceId}: licensed to the named holder only, and not for redistribution or resale.`,
        `When a skill is updated we email you and this same page gives you the new version at no further cost.`,
        `If this page has stopped working, email ${BRAND.supportEmail} and we will send a new link.`,
      ].map((t) => `<p>${escapeHtml(t)}</p>`).join('\n'),
  },
  ko: {
    title: 'TeachFlow 다운로드',
    heading: 'TeachFlow 다운로드',
    meta: (a: PageArgs) => `주문번호 ${a.orderId}. 이 페이지는 ${day(a.expiresAt)}까지 유효합니다.`,
    get: '내려받기',
    noteHead: '파일 안내',
    note: (a: PageArgs) =>
      [
        `내려받으시는 모든 파일에는 구매하신 이메일 주소와 주문번호가 기록됩니다. 라이선스는 ${BRAND.licenceId}이며, 기재된 보유자 본인에게만 허용됩니다. 재배포와 재판매는 허용되지 않습니다.`,
        '스킬이 갱신되면 메일로 알려 드리며, 같은 페이지에서 추가 비용 없이 새 버전을 받으실 수 있습니다.',
        `이 페이지가 더 이상 열리지 않으면 ${BRAND.supportEmail}로 메일 주세요. 새 링크를 보내 드립니다.`,
      ].map((t) => `<p>${escapeHtml(t)}</p>`).join('\n'),
  },
} as const;

export function downloadPage(a: PageArgs): string {
  const t = PAGE[a.lang];
  const items = a.items
    .map((item) =>
      [
        '<div class="item">',
        `<h2>${escapeHtml(item.skillId)} <span class="ver">${escapeHtml(item.version)} · ${kib(item.sizeBytes)}</span></h2>`,
        item.changelog.trim() === '' ? '' : `<div class="log">${escapeHtml(item.changelog.trim())}</div>`,
        `<a class="get" href="${escapeHtml(item.href)}">${t.get}</a>`,
        `<p class="hash">SHA-256 ${escapeHtml(item.sha256)}</p>`,
        '</div>',
      ]
        .filter((line) => line !== '')
        .join('\n'),
    )
    .join('\n');

  return shell(
    a.lang,
    t.title,
    [
      `<h1>${escapeHtml(t.heading)}</h1>`,
      `<p class="meta">${escapeHtml(t.meta(a))}</p>`,
      items,
      '<div class="note">',
      `<h2>${escapeHtml(t.noteHead)}</h2>`,
      t.note(a),
      '</div>',
    ].join('\n'),
  );
}

export type PageFailure = 'missing_token' | 'invalid_token' | 'expired' | 'revoked';

// 四种失败各有各的下一步，所以各写各的话：链接抄漏了要重抄，过期了要重发，
// 退款了不必再找我们要链接。一句含糊的「无法访问」会让三种人都来问同一件事。
const FAILURE = {
  en: {
    missing_token: {
      title: 'Download link incomplete',
      body: [
        'This address is missing its access token, so we cannot tell which order it belongs to.',
        `Open the full link from your delivery email. If the link breaks across two lines in your mail app, copy the whole thing into the address bar, or email ${BRAND.supportEmail} and we will send a new one.`,
      ],
    },
    invalid_token: {
      title: 'Download link not valid',
      body: [
        'We could not verify this link.',
        `Open the link from your delivery email exactly as it was sent. If it still does not work, email ${BRAND.supportEmail} and we will send a new one.`,
      ],
    },
    expired: {
      title: 'Download link expired',
      body: [
        'This link has passed its expiry date.',
        `Your purchase is unaffected. Email ${BRAND.supportEmail} from the address you bought with and we will send a new link.`,
      ],
    },
    revoked: {
      title: 'Download no longer available',
      body: [
        'This order has been refunded or charged back, so the files are no longer available for download.',
        `If you think this is a mistake, email ${BRAND.supportEmail} with your order number.`,
      ],
    },
  },
  ko: {
    missing_token: {
      title: '다운로드 링크가 불완전합니다',
      body: [
        '이 주소에는 접근 토큰이 없어 어느 주문인지 확인할 수 없습니다.',
        `배송 메일에 있는 링크 전체를 열어 주세요. 메일 앱에서 링크가 두 줄로 잘렸다면 전체를 복사해 주소창에 붙여 넣으시거나, ${BRAND.supportEmail}로 메일 주시면 새 링크를 보내 드립니다.`,
      ],
    },
    invalid_token: {
      title: '유효하지 않은 다운로드 링크입니다',
      body: [
        '이 링크를 확인할 수 없습니다.',
        `배송 메일에 있는 링크를 받으신 그대로 열어 주세요. 그래도 열리지 않으면 ${BRAND.supportEmail}로 메일 주시면 새 링크를 보내 드립니다.`,
      ],
    },
    expired: {
      title: '다운로드 링크가 만료되었습니다',
      body: [
        '이 링크는 유효 기간이 지났습니다.',
        `구매 내역에는 영향이 없습니다. 구매하신 주소에서 ${BRAND.supportEmail}로 메일 주시면 새 링크를 보내 드립니다.`,
      ],
    },
    revoked: {
      title: '다운로드를 더 이상 제공하지 않습니다',
      body: [
        '이 주문은 환불 또는 지급거절 처리되어 파일을 더 이상 내려받으실 수 없습니다.',
        `착오라고 생각되시면 주문번호와 함께 ${BRAND.supportEmail}로 메일 주세요.`,
      ],
    },
  },
} as const;

/** 各失败对应的 HTTP 状态：客户端据此区分「链接坏了」和「权利没了」。 */
export const FAILURE_STATUS: Record<PageFailure, number> = {
  missing_token: 400,
  invalid_token: 401,
  expired: 410,
  revoked: 403,
};

export function failurePage(lang: Lang, kind: PageFailure): string {
  const t = FAILURE[lang][kind];
  return shell(
    lang,
    t.title,
    [
      `<h1>${escapeHtml(t.title)}</h1>`,
      ...t.body.map((line) => `<p>${escapeHtml(line)}</p>`),
    ].join('\n'),
  );
}
