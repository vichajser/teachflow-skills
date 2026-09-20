import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  localizePath,
  stripLocale,
  localeFromPath,
} from '@/i18n/config';
import { useTranslations, type TranslationKey } from '@/i18n/t';
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
      'skills.inputs',
      'skills.checks',
      'skills.outputs',
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

/**
 * `src/i18n/t.ts` 的 JSDoc 立了规矩：「韩文缺键时回落英文，绝不返回空串或裸键
 * ——页面上出现 "nav.pricing" 这样的裸键比显示英文更糟」。这一段是那条规矩的
 * 测试。
 *
 * 它补的是一个实测漏网：把 `?? en[key]` 改成 `?? (key as string)`，
 * tsc 0、全套测试全绿、闸门 exit 0。原因很简单——今天两份字典键集完全一致
 * （101/101，上面 `dictionary parity` 正是在守这一点），所以那条回落分支
 * **在真实数据下永不执行**，没有任何断言路过它。于是"缺键回落英文"这件事
 * 事实上无人看守：哪天有人往 en.json 加了键而忘了 ko.json（parity 那条会红，
 * 但人可能先改 parity 再改这里），韩文页就开始显示裸键。
 *
 * 两条用例从两个方向钉这条分支：一条证明「缺键时给的是英文」，一条证明
 * 「完全未知的键不会被当成文案吐回去」。单有前者挡不住 `?? (key as string)`
 * 之外的变体，单有后者挡不住回落到空串。
 */
describe('useTranslations falls back to English instead of leaking a bare key', () => {
  // 这里改的是 `t.ts` 里 `DICTIONARIES.ko` 指向的**那个**对象（import 的 JSON
  // 模块对象在整个进程里是同一份），所以删键能真的让回落分支跑起来。
  // 用 try/finally 原样还原，避免污染同一进程里的其它用例。
  //
  // 为什么不用 `vi.mock` 造一份缺键字典：那样测的是 mock 出来的假字典，
  // 而这里要测的恰恰是**真实字典 + 真实取值路径**在缺键时的行为。
  it('serves the English string when the Korean one is missing', async () => {
    const ko = (await import('@/i18n/ko.json')).default as Record<string, string>;
    const en = (await import('@/i18n/en.json')).default as Record<string, string>;
    const KEY = 'nav.pricing';
    const saved = ko[KEY];
    try {
      delete ko[KEY];
      const t = useTranslations('ko');
      expect(t('nav.pricing')).toBe(en[KEY]);
      // 反面写死：回落结果不能是键名本身，也不能是空串。
      expect(t('nav.pricing')).not.toBe(KEY);
      expect(t('nav.pricing').length).toBeGreaterThan(0);
    } finally {
      ko[KEY] = saved;
    }
  });

  it('returns nothing at all for a key neither dictionary knows', () => {
    // `as TranslationKey` 是这条用例的必需品，不是图省事：`TranslationKey`
    // 就是 `keyof typeof en`，一个不存在的键**按类型根本传不进去**——而
    // 「有人传了一个不存在的键」正是这里唯一要测的场景（拼错的键、被删掉的
    // 键、从外部数据拼出来的键）。类型系统挡得住源码里的手写调用，挡不住
    // 这三种情况，所以运行时行为仍需固定下来。
    //
    // 断言的是 `undefined` 而不是某个字符串：`?? en[key]` 在双缺时给出
    // `undefined`，渲染成 Astro 表达式就是**什么都不显示**——一个空位。
    // 而 `?? (key as string)` 会把 "nav.pricing" 这样的裸键印在页面上给买家看。
    // 空位是个显眼的 bug，裸键看上去像是"内容"，后者更糟。这条锁死前者。
    const t = useTranslations('ko');
    expect(t('this.key.does.not.exist' as TranslationKey)).toBeUndefined();
  });
});

/**
 * The hand-maintained list above only proves the keys someone remembered to
 * add. This proves the two dictionaries carry the *same* key set in both
 * directions, so a key added to one file and forgotten in the other fails
 * here instead of silently falling back to English at runtime.
 */
describe('dictionary parity', () => {
  const read = (name: string) =>
    JSON.parse(readFileSync(new URL(`../../src/i18n/${name}`, import.meta.url), 'utf8')) as Record<
      string,
      string
    >;

  it('has the same keys in en.json and ko.json, in both directions', () => {
    const en = read('en.json');
    const ko = read('ko.json');
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
  });

  it('has no empty values in either dictionary', () => {
    for (const name of ['en.json', 'ko.json']) {
      for (const [key, value] of Object.entries(read(name))) {
        expect(value.trim().length, `${name}: ${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('writes Korean, not an English placeholder, for every ko string', () => {
    for (const [key, value] of Object.entries(read('ko.json'))) {
      // lang.en / lang.ko legitimately hold language names in their own script.
      if (key === 'lang.en') continue;
      expect(/[가-힣]/.test(value), `ko.json: ${key} has no Hangul`).toBe(true);
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
