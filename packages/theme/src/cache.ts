/**
 * Leaf-value cache for token resolution.
 *
 * Cache key: (scopeKey, tokenRef).
 * The service layer must call invalidate() on token/theme/kit/override changes.
 */

import type { TokenRef, TokenValue, ResolvedToken, ResolvedTokenSource, ResolvedTokenWarn } from './types.js';

export interface CacheEntry {
  readonly value: TokenValue | null;
  readonly source: ResolvedTokenSource;
  readonly warn: ResolvedTokenWarn;
}

/**
 * Build a scope key string from the scope shape for cache-key purposes.
 * Two scopes of the same kind and same id produce the same key.
 */
export function scopeKeyFor(scope: { kind: string; slideId?: string; sectionId?: string }): string {
  switch (scope.kind) {
    case 'slide':
      return `slide:${scope.slideId}`;
    case 'section':
      return `section:${scope.sectionId}`;
    default:
      return scope.kind;
  }
}

export class ResolveCache {
  private cache = new Map<string, CacheEntry>();

  private static key(scopeKey: string, tokenRef: TokenRef): string {
    return `${scopeKey}::${tokenRef}`;
  }

  get(scopeKey: string, tokenRef: TokenRef): CacheEntry | undefined {
    return this.cache.get(ResolveCache.key(scopeKey, tokenRef));
  }

  set(scopeKey: string, tokenRef: TokenRef, entry: CacheEntry): void {
    this.cache.set(ResolveCache.key(scopeKey, tokenRef), entry);
  }

  /**
   * Invalidate the cache.
   * - No args: clear everything.
   * - With scopeKey: clear only entries for that scope.
   */
  invalidate(scopeKey?: string): void {
    if (scopeKey === undefined) {
      this.cache.clear();
      return;
    }
    const prefix = `${scopeKey}::`;
    for (const k of this.cache.keys()) {
      if (k.startsWith(prefix)) {
        this.cache.delete(k);
      }
    }
  }

  /** Convert a CacheEntry to a ResolvedToken. */
  static toResolved(tokenId: TokenRef, entry: CacheEntry): ResolvedToken {
    return { tokenId, value: entry.value, source: entry.source, warn: entry.warn };
  }
}
