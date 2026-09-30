/**
 * schema.org JSON-LD 节点的唯一出口。
 *
 * SEO（富摘要）与 GEO（AI 引擎实体抽取）共用这一层。所有节点从这里构建，
 * 页面不得手写 JSON-LD——否则 `tests/build/structured-data.test.mjs` 之外的
 * 任何漂移（价格写法、URL 形态、语言串台）都没有第二张网守着。
 *
 * 纪律（与全站既有约束对齐）：
 *  - 金额只从 `SITE.price` 取，绝不拼出 "USD 29.90" 字面量——
 *    `scripts/verify-build.mjs` 按 `USD\s*\d+` 扫描**原始 HTML**，JSON-LD
 *    里只要出现这个形态就会红。
 *  - URL 一律无尾斜杠、带域名，与 canonical/hreflang 同一套形态。
 *  - 文案随 `lang` 走：ko 页面上的节点必须装 ko 文案，en 回落算串台。
 */
import { SITE } from '@/config/site';
import { localizePath, type Locale } from '@/i18n/config';
import { useTranslations, type TranslationKey } from '@/i18n/t';

const url = (path: string) => `${SITE.domain}${path}`;

/**
 * JSON-LD 安全序列化：`<` 一律转义为 `\u003c`。
 *
 * 站内文案经手处众多（i18n 字典、内容集合），只要有一处将来出现 `<`，
 * 未转义的 `</script>` 就会提前闭合标签、把整页 head 打碎。JSON 字符串里
 * `\u003c` 与 `<` 等价，解析器拿到的是同一个字符。
 */
export function ldJson(node: object): string {
  return JSON.stringify(node).replace(/</g, '\\u003c');
}

/** 发布方实体。公司主体信息与 `verify-build.mjs` 的 entity-details 同源。 */
export function organization() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': url('/#organization'),
    name: SITE.companyName,
    url: SITE.domain,
    logo: url('/logo.png'),
    email: SITE.supportEmail,
    brand: { '@type': 'Brand', name: SITE.productName },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: SITE.supportEmail,
        availableLanguage: ['English', 'Korean'],
      },
    ],
  };
}

/** 站点实体，随语言各出现一次（两语首页各装一个，`url` 指向本语言首页）。 */
export function website(lang: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': url('/#website'),
    name: SITE.productName,
    url: url(localizePath('/', lang)),
    inLanguage: lang,
    publisher: { '@id': url('/#organization') },
  };
}

/**
 * 商品实体：六合一套装。首页与 /buy 各装一次，靠同一个 `@id` 合并。
 *
 * `operatingSystem` 写三个桌面系统——SKILL.md 技能在 Claude Code / Codex /
 * Cursor 这类 CLI 代理里运行，而它们跑在桌面系统上；不写 Android/iOS。
 */
export function softwareApp(
  lang: Locale,
  opts: { description: string; featureList?: readonly string[] },
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': url('/#app'),
    name: SITE.productName,
    description: opts.description,
    url: url(localizePath('/', lang)),
    image: url('/og.png'),
    inLanguage: lang,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'macOS, Windows, Linux',
    ...(opts.featureList ? { featureList: [...opts.featureList] } : {}),
    publisher: { '@id': url('/#organization') },
    offers: {
      '@type': 'Offer',
      price: SITE.price.amount,
      priceCurrency: SITE.price.currency,
      availability: 'https://schema.org/InStock',
      url: url(localizePath('/buy', lang)),
      seller: { '@id': url('/#organization') },
    },
  };
}

/**
 * FAQ 实体。问题与答案**必须**来自渲染 `/faq` 的同一批内容条目——
 * 这里只做组装，不做第二份文案；`structured-data.test.mjs` 按
 * `src/content/faq/<lang>` 的源 markdown 逐条比对。
 */
export function faqPage(items: readonly { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
}

/**
 * 面包屑导航的页面名：键即唯一登记处。新页面要进面包屑，先在这里登记
 * i18n 键——未登记的路径直接抛错，而不是静默出一个没有名字的层级。
 */
const CRUMB_KEY: Record<string, TranslationKey> = {
  '/buy': 'buy.title',
  '/docs': 'nav.docs',
  '/faq': 'nav.faq',
  '/install': 'nav.install',
  '/samples': 'nav.samples',
  '/security': 'nav.security',
  '/skills': 'nav.skills',
};

export function breadcrumbs(lang: Locale, path: string) {
  const key = CRUMB_KEY[path];
  if (!key) throw new Error(`No breadcrumb name registered for ${path}`);
  const t = useTranslations(lang);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: t('nav.home'),
        item: url(localizePath('/', lang)),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: t(key),
        item: url(localizePath(path, lang)),
      },
    ],
  };
}

/**
 * FAQ 答案的 markdown → 纯文本。JSON-LD 的 `Answer.text` 是纯文本字段，
 * 语法噪音（反引号、链接、加粗）会让 AI 引擎把它当原文摘录时带上装饰符。
 * 只做减法，不做渲染——FAQ 答案没有表格与脚注，减法足够。
 */
export function mdToText(md: string): string {
  return md
    .replace(/```[^\n]*\n?/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
