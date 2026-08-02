/**
 * @domio/theme — Token resolution engine.
 *
 * Implements the 7-step precedence algorithm from §3.1 of theming-branding.md:
 *   1. Per-slide override (if condition true or no condition)
 *   2. Section override
 *   3. Deck theme
 *   4. Brand context theme
 *   5. Org default theme
 *   6. Alias chain (recursive, cycle-detected)
 *   7. System alias (prefers-color-scheme, forced-colors)
 *   8. Fallback ladder (companion theme → platform fallback → system-default literal)
 *   9. null + WARN_TOKEN_UNRESOLVED
 *
 * Pure and synchronous — no I/O, no network calls.
 */

import type {
  TokenRef,
  TokenValue,
  TokenAlias,
  ResolveScope,
  DeckTokenState,
  ConditionExpr,
  ResolvedToken,
  ResolvedTokenSource,
  ResolvedTokenWarn,
  AliasCycleError,
} from './types.js';
import { ResolveCache, scopeKeyFor } from './cache.js';

// ---------------------------------------------------------------------------
// Default literal for missing brand colors (§3.3)
// ---------------------------------------------------------------------------

const SYSTEM_DEFAULT_COLOR: TokenValue = {
  type: 'color',
  value: { space: 'srgb', channels: [0.533, 0.533, 0.533], alpha: 1 }, // #888888
};

// ---------------------------------------------------------------------------
// System aliases for forced-colors mode (§44)
// ---------------------------------------------------------------------------

const SYSTEM_ALIAS_MAP: Record<string, TokenValue> = {
  'color.system.canvas': { type: 'color', value: { space: 'srgb', channels: [1, 1, 1], alpha: 1 } },
  'color.system.canvasText': { type: 'color', value: { space: 'srgb', channels: [0, 0, 0], alpha: 1 } },
  'color.system.linkText': { type: 'color', value: { space: 'srgb', channels: [0, 0, 1], alpha: 1 } },
  'color.system.buttonText': { type: 'color', value: { space: 'srgb', channels: [0, 0, 0], alpha: 1 } },
};

// ---------------------------------------------------------------------------
// Alias graph helpers
// ---------------------------------------------------------------------------

/** Build an adjacency map from alias edges. */
function buildAliasGraph(edges: readonly TokenAlias[]): Map<TokenRef, TokenRef> {
  const graph = new Map<TokenRef, TokenRef>();
  for (const edge of edges) {
    graph.set(edge.aliasTokenId, edge.targetTokenId);
  }
  return graph;
}

/**
 * Resolve an alias chain with DFS cycle detection.
 * Returns the concrete value if found, or an AliasCycleError.
 */
function resolveAliasChain(
  startRef: TokenRef,
  aliasGraph: Map<TokenRef, TokenRef>,
  lookupFn: (ref: TokenRef) => TokenValue | null,
): TokenValue | AliasCycleError {
  const visited = new Set<TokenRef>();
  let current: TokenRef | undefined = startRef;

  while (current !== undefined) {
    if (visited.has(current)) {
      // Cycle detected — build the cycle chain
      const cycle: TokenRef[] = [current];
      let walker: TokenRef | undefined = aliasGraph.get(current);
      while (walker !== undefined && walker !== current) {
        cycle.push(walker);
        walker = aliasGraph.get(walker);
      }
      cycle.push(current);
      return { code: 'TOKEN_ALIAS_CYCLE', cycle };
    }

    visited.add(current);

    // Try direct lookup first
    const direct = lookupFn(current);
    if (direct !== null) {
      return direct;
    }

    // Follow alias edge
    current = aliasGraph.get(current);
  }

  // Alias chain exhausted without finding a value — return a null-equivalent
  // This case means all aliases resolved to nothing; caller treats it as unresolved.
  return { code: 'TOKEN_ALIAS_CYCLE' as const, cycle: [startRef] };
}

// ---------------------------------------------------------------------------
// System alias evaluation
// ---------------------------------------------------------------------------

function resolveSystemAlias(tokenRef: TokenRef, deckState: DeckTokenState): TokenValue | null {
  // System color aliases (Canvas, CanvasText, etc.) — forced-colors mode
  if (deckState.systemAliases.forcedColors) {
    const forcedVal = SYSTEM_ALIAS_MAP[tokenRef];
    if (forcedVal !== undefined) {
      return forcedVal;
    }
  }

  // prefers-color-scheme dark → dark-specific system tokens
  if (deckState.systemAliases.prefersColorScheme === 'dark') {
    if (tokenRef === 'color.system.canvas') {
      return { type: 'color', value: { space: 'srgb', channels: [0.1, 0.1, 0.1], alpha: 1 } };
    }
    if (tokenRef === 'color.system.canvasText') {
      return { type: 'color', value: { space: 'srgb', channels: [0.95, 0.95, 0.95], alpha: 1 } };
    }
  }

  // Check system aliases regardless (they're always available)
  const systemVal = SYSTEM_ALIAS_MAP[tokenRef];
  if (systemVal !== undefined) {
    return systemVal;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Fallback ladder (§3.3)
// ---------------------------------------------------------------------------

function resolveFallback(
  tokenRef: TokenRef,
  deckState: DeckTokenState,
): { value: TokenValue; source: ResolvedTokenSource; warn: ResolvedTokenWarn } | null {
  // 1. Same tokenId in companion fallback theme (light↔dark pair)
  const companionVal = deckState.companionFallbackTheme.get(tokenRef);
  if (companionVal !== undefined) {
    return { value: companionVal, source: 'companion-fallback', warn: 'WARN_TOKEN_FALLBACK' };
  }

  // 2. Same tokenId in bundled platform fallback
  const platformVal = deckState.platformFallbackTheme.get(tokenRef);
  if (platformVal !== undefined) {
    return { value: platformVal, source: 'platform-fallback', warn: 'WARN_TOKEN_FALLBACK' };
  }

  // 3. System-default literal (#888888 for colors, per §3.3)
  if (tokenRef.startsWith('color.')) {
    return { value: SYSTEM_DEFAULT_COLOR, source: 'system-default-literal', warn: 'WARN_TOKEN_FALLBACK' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helper: type guard for alias objects in override maps
// ---------------------------------------------------------------------------

function isAliasOverride(
  v: TokenValue | (TokenAlias & { conditionExpr?: ConditionExpr }),
): v is TokenAlias & { conditionExpr?: ConditionExpr } {
  return 'aliasTokenId' in v && 'targetTokenId' in v && typeof (v as TokenAlias).aliasTokenId === 'string';
}

// ---------------------------------------------------------------------------
// Core resolve function (§3.1)
// ---------------------------------------------------------------------------

/**
 * Resolve a token reference against a scope and deck state.
 *
 * Implements the exact 7-step precedence from §3.1 of theming-branding.md.
 * Pure and synchronous — no I/O.
 */
export function resolve(
  tokenRef: TokenRef,
  scope: ResolveScope,
  deckState: DeckTokenState,
): ResolvedToken {
  const aliasGraph = buildAliasGraph(deckState.aliasEdges);

  // Helper: resolve an alias value from an override
  function resolveOverrideAlias(
    target: TokenRef,
    fallbackLookup: (ref: TokenRef) => TokenValue | null,
  ): TokenValue | null {
    const resolved = resolveAliasChain(target, aliasGraph, fallbackLookup);
    if ('code' in resolved) {
      return null; // cycle or exhausted
    }
    return resolved;
  }

  // -----------------------------------------------------------------------
  // Step 1: Per-slide override (if condition true or no condition)
  // -----------------------------------------------------------------------
  if (scope.kind === 'slide') {
    const slideOverrides = deckState.perSlideOverrides.get(scope.slideId);
    if (slideOverrides) {
      const override = slideOverrides.get(tokenRef);
      if (override !== undefined) {
        if (isAliasOverride(override) && override.conditionExpr !== undefined) {
          // State-conditional override
          if (deckState.evaluateCondition(override.conditionExpr)) {
            const resolved = resolveOverrideAlias(override.targetTokenId, (ref) => {
              const inSlide = slideOverrides.get(ref);
              if (inSlide !== undefined && !isAliasOverride(inSlide)) return inSlide as TokenValue;
              const inDeck = deckState.deckTheme.get(ref);
              if (inDeck !== undefined) return inDeck;
              const inBrand = deckState.brandContextTheme.get(ref);
              if (inBrand !== undefined) return inBrand;
              const inOrg = deckState.orgDefaultTheme.get(ref);
              if (inOrg !== undefined) return inOrg;
              return null;
            });
            if (resolved !== null) {
              return { tokenId: tokenRef, value: resolved, source: 'override', warn: undefined };
            }
            return { tokenId: tokenRef, value: null, source: 'override', warn: 'WARN_TOKEN_UNRESOLVED' };
          }
          // Condition false — fall through
        } else if (isAliasOverride(override)) {
          const resolved = resolveOverrideAlias(override.targetTokenId, (ref) => {
            const inDeck = deckState.deckTheme.get(ref);
            if (inDeck !== undefined) return inDeck;
            const inBrand = deckState.brandContextTheme.get(ref);
            if (inBrand !== undefined) return inBrand;
            const inOrg = deckState.orgDefaultTheme.get(ref);
            if (inOrg !== undefined) return inOrg;
            return null;
          });
          if (resolved !== null) {
            return { tokenId: tokenRef, value: resolved, source: 'override', warn: undefined };
          }
          return { tokenId: tokenRef, value: null, source: 'override', warn: 'WARN_TOKEN_UNRESOLVED' };
        } else {
          return { tokenId: tokenRef, value: override as TokenValue, source: 'override', warn: undefined };
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 1b: Section override
  // -----------------------------------------------------------------------
  if (scope.kind === 'section') {
    const sectionOverrides = deckState.sectionOverrides.get(scope.sectionId);
    if (sectionOverrides) {
      const override = sectionOverrides.get(tokenRef);
      if (override !== undefined) {
        if (isAliasOverride(override)) {
          const resolved = resolveOverrideAlias(override.targetTokenId, (ref) => {
            const inDeck = deckState.deckTheme.get(ref);
            if (inDeck !== undefined) return inDeck;
            const inBrand = deckState.brandContextTheme.get(ref);
            if (inBrand !== undefined) return inBrand;
            const inOrg = deckState.orgDefaultTheme.get(ref);
            if (inOrg !== undefined) return inOrg;
            return null;
          });
          if (resolved !== null) {
            return { tokenId: tokenRef, value: resolved, source: 'override', warn: undefined };
          }
          return { tokenId: tokenRef, value: null, source: 'override', warn: 'WARN_TOKEN_UNRESOLVED' };
        } else {
          return { tokenId: tokenRef, value: override as TokenValue, source: 'override', warn: undefined };
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 2: Deck theme
  // -----------------------------------------------------------------------
  const deckVal = deckState.deckTheme.get(tokenRef);
  if (deckVal !== undefined) {
    return { tokenId: tokenRef, value: deckVal, source: 'theme', warn: undefined };
  }

  // -----------------------------------------------------------------------
  // Step 3: Brand context theme
  // -----------------------------------------------------------------------
  const brandVal = deckState.brandContextTheme.get(tokenRef);
  if (brandVal !== undefined) {
    return { tokenId: tokenRef, value: brandVal, source: 'brand', warn: undefined };
  }

  // -----------------------------------------------------------------------
  // Step 4: Org default theme
  // -----------------------------------------------------------------------
  const orgVal = deckState.orgDefaultTheme.get(tokenRef);
  if (orgVal !== undefined) {
    return { tokenId: tokenRef, value: orgVal, source: 'org', warn: undefined };
  }

  // -----------------------------------------------------------------------
  // Step 5: Alias chain (recursive, cycle-detected)
  // -----------------------------------------------------------------------
  if (aliasGraph.has(tokenRef)) {
    const resolved = resolveAliasChain(tokenRef, aliasGraph, (ref) => {
      // When resolving alias targets, check all scopes in precedence order
      if (scope.kind === 'slide') {
        const slideOverrides = deckState.perSlideOverrides.get(scope.slideId);
        if (slideOverrides) {
          const override = slideOverrides.get(ref);
          if (override !== undefined && !isAliasOverride(override)) {
            return override as TokenValue;
          }
        }
      }
      if (scope.kind === 'section') {
        const sectionOverrides = deckState.sectionOverrides.get(scope.sectionId);
        if (sectionOverrides) {
          const override = sectionOverrides.get(ref);
          if (override !== undefined && !isAliasOverride(override)) {
            return override as TokenValue;
          }
        }
      }
      const inDeck = deckState.deckTheme.get(ref);
      if (inDeck !== undefined) return inDeck;
      const inBrand = deckState.brandContextTheme.get(ref);
      if (inBrand !== undefined) return inBrand;
      const inOrg = deckState.orgDefaultTheme.get(ref);
      if (inOrg !== undefined) return inOrg;
      return null;
    });

    if ('code' in resolved) {
      return { tokenId: tokenRef, value: null, source: 'alias', warn: 'WARN_TOKEN_UNRESOLVED' };
    }

    return { tokenId: tokenRef, value: resolved, source: 'alias', warn: undefined };
  }

  // -----------------------------------------------------------------------
  // Step 6: System alias (prefers-color-scheme, forced-colors)
  // -----------------------------------------------------------------------
  const systemVal = resolveSystemAlias(tokenRef, deckState);
  if (systemVal !== null) {
    return { tokenId: tokenRef, value: systemVal, source: 'system-alias', warn: undefined };
  }

  // -----------------------------------------------------------------------
  // Step 7: Fallback ladder (§3.3)
  // -----------------------------------------------------------------------
  const fallback = resolveFallback(tokenRef, deckState);
  if (fallback !== null) {
    return { tokenId: tokenRef, value: fallback.value, source: fallback.source, warn: fallback.warn };
  }

  // -----------------------------------------------------------------------
  // Unresolved
  // -----------------------------------------------------------------------
  return { tokenId: tokenRef, value: null, source: 'org', warn: 'WARN_TOKEN_UNRESOLVED' };
}

// ---------------------------------------------------------------------------
// resolveWithCache — cached wrapper around resolve()
// ---------------------------------------------------------------------------

const globalCache = new ResolveCache();

export function resolveWithCache(
  tokenRef: TokenRef,
  scope: ResolveScope,
  deckState: DeckTokenState,
): ResolvedToken {
  const sk = scopeKeyFor(scope);
  const cached = globalCache.get(sk, tokenRef);
  if (cached !== undefined) {
    return ResolveCache.toResolved(tokenRef, cached);
  }

  const result = resolve(tokenRef, scope, deckState);
  globalCache.set(sk, tokenRef, {
    value: result.value,
    source: result.source,
    warn: result.warn,
  });
  return result;
}

export function invalidateCache(scopeKey?: string): void {
  globalCache.invalidate(scopeKey);
}
