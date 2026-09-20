import en from './en.json';
import ko from './ko.json';
import type { Locale } from './config';

export type TranslationKey = keyof typeof en;

const DICTIONARIES: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  en,
  ko,
};

/**
 * 韩文缺键时回落英文，绝不返回空串或裸键——
 * 页面上出现 "nav.pricing" 这样的裸键比显示英文更糟。
 */
export function useTranslations(locale: Locale) {
  return function t(key: TranslationKey): string {
    return DICTIONARIES[locale][key] ?? en[key];
  };
}
