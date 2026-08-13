/**
 * locale-prefs — locale detection + persistence for the join-web PWA.
 *
 * Per Wave 5 §S5.1 + §S5.5 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * The picker auto-detects from `navigator.languages` (or the legacy
 * `navigator.language` and Accept-Language fallback), and the user's
 * manual choice persists in a `domio-locale` cookie.
 *
 * Two parallel surfaces are exported:
 *  - `LIST_LOCALES` (string array, legacy) — string codes for the
 *    lightweight picker. Compatible with the original test suite.
 *  - `LIST_LOCALES_DETAILED` (LocaleDescriptor array, §S5.5) — the
 *    full descriptors used by the captions LocalePicker.
 *
 * This module deliberately has no React or DOM dependency beyond
 * `document.cookie` so it can be unit-tested under the `node`
 * environment with a tiny shim.
 */

export interface LocaleDescriptor {
  readonly code: string;
  readonly label: string;
  readonly bcp47: string;
}

export const LIST_LOCALES_DETAILED: readonly LocaleDescriptor[] = [
  { code: 'en', label: 'English', bcp47: 'en-US' },
  { code: 'es', label: 'Español', bcp47: 'es-ES' },
  { code: 'fr', label: 'Français', bcp47: 'fr-FR' },
  { code: 'de', label: 'Deutsch', bcp47: 'de-DE' },
  { code: 'ja', label: '日本語', bcp47: 'ja-JP' },
  { code: 'zh-CN', label: '中文', bcp47: 'zh-CN' },
  { code: 'ar', label: 'العربية', bcp47: 'ar-SA' },
  { code: 'ur', label: 'اردو', bcp47: 'ur-PK' },
] as const;

export const LIST_LOCALES: readonly string[] = LIST_LOCALES_DETAILED.map((l) => l.code);

export const DEFAULT_LOCALE = 'en-US';
export const LOCALE_COOKIE = 'domio-locale';

export function isSupportedLocale(value: string): boolean {
  return LIST_LOCALES.includes(value);
}

/**
 * Resolve a BCP-47 / language code to a rich descriptor. Falls back
 * to the default locale when the code is unknown.
 */
export function findLocaleDescriptor(code: string | null | undefined): LocaleDescriptor {
  if (!code) {
    const fallback = LIST_LOCALES_DETAILED.find((l) => l.bcp47 === DEFAULT_LOCALE);
    return fallback ?? LIST_LOCALES_DETAILED[0]!;
  }
  const exact = LIST_LOCALES_DETAILED.find((l) => l.bcp47 === code || l.code === code);
  if (exact) return exact;
  const base = code.split('-')[0] ?? '';
  const byBase = LIST_LOCALES_DETAILED.find((l) => l.code === base.toLowerCase());
  return byBase ?? LIST_LOCALES_DETAILED[0]!;
}

/**
 * Read the user's preferred locale from `navigator.languages` first,
 * then fall back to a single `navigator.language`, and finally to
 * a parsed `Accept-Language` header value. Returns `DEFAULT_LOCALE`
 * if nothing matches.
 */
export function detectLocale(input?: {
  readonly languages?: readonly string[];
  readonly acceptLanguage?: string | null;
}): string {
  if (input?.languages && input.languages.length > 0) {
    for (const raw of input.languages) {
      const norm = normalizeLocale(raw);
      if (norm) return norm;
    }
  }
  if (input?.acceptLanguage) {
    const parts = input.acceptLanguage.split(',');
    for (const part of parts) {
      const tag = part.trim().split(';')[0];
      if (!tag) continue;
      const norm = normalizeLocale(tag);
      if (norm) return norm;
    }
  }
  return DEFAULT_LOCALE;
}

function normalizeLocale(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isSupportedLocale(trimmed)) return trimmed;
  // Region-tag form: e.g. "en-US", "fr-CA". Try matching the bare
  // language code first, then the full BCP-47 tag.
  const dashIdx = trimmed.indexOf('-');
  if (dashIdx > 0) {
    const base = trimmed.slice(0, dashIdx);
    if (isSupportedLocale(base)) return base;
    if (isSupportedLocale(trimmed)) return trimmed;
  }
  return null;
}

/**
 * Cookie accessors. Cookie format: `domio-locale=en; path=/; max-age=31536000`.
 * No SameSite explicitly so it works on PWA / native-webview contexts.
 */
export function loadSavedLocale(cookieJar?: string): string | null {
  const source = cookieJar ?? readDocumentCookie();
  if (!source) return null;
  const parts = source.split(';');
  for (const part of parts) {
    const [rawKey, ...rest] = part.split('=');
    if (!rawKey) continue;
    if (rawKey.trim() !== LOCALE_COOKIE) continue;
    const value = rest.join('=').trim();
    if (value && isSupportedLocale(decodeURIComponent(value))) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

export function saveLocale(
  locale: string,
  options?: {
    readonly days?: number;
    readonly writeCookie?: (cookie: string) => void;
  },
): void {
  if (!isSupportedLocale(locale)) return;
  const days = options?.days ?? 365;
  const maxAge = Math.max(1, Math.floor(days * 24 * 60 * 60));
  const encoded = encodeURIComponent(locale);
  const cookie = `${LOCALE_COOKIE}=${encoded}; path=/; max-age=${maxAge}`;
  if (options?.writeCookie) {
    options.writeCookie(cookie);
  } else {
    writeDocumentCookie(cookie);
  }
}

/**
 * High-level helper: read saved → detect → fallback. Tests can
 * inject every layer.
 */
export function resolveLocale(input?: {
  readonly cookie?: string | null;
  readonly languages?: readonly string[];
  readonly acceptLanguage?: string | null;
}): string {
  const saved = loadSavedLocale(input?.cookie ?? undefined);
  if (saved) return saved;
  return detectLocale({
    ...(input?.languages !== undefined ? { languages: input.languages } : {}),
    ...(input?.acceptLanguage !== undefined ? { acceptLanguage: input.acceptLanguage } : {}),
  });
}

function readDocumentCookie(): string {
  if (typeof document === 'undefined') return '';
  return document.cookie ?? '';
}

function writeDocumentCookie(cookie: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = cookie;
}
