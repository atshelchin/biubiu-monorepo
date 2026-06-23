/**
 * Central locale registry for biubiu.tools.
 *
 * `en` is the source of truth; all other locales live under `src/messages/<code>/`
 * and fall back to English per-key for any gap.
 */

export const DEFAULT_LOCALE = 'en';

/** All shipped UI locales, in display order. */
export const SUPPORTED_LOCALES = [
  'en',
  'zh',
  'zh-TW',
  'zh-HK',
  'ja',
  'ko',
  'vi',
  'id',
  'tr',
  'es-MX',
  'pt-BR',
  'fr',
  'de',
  'ru',
  'it',
] as const;

export type AppLanguage = (typeof SUPPORTED_LOCALES)[number];

/** Native, self-referential names shown in the language switcher. */
export const LOCALE_NAMES: Record<AppLanguage, string> = {
  en: 'English',
  zh: '简体中文',
  'zh-TW': '繁體中文',
  'zh-HK': '繁體中文（香港）',
  ja: '日本語',
  ko: '한국어',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  tr: 'Türkçe',
  'es-MX': 'Español (MX)',
  'pt-BR': 'Português (BR)',
  fr: 'Français',
  de: 'Deutsch',
  ru: 'Русский',
  it: 'Italiano',
};

export function isSupportedLocale(value: string | undefined | null): value is AppLanguage {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve the best supported locale: an explicit cookie wins, otherwise the
 * browser's Accept-Language header, otherwise English.
 */
export function resolveLocale(
  cookieLocale?: string | null,
  acceptLanguage?: string | null
): AppLanguage {
  if (isSupportedLocale(cookieLocale)) return cookieLocale;
  return pickFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

/** Parse an Accept-Language header and return the highest-priority supported locale. */
function pickFromAcceptLanguage(header?: string | null): AppLanguage | null {
  if (!header) return null;
  const tags = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: tag.trim(), q: q ? parseFloat(q) : 1 };
    })
    .filter((t) => t.tag)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    const matched = matchTag(tag);
    if (matched) return matched;
  }
  return null;
}

/** Map a single BCP-47 tag (e.g. "zh-CN", "ja-JP", "de-AT") to a supported locale. */
function matchTag(tagRaw: string): AppLanguage | null {
  const tag = tagRaw.toLowerCase();

  // 1) exact match (case-insensitive)
  const exact = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === tag);
  if (exact) return exact;

  // 2) Chinese script/region routing
  if (tag === 'zh' || tag.startsWith('zh-')) {
    if (tag.includes('hk') || tag.includes('mo')) return 'zh-HK';
    if (tag.includes('tw') || tag.includes('hant')) return 'zh-TW';
    return 'zh'; // zh, zh-CN, zh-SG, zh-Hans, …
  }

  // 3) Spanish / Portuguese → the regional variant we ship
  if (tag === 'es' || tag.startsWith('es-')) return 'es-MX';
  if (tag === 'pt' || tag.startsWith('pt-')) return 'pt-BR';

  // 4) primary subtag (e.g. "ja-JP" → "ja", "de-AT" → "de")
  const primary = tag.split('-')[0];
  const byPrimary = SUPPORTED_LOCALES.find((l) => l.toLowerCase().split('-')[0] === primary);
  return byPrimary ?? null;
}
