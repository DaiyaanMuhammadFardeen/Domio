/**
 * @domio/theme — Type definitions for the token resolution engine.
 *
 * Token value shapes are re-exported from the canonical @domio/tokens package
 * (single source of truth). Engine-specific types are defined locally.
 */

// ---------------------------------------------------------------------------
// Import canonical token types from @domio/tokens, re-export with clean names
// ---------------------------------------------------------------------------

import type {
  TokenColor,
  TokenDimension,
  TokenTimeDuration,
  TokenTypography,
  TokenShadow,
  TokenMotion,
  TokenContent,
  TokenValue,
  TokenDeprecated,
  TokenResolved,
  TokenAlias,
} from '@domio/tokens';

export type {
  TokenColor,
  TokenDimension,
  TokenTimeDuration,
  TokenTypography,
  TokenShadow,
  TokenMotion,
  TokenContent,
  TokenValue,
  TokenDeprecated,
  TokenResolved,
  TokenAlias,
};

// ---------------------------------------------------------------------------
// Engine-specific types
// ---------------------------------------------------------------------------

/** A string reference like 'color.brand.primary'. */
export type TokenRef = string;

// ---------------------------------------------------------------------------
// Resolve scope (the 5 precedence probing levels)
// ---------------------------------------------------------------------------

export type ResolveScope =
  | { readonly kind: 'slide'; readonly slideId: string }
  | { readonly kind: 'section'; readonly sectionId: string }
  | { readonly kind: 'deck' }
  | { readonly kind: 'brand' }
  | { readonly kind: 'org' }
  | { readonly kind: 'theme' };

// ---------------------------------------------------------------------------
// Override expression (state-conditional)
// ---------------------------------------------------------------------------

export interface ConditionExpr {
  readonly variableId: string;
  readonly operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  readonly value: string | number | boolean;
}

// ---------------------------------------------------------------------------
// Per-slide element index (for findReferrers)
// ---------------------------------------------------------------------------

export interface SlideElementRef {
  readonly elementId: string;
  readonly tokenRefs: readonly TokenRef[];
}

// ---------------------------------------------------------------------------
// DeckTokenState — the full context for resolution
// ---------------------------------------------------------------------------

export interface DeckTokenState {
  /** Per-slide partial token overrides (may include conditionExpr for state-conditional). */
  readonly perSlideOverrides: ReadonlyMap<
    string,
    ReadonlyMap<TokenRef, TokenValue | (TokenAlias & { conditionExpr?: ConditionExpr })>
  >;

  /** Per-section partial token overrides. */
  readonly sectionOverrides: ReadonlyMap<string, ReadonlyMap<TokenRef, TokenValue | TokenAlias>>;

  /** Deck-level theme — resolved token map (tokenRef → concrete value). */
  readonly deckTheme: ReadonlyMap<TokenRef, TokenValue>;

  /** Brand context theme — resolved token map. */
  readonly brandContextTheme: ReadonlyMap<TokenRef, TokenValue>;

  /** Org default theme — resolved token map. */
  readonly orgDefaultTheme: ReadonlyMap<TokenRef, TokenValue>;

  /** Alias edges for alias-chain resolution. */
  readonly aliasEdges: readonly TokenAlias[];

  /** System aliases: prefers-color-scheme → 'dark'|'light', forcedColors flag. */
  readonly systemAliases: {
    readonly prefersColorScheme: 'dark' | 'light';
    readonly forcedColors: boolean;
  };

  /** Platform fallback theme (bundled in editor binary). */
  readonly platformFallbackTheme: ReadonlyMap<TokenRef, TokenValue>;

  /** Companion theme for fallback (light↔dark pair). */
  readonly companionFallbackTheme: ReadonlyMap<TokenRef, TokenValue>;

  /**
   * Evaluate a condition expression against runtime state.
   * For unit tests, pass a stub that checks a provided variable map.
   */
  readonly evaluateCondition: (expr: ConditionExpr) => boolean;

  /** Slide elements index: slideId → element refs (for findReferrers). */
  readonly slideElements: ReadonlyMap<string, readonly SlideElementRef[]>;
}

// ---------------------------------------------------------------------------
// Resolved token result
// ---------------------------------------------------------------------------

export type ResolvedTokenSource =
  | 'override'
  | 'theme'
  | 'brand'
  | 'org'
  | 'alias'
  | 'platform-fallback'
  | 'companion-fallback'
  | 'system-alias'
  | 'system-default-literal';

export type ResolvedTokenWarn = 'WARN_TOKEN_UNRESOLVED' | 'WARN_TOKEN_FALLBACK' | undefined;

export interface ResolvedToken {
  readonly tokenId: TokenRef;
  readonly value: TokenValue | null;
  readonly source: ResolvedTokenSource;
  readonly warn: ResolvedTokenWarn;
}

// ---------------------------------------------------------------------------
// Alias cycle error (discriminated error for 409 TOKEN_ALIAS_CYCLE)
// ---------------------------------------------------------------------------

export interface AliasCycleError {
  readonly code: 'TOKEN_ALIAS_CYCLE';
  readonly cycle: readonly TokenRef[];
}

// ---------------------------------------------------------------------------
// FindReferrers result
// ---------------------------------------------------------------------------

export interface FindReferrersResult {
  readonly count: number;
  readonly sampleReferrers: readonly string[];
}

// ---------------------------------------------------------------------------
// Inheritance chain entry
// ---------------------------------------------------------------------------

export interface InheritanceChainEntry {
  readonly level: string;
  readonly value: TokenValue | null;
  readonly source: ResolvedTokenSource | null;
}

// ---------------------------------------------------------------------------
// Theme diff entry
// ---------------------------------------------------------------------------

export interface ThemeDiffEntry {
  readonly tokenId: TokenRef;
  readonly changed: boolean;
  readonly valueA: TokenValue | null;
  readonly valueB: TokenValue | null;
}
