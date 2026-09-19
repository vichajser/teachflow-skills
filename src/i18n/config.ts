export const LOCALES = ['en', 'ko'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * '/pricing' + 'ko' → '/ko/pricing'；'/' + 'en' → '/en'
 *
 * 只加前缀，**不剥离已有前缀**：`localizePath('/en/pricing', 'ko')` 得到
 * `/ko/en/pricing`。语言切换器这类拿 `Astro.url.pathname` 的调用方，
 * 必须写成 `localizePath(stripLocale(pathname), locale)`。
 */
export function localizePath(path: string, locale: Locale): string {
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  return clean === '' ? `/${locale}` : `/${locale}/${clean}`;
}

/** '/ko/pricing' → '/pricing'；'/ko' → '/'；无语言前缀则原样返回 */
export function stripLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && isLocale(segments[0]!)) {
    segments.shift();
  }
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

/** 未知或缺失前缀一律回落默认语言（spec §8：未知语言前缀重定向至 /en） */
export function localeFromPath(pathname: string): Locale {
  const first = pathname.split('/').filter(Boolean)[0];
  return first && isLocale(first) ? first : DEFAULT_LOCALE;
}
