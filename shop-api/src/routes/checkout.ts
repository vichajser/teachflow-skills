import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Handler, RequestContext } from '../http/router.ts';
import {
  CHECKOUT_SOURCES,
  isBotUa,
  type FunnelSink,
} from '../funnel/events.ts';
import { createPolarCheckoutSession, type PolarSessionConfig } from '../funnel/polar-session.ts';

export interface CheckoutRouteDeps {
  pool: Pool;
  funnel: FunnelSink;
  /** 302 的兜底目标：Polar checkout link（CHECKOUT_URL 环境变量）。 */
  checkoutUrl: string;
  publicBaseUrl: string;
  /** 设置了才走「API 建会话」路径；任何失败都回退静态链接。 */
  polar?: PolarSessionConfig | null;
}

/**
 * GET /api/checkout/start?src=hero&lang=en
 *
 * 购买按钮的站内一跳：记下 checkout_click（漏斗第②步），然后 302 去 Polar。
 * 多出的这一跳是同域、无外部调用（未启用 Polar API 时），对买家只是多一次
 * 几十毫秒的重定向；换来的是：站内第一次「看得见」购买意图，结账链接也
 * 从静态产物挪进了运行时配置（换 sandbox 链接不再需要重新构建站点）。
 */
export function checkoutStartRoute(deps: CheckoutRouteDeps): Handler {
  return async (ctx: RequestContext) => {
    const srcRaw = ctx.url.searchParams.get('src') ?? 'other';
    const src = (CHECKOUT_SOURCES as readonly string[]).includes(srcRaw) ? srcRaw : 'other';
    const lang = ctx.url.searchParams.get('lang') === 'ko' ? 'ko' : 'en';

    const uaHeader = ctx.req.headers['user-agent'];
    const userAgent = (Array.isArray(uaHeader) ? uaHeader[0] : uaHeader) ?? undefined;
    const refHeader = ctx.req.headers.referer;
    const referrer = (Array.isArray(refHeader) ? refHeader[0] : refHeader) ?? undefined;
    const bot = isBotUa(userAgent);

    let target = deps.checkoutUrl;
    let checkoutId: string | undefined;
    let vid: string | undefined;

    if (deps.polar && !bot) {
      vid = randomUUID();
      try {
        const session = await createPolarCheckoutSession(deps.polar, {
          src,
          lang,
          vid,
          successUrl: `${deps.publicBaseUrl}/api/checkout/return?checkout_id={CHECKOUT_ID}&lang=${lang}`,
        });
        target = session.url;
        checkoutId = session.id;
      } catch (err) {
        vid = undefined;
        console.error(
          '[funnel] Polar 建会话失败，回退静态结账链接：',
          err instanceof Error ? err.message : err,
        );
      }
    }

    await deps.funnel.record({
      step: 'checkout_click',
      src,
      lang,
      vid,
      checkoutId,
      userAgent,
      referrer,
      bot,
      meta: { mode: checkoutId ? 'session' : 'link' },
    });

    ctx.res.writeHead(302, { location: target, 'cache-control': 'no-store' });
    ctx.res.end();
  };
}

/**
 * GET /api/checkout/return?checkout_id=…&lang=…
 *
 * Polar 支付成功后的回跳接缝（漏斗第⑤步）。Polar 后台的 success URL 指到这里，
 * 记一笔后 302 到既有的静态成功页——页面本身保持零脚本、零表单不变。
 * checkout_id 若是 API 会话模式生成的，能从第②步的事件里找回 vid/lang；
 * 静态链接模式下尽力而为（query 里的 lang 优先，其次历史事件，最后 'en'）。
 */
export function checkoutReturnRoute(deps: CheckoutRouteDeps): Handler {
  return async (ctx: RequestContext) => {
    const checkoutId = ctx.url.searchParams.get('checkout_id');
    const queryLang = ctx.url.searchParams.get('lang') === 'ko' ? 'ko' : null;

    if (!checkoutId) {
      // 没有回跳标识记不了账，但也不能把买家晾在 404 上。
      ctx.res.writeHead(302, { location: '/en/buy/success', 'cache-control': 'no-store' });
      ctx.res.end();
      return;
    }

    let lang: 'en' | 'ko' = 'en';
    let vid: string | undefined;
    if (queryLang) {
      lang = queryLang;
    }
    try {
      const { rows } = await deps.pool.query<{ lang: 'en' | 'ko' | null; vid: string | null }>(
        'SELECT lang, vid FROM funnel_events WHERE checkout_id = $1 ORDER BY id DESC LIMIT 1',
        [checkoutId],
      );
      const found = rows[0];
      if (found) {
        if (!queryLang && found.lang) lang = found.lang;
        vid = found.vid ?? undefined;
      }
    } catch (err) {
      console.error('[funnel] 回跳查询失败：', err instanceof Error ? err.message : err);
    }

    const uaHeader = ctx.req.headers['user-agent'];
    const userAgent = (Array.isArray(uaHeader) ? uaHeader[0] : uaHeader) ?? undefined;

    await deps.funnel.record({
      step: 'success_return',
      lang,
      vid,
      checkoutId,
      userAgent,
      bot: isBotUa(userAgent),
    });

    const to = `/${lang}/buy/success?checkout_id=${encodeURIComponent(checkoutId)}`;
    ctx.res.writeHead(302, { location: to, 'cache-control': 'no-store' });
    ctx.res.end();
  };
}
