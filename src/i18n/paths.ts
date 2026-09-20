import { LOCALES, type Locale } from './config';

/** 每个 src/pages/[lang]/ 下的页面都导出 `export const getStaticPaths = localeStaticPaths` */
export function localeStaticPaths(): { params: { lang: Locale } }[] {
  return LOCALES.map((lang) => ({ params: { lang } }));
}
