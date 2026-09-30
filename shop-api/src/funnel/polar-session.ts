/**
 * Polar 结账会话创建（可选，POLAR_ACCESS_TOKEN + POLAR_PRODUCT_PRICE_ID
 * 都设置时才启用）。
 *
 * 启用后 /api/checkout/start 不再 302 到静态 checkout link，而是调 Polar API
 * 建一个带 metadata（src/lang/vid）的会话再跳过去。收益：checkout.created 与
 * order.paid 的 webhook 会带回这些 metadata，②→④ 因此能用 vid 关联（无 cookie）；
 * success_url 也能按点击时的语言生成。失败自动回退静态链接——购买路径
 * 永远不因统计而断。
 *
 * ⚠ 本模块的字段名（product_price_id / success_url 的 {CHECKOUT_ID} 占位符）
 * 照 docs.polar.sh 的公开文档所写，**尚未在 sandbox 实测**（实施时网络不可用）。
 * 启用前先按 docs/2026-09-29-funnel-analytics-plan.md §7 的清单走一遍 sandbox
 * 验证；对不上时只需要改这一个文件。
 */

export interface PolarSessionConfig {
  token: string;
  productPriceId: string;
  apiBase: string;
}

export interface PolarSessionRequest {
  src: string;
  lang: 'en' | 'ko';
  vid: string;
  successUrl: string;
}

export interface PolarSession {
  id: string;
  url: string;
}

const TIMEOUT_MS = 4_000;

export async function createPolarCheckoutSession(
  config: PolarSessionConfig,
  req: PolarSessionRequest,
): Promise<PolarSession> {
  const res = await fetch(`${config.apiBase}/v1/checkouts/`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      product_price_id: config.productPriceId,
      success_url: req.successUrl,
      metadata: { src: req.src, lang: req.lang, vid: req.vid },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Polar 建会话返回 ${res.status}`);
  }

  const data = (await res.json()) as { id?: unknown; url?: unknown };
  if (
    typeof data.id !== 'string' || data.id === '' ||
    typeof data.url !== 'string' || !data.url.startsWith('https://')
  ) {
    throw new Error('Polar 建会话响应缺少 id/url');
  }
  return { id: data.id, url: data.url };
}
