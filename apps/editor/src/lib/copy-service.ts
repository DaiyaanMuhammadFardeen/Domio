/**
 * Copy service — typed client for the AI copy/translate endpoints.
 *
 * Per Wave 6 §S6.4 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md:
 *   "Copy assistant + translation + tone:
 *      - 4 tone variants (shorter/punchier/formal/casual)
 *      - Translation dialog with glossary + RTL flip for ar/ur."
 *
 * Exposes typed wrappers for:
 *   - POST /v1/ai/copy/improve
 *   - POST /v1/ai/copy/translate
 *
 * Today the implementation returns deterministic offline fallbacks so
 * the UI is fully verifiable without the AI backend. When the
 * `ai/copy` worker lands in a later wave, the request bodies and
 * response shapes stay identical — only the implementation swaps.
 */

import type { Locale } from './locale';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CopyTone = 'shorter' | 'punchier' | 'formal' | 'casual';

export interface ImproveCopyRequest {
  /** The selected text in the document. */
  readonly text: string;
  readonly tone: CopyTone;
  /** Optional context — e.g. audience, brand voice notes. */
  readonly context?: string;
}

export interface CopyVariant {
  readonly id: string;
  readonly tone: CopyTone;
  readonly text: string;
  readonly charCount: number;
}

export interface ImproveCopyResult {
  readonly variants: readonly CopyVariant[];
  readonly sourceText: string;
  readonly live: boolean;
}

export type TargetLanguage = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh-CN' | 'ar' | 'ur';

/** Languages that are written right-to-left. */
export const RTL_LANGUAGES: ReadonlySet<TargetLanguage> = new Set(['ar', 'ur']);

export const TARGET_LANGUAGES: ReadonlyArray<TargetLanguage> = [
  'en',
  'es',
  'fr',
  'de',
  'ja',
  'zh-CN',
  'ar',
  'ur',
];

export const TARGET_LANGUAGE_LABELS: Record<TargetLanguage, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  ja: '日本語',
  'zh-CN': '中文 (简体)',
  ar: 'العربية',
  ur: 'اردو',
};

export interface TranslateRequest {
  readonly text: string;
  readonly target: TargetLanguage;
  /** Glossary terms that must be preserved verbatim. */
  readonly glossary?: ReadonlyArray<{ readonly source: string; readonly target: string }>;
  /** Optional brand voice notes to preserve tone across locales. */
  readonly voiceNotes?: string;
}

export interface TranslateResult {
  readonly translatedText: string;
  readonly sourceText: string;
  readonly target: TargetLanguage;
  readonly isRtl: boolean;
  /** Glossary terms that were applied (for the UI to badge). */
  readonly glossaryApplied: readonly string[];
  readonly live: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const TONE_LABELS: Record<CopyTone, string> = {
  shorter: 'Shorter',
  punchier: 'Punchier',
  formal: 'Formal',
  casual: 'Casual',
};

/** Compose a sample variant text deterministically from the source. */
function composeVariant(source: string, tone: CopyTone, salt: string): string {
  const trimmed = source.trim();
  const base = trimmed.length > 0 ? trimmed : 'Your selected text';

  switch (tone) {
    case 'shorter': // Drop redundant trailing words to roughly halve length.
    {
      const half = Math.max(8, Math.ceil(trimmed.length * 0.55));
      return `${base.slice(0, half).trimEnd()}${hash(salt + 'e') % 2 === 0 ? '.' : ''}`;
    }
    case 'punchier': // Capitalize key tokens + add an em dash for emphasis.
    {
      const exclaim = hash(salt + 'p') % 2 === 0 ? '!' : '.';
      const words = base.split(/\s+/);
      if (words.length >= 2) {
        return `${words[0]} \u2014 ${words.slice(1).join(' ')}${exclaim}`;
      }
      return `${base}${exclaim}`;
    }
    case 'formal':
      return base.length > 0 ? `We are pleased to share: ${base}.` : base;
    case 'casual':
      return base.length > 0 ? `Quick take → ${base.toLowerCase()}.` : base;
  }
}

// ---------------------------------------------------------------------------
// improveCopy
// ---------------------------------------------------------------------------

export async function improveCopy(req: ImproveCopyRequest): Promise<ImproveCopyResult> {
  const sourceText = req.text.trim();
  const tones: readonly CopyTone[] = ['shorter', 'punchier', 'formal', 'casual'];
  const seed = hash(sourceText);
  const variants: CopyVariant[] = tones.map((tone, i) => {
    const text = composeVariant(sourceText, tone, `${seed}-${tone}-${i}`);
    return {
      id: `${tone}-${seed.toString(36)}-${i}`,
      tone,
      text,
      charCount: text.length,
    };
  });
  return { variants, sourceText, live: false };
}

/** Bootstrap default — empty variants for any source. */
export const BOOTSTRAP_VARIANTS: readonly CopyVariant[] = [];

export { TONE_LABELS };

/**
 * Compose the dialog's locale from a target language code. Lives here
 * so the UI can also use it (e.g. to reuse the active editor locale).
 */
export function toEditorLocale(target: TargetLanguage): Locale {
  // The editor locale type is the same set; this exists for symmetry.
  return target as Locale;
}

// ---------------------------------------------------------------------------
// translateText
// ---------------------------------------------------------------------------

export async function translateText(req: TranslateRequest): Promise<TranslateResult> {
  const source = req.text.trim();
  const glossaryApplied: string[] = [];
  let translatedText = source;

  // Apply glossary substitutions (longest-first) — case-insensitive source.
  const sortedGlossary = [...(req.glossary ?? [])].sort(
    (a, b) => b.source.length - a.source.length,
  );
  for (const entry of sortedGlossary) {
    if (entry.source.length === 0) continue;
    const pattern = new RegExp(escapeRegex(entry.source), 'gi');
    if (pattern.test(translatedText)) {
      translatedText = translatedText.replace(pattern, entry.target);
      glossaryApplied.push(entry.target);
    }
  }

  // Append a deterministic "[→ target]" stamp so the UI shows that
  // something happened in offline mode without lying about translation.
  const stamp = ` [→ ${req.target}]`;
  if (translatedText.length > 0) {
    translatedText = `${translatedText}${stamp}`;
  } else {
    translatedText = `[Translation ${req.target}]${stamp}`;
  }

  const isRtl = RTL_LANGUAGES.has(req.target);

  return {
    translatedText,
    sourceText: req.text,
    target: req.target,
    isRtl,
    glossaryApplied,
    live: false,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
