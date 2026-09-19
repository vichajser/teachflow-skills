import { describe, it, expect } from 'vitest';
import {
  LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  localizePath,
  stripLocale,
  localeFromPath,
} from '@/i18n/config';
import { useTranslations } from '@/i18n/t';
import { localeStaticPaths } from '@/i18n/paths';

describe('locale config', () => {
  it('ships exactly English and Korean, English first', () => {
    expect(LOCALES).toEqual(['en', 'ko']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('recognises supported locales only', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('ko')).toBe(true);
    expect(isLocale('zh')).toBe(false);
    expect(isLocale('')).toBe(false);
  });
});

describe('localizePath', () => {
  it('prefixes a path with the locale', () => {
    expect(localizePath('/pricing', 'ko')).toBe('/ko/pricing');
    expect(localizePath('/legal/refund', 'en')).toBe('/en/legal/refund');
  });

  it('maps the site root to the locale root', () => {
    expect(localizePath('/', 'en')).toBe('/en');
    expect(localizePath('/', 'ko')).toBe('/ko');
  });

  it('accepts paths with or without a leading slash', () => {
    expect(localizePath('pricing', 'ko')).toBe('/ko/pricing');
  });

  it('normalises redundant and trailing slashes without doubling the prefix', () => {
    expect(localizePath('/pricing/', 'ko')).toBe('/ko/pricing');
    expect(localizePath('//pricing', 'ko')).toBe('/ko/pricing');
    expect(localizePath('', 'en')).toBe('/en');
  });
});

describe('stripLocale', () => {
  it('removes the locale prefix', () => {
    expect(stripLocale('/ko/pricing')).toBe('/pricing');
    expect(stripLocale('/en/legal/terms')).toBe('/legal/terms');
  });

  it('maps a bare locale root back to the site root', () => {
    expect(stripLocale('/ko')).toBe('/');
    expect(stripLocale('/en/')).toBe('/');
  });

  it('leaves unprefixed paths untouched', () => {
    expect(stripLocale('/pricing')).toBe('/pricing');
  });

  // '/english/' merely *starts with* a locale-like segment; treating it as
  // prefixed would corrupt every path whose first segment is not exactly 'en'/'ko'.
  it('does not mistake a locale-like segment for a real locale prefix', () => {
    expect(stripLocale('/english/')).toBe('/english');
    expect(stripLocale('/english/pricing')).toBe('/english/pricing');
  });

  it('maps the site root to the site root', () => {
    expect(stripLocale('/')).toBe('/');
  });
});

describe('localeFromPath', () => {
  it('reads the locale out of the path', () => {
    expect(localeFromPath('/ko/samples')).toBe('ko');
    expect(localeFromPath('/en')).toBe('en');
  });

  it('falls back to the default locale for unknown prefixes', () => {
    expect(localeFromPath('/zh/samples')).toBe('en');
    expect(localeFromPath('/')).toBe('en');
  });

  it('does not treat a locale-like segment as a locale', () => {
    expect(localeFromPath('/english/samples')).toBe('en');
  });
});

describe('useTranslations', () => {
  it('returns the string for the requested locale', () => {
    expect(useTranslations('en')('nav.pricing')).toBe('Pricing');
    expect(useTranslations('ko')('nav.pricing')).toBe('가격');
  });

  it('never returns an empty string for a known key', () => {
    const t = useTranslations('ko');
    expect(t('nav.skills').length).toBeGreaterThan(0);
  });

  it('serves every English key in both dictionaries', () => {
    const en = useTranslations('en');
    const ko = useTranslations('ko');
    const keys = [
      'site.tagline',
      'nav.skills',
      'nav.samples',
      'nav.pricing',
      'nav.security',
      'nav.docs',
      'nav.faq',
      'nav.home',
      'lang.switch',
      'lang.en',
      'lang.ko',
      'footer.legal',
      'footer.terms',
      'footer.privacy',
      'footer.refund',
      'footer.delivery',
      'footer.support',
      'footer.supportLine',
      'footer.registered',
    ] as const;

    for (const key of keys) {
      expect(en(key).length, `en.${key} is empty`).toBeGreaterThan(0);
      expect(ko(key).length, `ko.${key} is empty`).toBeGreaterThan(0);
    }
  });
});

describe('localeStaticPaths', () => {
  it('produces one entry per locale', () => {
    expect(localeStaticPaths()).toEqual([
      { params: { lang: 'en' } },
      { params: { lang: 'ko' } },
    ]);
  });
});
