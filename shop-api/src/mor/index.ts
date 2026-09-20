import type { MorAdapter } from './types.ts';
import { polarAdapter } from './polar.ts';

// 只注册真正实现了的供应商。config 里 MOR_PROVIDER 允许 paddle，
// 是为了将来换供应商时不用同时改两处；在 paddle.ts 写出来之前，
// 选它会在启动时就报错，而不是等到第一笔订单进来才失败。

const ADAPTERS: Record<string, MorAdapter> = {
  polar: polarAdapter,
};

export class MorError extends Error {}

export function getAdapter(provider: string): MorAdapter {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    throw new MorError(`未实现的 MoR 供应商：${provider}（可用：${Object.keys(ADAPTERS).join(', ')}）`);
  }
  return adapter;
}

export type { MorAdapter, NormalizedOrderEvent, VerifyOutcome, VerifyFailure } from './types.ts';
