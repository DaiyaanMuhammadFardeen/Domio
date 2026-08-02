/**
 * @domio/theme — Batch token resolution.
 *
 * Used by the renderer bulk-fetch and the < 5 ms batch DoD.
 * Internally cached via resolveWithCache; returns a map + aggregated warnings.
 */

import type {
  TokenRef,
  DeckTokenState,
  ResolveScope,
  ResolvedToken,
  ResolvedTokenWarn,
} from './types.js';
import { resolveWithCache } from './resolve.js';

export interface ResolveManyResult {
  /** TokenRef → ResolvedToken map. */
  readonly resolved: ReadonlyMap<TokenRef, ResolvedToken>;
  /** Aggregated warnings: list of (tokenRef, warn) pairs. */
  readonly warnings: readonly { tokenId: TokenRef; warn: NonNullable<ResolvedTokenWarn> }[];
  /** Total tokens resolved. */
  readonly count: number;
  /** Number that were unresolved (warn = WARN_TOKEN_UNRESOLVED). */
  readonly unresolvedCount: number;
  /** Number that fell back (warn = WARN_TOKEN_FALLBACK). */
  readonly fallbackCount: number;
}

/**
 * Resolve many token references in one call.
 * Internally uses the same cache as resolveWithCache.
 */
export function resolveMany(
  tokenRefs: readonly TokenRef[],
  scope: ResolveScope,
  deckState: DeckTokenState,
): ResolveManyResult {
  const resolved = new Map<TokenRef, ResolvedToken>();
  const warnings: { tokenId: TokenRef; warn: NonNullable<ResolvedTokenWarn> }[] = [];
  let unresolvedCount = 0;
  let fallbackCount = 0;

  for (const tokenRef of tokenRefs) {
    const result = resolveWithCache(tokenRef, scope, deckState);
    resolved.set(tokenRef, result);

    if (result.warn !== undefined) {
      warnings.push({ tokenId: tokenRef, warn: result.warn });
      if (result.warn === 'WARN_TOKEN_UNRESOLVED') unresolvedCount++;
      if (result.warn === 'WARN_TOKEN_FALLBACK') fallbackCount++;
    }
  }

  return {
    resolved,
    warnings,
    count: tokenRefs.length,
    unresolvedCount,
    fallbackCount,
  };
}
