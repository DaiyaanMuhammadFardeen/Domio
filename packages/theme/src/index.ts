/**
 * @domio/theme — Design token resolution engine.
 *
 * Pure, synchronous, no I/O. The load-bearing resolve() that every
 * rendering subsystem calls.
 *
 * Re-exports:
 * - Types (TokenValue, TokenRef, ResolveScope, DeckTokenState, etc.)
 * - resolve() — the core 7-step precedence algorithm
 * - resolveWithCache() — cached wrapper
 * - invalidateCache() — cache invalidation API
 * - resolveMany() — batch resolution
 * - findReferrers() — referrer search for deletion blocker
 * - computeInheritanceChain() — inheritance inspector
 * - computeThemeDiff() — theme diff computation
 */

// Types
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
  TokenRef,
  ResolveScope,
  ConditionExpr,
  SlideElementRef,
  DeckTokenState,
  ResolvedToken,
  ResolvedTokenSource,
  ResolvedTokenWarn,
  AliasCycleError,
  FindReferrersResult,
  InheritanceChainEntry,
  ThemeDiffEntry,
} from './types.js';

// Core resolution
export { resolve, resolveWithCache, invalidateCache } from './resolve.js';

// Batch resolution
export { resolveMany } from './batch.js';
export type { ResolveManyResult } from './batch.js';

// Referrer search
export { findReferrers } from './find-referrers.js';

// Inheritance inspector
export { computeInheritanceChain } from './compute-inheritance-chain.js';

// Theme diff
export { computeThemeDiff } from './compute-theme-diff.js';

// Cache utilities
export { ResolveCache, scopeKeyFor } from './cache.js';
