import type { Pool } from 'pg';
import type { Handler, RequestContext } from '../http/router.ts';
import { sendHtml, sendJson } from '../http/respond.ts';
import { verifyToken, type VerifyFailure } from '../lib/token.ts';
import { StorageError, type Storage } from '../lib/storage.ts';
import { injectLicenceHolder } from '../lib/watermark.ts';
import type { Lang } from '../lib/legal.ts';
import { entitledSkillIds, getOrder, hasEntitlement, type OrderRow } from '../db/orders.ts';
import { latestRelease } from '../db/releases.ts';
import { recordDownload } from '../db/downloads.ts';
import {
  downloadPage,
  failurePage,
  FAILURE_STATUS,
  type DownloadItem,
  type PageFailure,
} from '../views/download.ts';

export interface DownloadDeps {
  pool: Pool;
  storage: Storage;
  tokenSecret: string;
  now?(): Date;
}

/** 签名失败的四种原因里，只有过期是买家能理解也能自助解决的，单列。 */
const FAILURE_BY_REASON: Record<VerifyFailure, PageFailure> = {
  malformed: 'invalid_token',
  bad_algorithm: 'invalid_token',
  bad_signature: 'invalid_token',
  expired: 'expired',
};

function langOf(ctx: RequestContext, order: OrderRow | null): Lang {
  const asked = ctx.url.searchParams.get('lang');
  if (asked === 'en' || asked === 'ko') return asked;
  return order?.locale === 'ko' ? 'ko' : 'en';
}

type Resolved =
  | { ok: true; order: OrderRow; token: string; expiresAt: Date }
  | { ok: false; kind: PageFailure };

/**
 * token → 订单。页面与文件两条路走同一套判定，否则会出现
 * 页面打得开、点下载却 403 这种自相矛盾的状态。
 */
async function resolve(deps: DownloadDeps, ctx: RequestContext): Promise<Resolved> {
  const token = ctx.url.searchParams.get('t');
  if (!token) return { ok: false, kind: 'missing_token' };

  const now = deps.now ? deps.now().getTime() : Date.now();
  const verified = verifyToken(deps.tokenSecret, token, now);
  if (!verified.ok) return { ok: false, kind: FAILURE_BY_REASON[verified.reason] };

  const order = await getOrder(deps.pool, verified.claims.orderId);
  // 签名对得上却查无此单：不是买家能修的事，也不该提示「退款了」。
  if (!order) return { ok: false, kind: 'invalid_token' };
  if (order.status !== 'paid') return { ok: false, kind: 'revoked' };

  return { ok: true, order, token, expiresAt: new Date(verified.claims.exp * 1000) };
}

export function downloadPageRoute(deps: DownloadDeps): Handler {
  return async (ctx: RequestContext) => {
    const resolved = await resolve(deps, ctx);
    if (!resolved.ok) {
      const lang = langOf(ctx, null);
      sendHtml(ctx.res, FAILURE_STATUS[resolved.kind], failurePage(lang, resolved.kind));
      return;
    }

    const { order, token } = resolved;
    const lang = langOf(ctx, order);
    const skillIds = await entitledSkillIds(deps.pool, order.id);

    const items: DownloadItem[] = [];
    for (const skillId of skillIds) {
      const release = await latestRelease(deps.pool, skillId);
      // 还没发过版的 skill 没有可下的东西，不在页面上占位。
      if (!release) continue;
      items.push({
        skillId,
        version: release.version,
        sizeBytes: release.sizeBytes,
        sha256: release.sha256,
        changelog: lang === 'ko' ? release.changelogKo : release.changelogEn,
        href: `/api/download/${encodeURIComponent(skillId)}?t=${encodeURIComponent(token)}`,
      });
    }

    sendHtml(
      ctx.res,
      200,
      downloadPage({ lang, orderId: order.id, expiresAt: resolved.expiresAt, items }),
    );
  };
}

export function downloadFileRoute(deps: DownloadDeps): Handler {
  return async (ctx: RequestContext) => {
    const resolved = await resolve(deps, ctx);
    // 状态码与页面一致，正文回 JSON：调用它的是浏览器的下载动作，不是人在读的页面。
    if (!resolved.ok) {
      sendJson(ctx.res, FAILURE_STATUS[resolved.kind], { error: resolved.kind });
      return;
    }

    const { order } = resolved;
    const skillId = ctx.params.skillId ?? '';
    if (!(await hasEntitlement(deps.pool, order.id, skillId))) {
      sendJson(ctx.res, 403, { error: 'not_entitled', skill: skillId });
      return;
    }

    const release = await latestRelease(deps.pool, skillId);
    if (!release) {
      sendJson(ctx.res, 404, { error: 'no_release', skill: skillId });
      return;
    }

    let master: Buffer;
    try {
      master = await deps.storage.getMaster(skillId, release.version);
    } catch (err) {
      if (err instanceof StorageError) {
        sendJson(ctx.res, 503, { error: 'master_unavailable', skill: skillId });
        return;
      }
      throw err;
    }

    const at = deps.now ? deps.now() : new Date();
    const file = injectLicenceHolder(
      master,
      {
        skillId,
        version: release.version,
        orderId: order.id,
        email: order.buyerEmail,
        purchasedAt: order.createdAt,
      },
      at,
    );

    // 先记账再交付。反过来的话，退款争议时我们会有一份发出去却没记录的副本，
    // 而 /legal/refund 写明以下载记录为准。
    await recordDownload(deps.pool, {
      orderId: order.id,
      skillId,
      version: release.version,
      ip: ctx.clientIp,
      userAgent: headerOf(ctx.req.headers['user-agent']),
    });

    // 文件名进的是响应头，不能带引号或换行——skillId 走到这里已经过了
    // entitlement 校验，但头部注入这种事不值得靠上游保证。
    const filename = `${skillId.replace(/[^a-zA-Z0-9._-]/g, '-')}-${release.version}.zip`;
    ctx.res.writeHead(200, {
      'content-type': 'application/zip',
      'content-length': file.length,
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    ctx.res.end(file);
  };
}

function headerOf(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
