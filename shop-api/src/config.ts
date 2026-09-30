// 环境变量读取与校验。缺任何一项都拒绝启动，并一次列出全部缺失项——
// 逐个报错会让部署时反复重启，一次报全才能一次改完。

export interface Config {
  port: number;
  publicBaseUrl: string;
  databaseUrl: string;
  adminToken: string;
  downloadTokenSecret: string;
  downloadTokenTtlDays: number;
  morProvider: 'polar' | 'paddle';
  polarWebhookSecret: string;
  /** /api/checkout/start 的 302 兜底目标（Polar checkout link）。 */
  checkoutUrl: string;
  /** 设置后才启用「API 建会话」路径；null = 静态链接直跳。 */
  polarSession: { accessToken: string; productPriceId: string; apiBase: string } | null;
  /** 设置后才把漏斗事件镜像到 PostHog；null = 完全自建报表。 */
  posthog: { apiKey: string; host: string } | null;
  /** Caddy 访问日志路径（日志摄取脚本读）。 */
  caddyAccessLog: string;
  r2: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  };
  resendApiKey: string;
  mailFrom: string;
  /** 可选。买家回复交付邮件时的收件地址（Resend 的 reply_to）。 */
  mailReplyTo?: string;
  masterDir: string;
  bundleSkillIds: readonly string[];
  /** Resend 免费额度是每 UTC 日历日 100 封；留 20 封给交易邮件。 */
  dailyMailBudget: number;
}

const REQUIRED = [
  'DATABASE_URL',
  'ADMIN_TOKEN',
  'DOWNLOAD_TOKEN_SECRET',
  'POLAR_WEBHOOK_SECRET',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'RESEND_API_KEY',
  'MAIL_FROM',
  'MASTER_DIR',
  'PUBLIC_BASE_URL',
] as const;

export const DEFAULT_BUNDLE_SKILL_IDS = [
  'lesson-workflow',
  'ppt-workflow',
  'audio-workflow',
  'word-workflow',
  'worksheet-workflow',
  'report-workflow',
] as const;

/**
 * 与站点 `src/config/site.ts` 的 `POLAR_CHECKOUT_URL` 是**同一商品的两份登记**：
 * 那份进静态产物（本默认值被覆盖/置空时按钮的兜底形态），这份是运行时
 * /api/checkout/start 的 302 目标。换 checkout link 时两处一起改——
 * verify-build.mjs 只扫站点仓库，这里漂移了不会有测试变红。
 */
export const DEFAULT_CHECKOUT_URL =
  'https://buy.polar.sh/polar_cl_sE7Dgs4mL2RhSttmxJ44TvRNIuTRnYDi2vylc18I4Kq';

export const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
export const DEFAULT_POLAR_API_BASE = 'https://api.polar.sh';
export const DEFAULT_CADDY_ACCESS_LOG = '/var/log/caddy/access.log';

export class ConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`配置不可用：\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];

  for (const key of REQUIRED) {
    if (!env[key] || env[key]!.trim() === '') problems.push(`缺少环境变量 ${key}`);
  }

  const secret = env.DOWNLOAD_TOKEN_SECRET ?? '';
  if (secret !== '' && Buffer.byteLength(secret, 'utf8') < 32) {
    problems.push('DOWNLOAD_TOKEN_SECRET 至少需要 32 字节');
  }

  const provider = env.MOR_PROVIDER ?? 'polar';
  if (provider !== 'polar' && provider !== 'paddle') {
    problems.push(`MOR_PROVIDER 只能是 polar 或 paddle，收到 ${provider}`);
  }

  const port = Number(env.PORT ?? '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT 必须是 1-65535 的整数，收到 ${env.PORT}`);
  }

  const ttl = Number(env.DOWNLOAD_TOKEN_TTL_DAYS ?? '30');
  if (!Number.isInteger(ttl) || ttl < 1) {
    problems.push(`DOWNLOAD_TOKEN_TTL_DAYS 必须是正整数，收到 ${env.DOWNLOAD_TOKEN_TTL_DAYS}`);
  }

  const budget = Number(env.DAILY_MAIL_BUDGET ?? '80');
  if (!Number.isInteger(budget) || budget < 0) {
    problems.push(`DAILY_MAIL_BUDGET 必须是非负整数，收到 ${env.DAILY_MAIL_BUDGET}`);
  }

  const baseUrl = env.PUBLIC_BASE_URL ?? '';
  if (baseUrl !== '' && !/^https?:\/\/[^/]+$/.test(baseUrl)) {
    problems.push(`PUBLIC_BASE_URL 必须是不带路径的站点根，例如 https://example.com，收到 ${baseUrl}`);
  }

  const checkoutUrl = env.CHECKOUT_URL?.trim() || DEFAULT_CHECKOUT_URL;
  if (!/^https:\/\/.+/.test(checkoutUrl)) {
    problems.push(`CHECKOUT_URL 必须是 https 结账链接，收到 ${checkoutUrl}`);
  }

  // Polar API 建会话：两项必须成对出现，半份配置只会换来运行时静默回退。
  const polarToken = env.POLAR_ACCESS_TOKEN?.trim() || null;
  const polarPrice = env.POLAR_PRODUCT_PRICE_ID?.trim() || null;
  if ((polarToken !== null) !== (polarPrice !== null)) {
    problems.push('POLAR_ACCESS_TOKEN 与 POLAR_PRODUCT_PRICE_ID 必须同时设置（或同时留空走静态链接）');
  }
  const polarApiBase = env.POLAR_API_BASE?.trim() || DEFAULT_POLAR_API_BASE;
  if (!/^https:\/\/[^/]+$/.test(polarApiBase)) {
    problems.push(`POLAR_API_BASE 必须是不带路径的 https 根，收到 ${polarApiBase}`);
  }

  const posthogKey = env.POSTHOG_API_KEY?.trim() || null;
  const posthogHost = env.POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST;
  if (!/^https:\/\/[^/]+$/.test(posthogHost)) {
    problems.push(`POSTHOG_HOST 必须是不带路径的 https 根，收到 ${posthogHost}`);
  }

  const bundle = (env.BUNDLE_SKILL_IDS ?? DEFAULT_BUNDLE_SKILL_IDS.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (bundle.length === 0) problems.push('BUNDLE_SKILL_IDS 不能为空');
  for (const id of bundle) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      problems.push(`BUNDLE_SKILL_IDS 含非法 skill id：${id}`);
    }
  }

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    port,
    publicBaseUrl: baseUrl,
    databaseUrl: env.DATABASE_URL!,
    adminToken: env.ADMIN_TOKEN!,
    downloadTokenSecret: secret,
    downloadTokenTtlDays: ttl,
    morProvider: provider,
    polarWebhookSecret: env.POLAR_WEBHOOK_SECRET!,
    checkoutUrl,
    polarSession:
      polarToken && polarPrice ? { accessToken: polarToken, productPriceId: polarPrice, apiBase: polarApiBase } : null,
    posthog: posthogKey ? { apiKey: posthogKey, host: posthogHost } : null,
    caddyAccessLog: env.CADDY_ACCESS_LOG?.trim() || DEFAULT_CADDY_ACCESS_LOG,
    r2: {
      accountId: env.R2_ACCOUNT_ID!,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      bucket: env.R2_BUCKET!,
    },
    resendApiKey: env.RESEND_API_KEY!,
    mailFrom: env.MAIL_FROM!,
    mailReplyTo: env.MAIL_REPLY_TO?.trim() || undefined,
    masterDir: env.MASTER_DIR!,
    bundleSkillIds: bundle,
    dailyMailBudget: budget,
  };
}
