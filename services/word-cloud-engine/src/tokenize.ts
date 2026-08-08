/**
 * @domio/word-cloud-engine — tokenization.
 *
 * Minimal NFKC + lowercase + stopword strip + max-len truncation. The
 * production version delegates to @domio/text-normalize, but for the
 * engine we keep a self-contained impl so the engine can be unit-tested
 * without a heavy dependency.
 */

export interface TokenizeOptions {
  readonly stopwords: ReadonlyArray<string>;
  readonly max_chars: number;
}

const WORD_RE = /[\p{L}\p{N}]+/gu;

export function tokenize(raw: string, opts: TokenizeOptions): string[] {
  if (raw.length > opts.max_chars) {
    raw = raw.slice(0, opts.max_chars);
  }
  const normalized = raw.normalize('NFKC').toLowerCase();
  const stop = new Set(opts.stopwords.map((s) => s.normalize('NFKC').toLowerCase()));
  const out: string[] = [];
  for (const match of normalized.matchAll(WORD_RE)) {
    const w = match[0];
    if (!w) continue;
    if (stop.has(w)) continue;
    out.push(w);
  }
  return out;
}
