/**
 * @domio/text-normalize — Unicode-aware normalization for audience input.
 *
 * Phase 16 W5 (word cloud + Q&A). Used by:
 *   - word-cloud-engine — bucket keys for aggregation
 *   - qa-engine         — duplicate-question clustering
 *
 * Behavior:
 *   - NFKC normalises compatibility forms (e.g. ﬁ → fi)
 *   - lowercases (locale-insensitive; CJK has no case)
 *   - collapses internal whitespace
 *   - strips leading/trailing whitespace
 *   - removes zero-width and bidi-control codepoints
 *   - trims punctuation that shouldn't anchor a bucket (leading/trailing
 *     "?" / "!" / "." are dropped, but inner punctuation is preserved
 *     so questions and exclamation phrases still differ).
 *
 * Locale handling is intentionally minimal — we rely on the stopword
 * lists to cover the three target languages (en, bn, es) and don't
 * attempt full morphological stemming. The point is bucket stability,
 * not linguistic correctness.
 */

const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF]/g;
const BIDI_CONTROL_RE = /[\u202A-\u202E\u2066-\u2069]/g;

export interface NormalizeOptions {
  /** Languages whose stopwords should be removed. Default [] (no removal). */
  readonly stopwordLocales?: ReadonlyArray<'en' | 'bn' | 'es'>;
  /** When true, lower-case the input (default true). */
  readonly caseFold?: boolean;
  /** Maximum output length. Default 200 chars. */
  readonly maxLength?: number;
  /** When true, strip leading/trailing punctuation. Default true. */
  readonly trimPunctuation?: boolean;
}

export function normalize(input: string, opts: NormalizeOptions = {}): string {
  if (typeof input !== 'string') return '';
  const maxLength = opts.maxLength ?? 200;
  const trimPunctuation = opts.trimPunctuation ?? true;
  const caseFold = opts.caseFold ?? true;

  let text = input.normalize('NFKC');
  text = text.replace(ZERO_WIDTH_RE, '');
  text = text.replace(BIDI_CONTROL_RE, '');
  if (caseFold) text = text.toLowerCase();
  text = text.replace(/\s+/g, ' ').trim();
  if (trimPunctuation) {
    text = text.replace(/^[\s.,;:!?¿¡'"`~()\[\]{}]+/u, '');
    text = text.replace(/[\s.,;:!?¿¡'"`~()\[\]{}]+$/u, '');
  }
  if (text.length > maxLength) text = text.slice(0, maxLength);
  return text;
}

/** Tokenize a normalized string into word-like tokens. CJK ideographs
 *  are split per character (no spaces) so they can still match across
 *  audience input. */
export function tokenize(normalized: string): string[] {
  if (!normalized) return [];
  const out: string[] = [];
  let buf = '';
  for (const ch of normalized) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK Unified Ideographs (incl. ext A, B), Hiragana, Katakana,
    // Hangul syllables.
    const isCjk =
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x20000 && code <= 0x2a6df) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af);
    if (isCjk) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      out.push(ch);
      continue;
    }
    // Bengali mark characters (virama + vowel signs) are not matched
    // by \p{L} alone — treat any code point in the Bengali block as
    // part of the current token.
    const isBengaliMark =
      (code >= 0x0980 && code <= 0x09ff) ||
      (code >= 0x0900 && code <= 0x097f);
    if (/\p{L}|\p{N}/u.test(ch) || isBengaliMark) {
      buf += ch;
    } else if (buf) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** Returns a bucket key suitable for grouping equivalent inputs.
 *  The first char of every word is capitalised; the rest are not. */
export function bucketKey(normalized: string): string {
  if (!normalized) return '';
  const tokens = tokenize(normalized);
  if (tokens.length === 0) return '';
  return tokens
    .map((t) => (t.length === 0 ? '' : t.charAt(0).toUpperCase() + t.slice(1)))
    .join('');
}