import { BRAND } from '../brand.ts';
import type { Lang } from './legal.ts';

export interface Mail {
  subject: string;
  text: string;
}

/** 与站点 SiteFooter.astro 的 disclosure 同一行文，分隔符是 U+00B7。 */
export const DISCLOSURE =
  `${BRAND.companyName} · Registered in ${BRAND.registeredIn} · Company No. ${BRAND.companyNumber}`;

export interface DeliveryArgs {
  lang: Lang;
  orderId: string;
  downloadUrl: string;
  ttlDays: number;
  skillCount: number;
  /** 从 refund.md 现取的法定撤回权告知，逐字附在正文末尾。 */
  notice: string;
}

export function deliveryMail(a: DeliveryArgs): Mail {
  if (a.lang === 'ko') {
    return {
      subject: `${BRAND.productName} 다운로드 링크`,
      text: [
        '구매해 주셔서 감사합니다.',
        '',
        '다운로드 페이지:',
        a.downloadUrl,
        '',
        `링크는 ${a.ttlDays}일 동안 유효합니다. 주문번호 ${a.orderId}.`,
        '',
        `이 패키지에는 스킬 ${a.skillCount}개가 들어 있습니다. 내려받으시는 모든 파일에는`,
        '구매하신 이메일 주소와 주문번호가 기록됩니다. 라이선스는',
        `${BRAND.licenceId}이며, 기재된 보유자 본인에게만 허용됩니다.`,
        '',
        '스킬이 갱신되면 메일로 알려 드립니다. 갱신 비용은 없으며, 같은 링크에서',
        '새 버전을 받으실 수 있습니다.',
        '',
        `링크가 만료되었다면 ${BRAND.supportEmail}로 메일 주세요. 새 링크를 보내 드립니다.`,
        '',
        a.notice,
        '',
        DISCLOSURE,
        BRAND.supportEmail,
      ].join('\n'),
    };
  }
  return {
    subject: `Your ${BRAND.productName} download link`,
    text: [
      'Thank you for your purchase.',
      '',
      'Download page:',
      a.downloadUrl,
      '',
      `The link works for ${a.ttlDays} days. Order ${a.orderId}.`,
      '',
      `The package contains ${a.skillCount} skills. Every file you download carries your`,
      `email address and order number. The licence is ${BRAND.licenceId}: licensed to`,
      'the named holder only.',
      '',
      'When a skill is updated we email you. Updates cost nothing, and this same link',
      'gives you the new version.',
      '',
      `If the link has expired, email ${BRAND.supportEmail} and we will send a new one.`,
      '',
      a.notice,
      '',
      DISCLOSURE,
      BRAND.supportEmail,
    ].join('\n'),
  };
}

export interface UpdateArgs {
  lang: Lang;
  skillId: string;
  version: string;
  changelog: string;
  downloadUrl: string;
}

export function updateMail(a: UpdateArgs): Mail {
  if (a.lang === 'ko') {
    return {
      subject: `${BRAND.productName} 업데이트: ${a.skillId} ${a.version}`,
      text: [
        `${a.skillId} 스킬이 ${a.version} 버전으로 갱신되었습니다.`,
        '',
        a.changelog,
        '',
        '다운로드 페이지:',
        a.downloadUrl,
        '',
        '추가 비용은 없습니다. 링크가 만료되었다면',
        `${BRAND.supportEmail}로 메일 주세요. 새 링크를 보내 드립니다.`,
        '',
        DISCLOSURE,
        BRAND.supportEmail,
      ].join('\n'),
    };
  }
  return {
    subject: `${BRAND.productName} update: ${a.skillId} ${a.version}`,
    text: [
      `${a.skillId} has been updated to ${a.version}.`,
      '',
      a.changelog,
      '',
      'Download page:',
      a.downloadUrl,
      '',
      `There is nothing more to pay. If your link has expired, email ${BRAND.supportEmail}`,
      'and we will send a new one.',
      '',
      DISCLOSURE,
      BRAND.supportEmail,
    ].join('\n'),
  };
}

export interface ResendArgs {
  lang: Lang;
  orderId: string;
  downloadUrl: string;
  ttlDays: number;
}

export function resendMail(a: ResendArgs): Mail {
  if (a.lang === 'ko') {
    return {
      subject: `${BRAND.productName} 다운로드 링크`,
      text: [
        '요청하신 다운로드 링크입니다.',
        '',
        a.downloadUrl,
        '',
        `링크는 ${a.ttlDays}일 동안 유효합니다. 주문번호 ${a.orderId}.`,
        '',
        '요청하신 적이 없다면 이 메일은 무시하셔도 됩니다. 주문에는 아무 변화가 없습니다.',
        '',
        DISCLOSURE,
        BRAND.supportEmail,
      ].join('\n'),
    };
  }
  return {
    subject: `Your ${BRAND.productName} download link`,
    text: [
      'Here is the download link you asked for.',
      '',
      a.downloadUrl,
      '',
      `The link works for ${a.ttlDays} days. Order ${a.orderId}.`,
      '',
      'If you did not ask for this, ignore this email. Nothing about your order has',
      'changed.',
      '',
      DISCLOSURE,
      BRAND.supportEmail,
    ].join('\n'),
  };
}
