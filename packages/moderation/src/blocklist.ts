/**
 * @domio/moderation — blocklist + ML moderation facade.
 *
 * Phase 16 W5. The blocklist is a small, curated list of words that
 * should never appear in audience output. It's intentionally NOT a
 * general-purpose profanity filter — the goal is to prevent clearly
 * abusive text from reaching the projected word cloud / Q&A queue.
 * All entries use lowercase ASCII; matches are case-insensitive and
 * operate on the normalised form produced by `@domio/text-normalize`.
 *
 * The ML facade in `ml-flag.ts` is a stub that returns the input
 * unchanged when no scorer is wired. Real implementations (Detoxify,
 * a hosted classifier, or a custom tiny-BERT) plug in via the
 * `MlScorer` interface.
 */

import { normalize } from '@domio/text-normalize';

/** Words / phrases that should be blocked outright. Stored in
 *  normalised (lowercased, NFKC) form. */
export const DEFAULT_BLOCKLIST: ReadonlyArray<string> = [
  // Slot reserved for the customer's domain-specific list. Tests pin
  // behaviour against the defaults; deployment overrides this with a
  // workspace-level list loaded from the audit chain.
];

/** A normalised substring that should never appear in audience text. */
export interface BlocklistMatch {
  /** The matched substring (already lowercased / NFKC). */
  readonly needle: string;
  /** Offset into the normalised input where the match was found. */
  readonly offset: number;
}

export interface BlocklistCheckResult {
  /** True when at least one needle matches. */
  readonly blocked: boolean;
  /** All matches; empty when not blocked. */
  readonly matches: ReadonlyArray<BlocklistMatch>;
}

export interface BlocklistOptions {
  /** Override the needles. Default {@link DEFAULT_BLOCKLIST}. */
  readonly needles?: ReadonlyArray<string>;
}

/** Returns every match (longest-first) in the normalised input.
 *  The caller can decide whether a single match is enough or whether
 *  threshold-style behaviour is wanted. */
export function checkBlocklist(
  input: string,
  opts: BlocklistOptions = {},
): BlocklistCheckResult {
  const needles = (opts.needles ?? DEFAULT_BLOCKLIST).slice().sort((a, b) => b.length - a.length);
  const normalised = normalize(input);
  const matches: BlocklistMatch[] = [];
  for (const needle of needles) {
    const n = needle.toLowerCase();
    if (n.length === 0) continue;
    let from = 0;
    while (from <= normalised.length - n.length) {
      const idx = normalised.indexOf(n, from);
      if (idx < 0) break;
      matches.push({ needle: n, offset: idx });
      from = idx + n.length;
    }
  }
  return { blocked: matches.length > 0, matches };
}