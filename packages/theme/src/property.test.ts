/**
 * @domio/theme — Property tests for the token resolution engine.
 *
 * Verifies: for any randomly generated precedence chain (levels present/absent,
 * alias graph acyclic), resolution converges to SOME value or null with a source —
 * no exceptions, no infinite loops, and result is deterministic across repeated calls.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type {
  TokenValue,
  TokenRef,
  TokenAlias,
  ResolveScope,
  DeckTokenState,
} from './types.js';
import { resolve, resolveWithCache, invalidateCache } from './resolve.js';

// ---------------------------------------------------------------------------
// Helpers: arbitraries for fast-check
// ---------------------------------------------------------------------------

const tokenRefArb = fc.constantFrom(
  'color.brand.primary',
  'color.brand.secondary',
  'color.brand.accent',
  'color.bg.surface',
  'color.text.body',
);

const tokenValueArb: fc.Arbitrary<TokenValue> = fc.oneof(
  fc.record({
    type: fc.constant<'color'>('color'),
    value: fc.record({
      space: fc.constant<'srgb'>('srgb'),
      channels: fc.array(fc.float({ min: 0, max: 1 }), { minLength: 3, maxLength: 3 }),
      alpha: fc.float({ min: 0, max: 1 }),
    }),
  }),
  fc.record({
    type: fc.constant<'dimension'>('dimension'),
    value: fc.record({
      value: fc.float({ min: 0, max: 100 }),
      unit: fc.constantFrom<'px' | 'rem'>('px', 'rem'),
    }),
  }),
  fc.record({
    type: fc.constant<'content'>('content'),
    value: fc.string({ maxLength: 20 }),
  }),
);

const scopeArb: fc.Arbitrary<ResolveScope> = fc.oneof(
  fc.constant<ResolveScope>({ kind: 'deck' }),
  fc.constant<ResolveScope>({ kind: 'brand' }),
  fc.constant<ResolveScope>({ kind: 'org' }),
  fc.constant<ResolveScope>({ kind: 'theme' }),
  fc.record({ kind: fc.constant<'slide'>('slide'), slideId: fc.string({ maxLength: 10 }) }),
  fc.record({ kind: fc.constant<'section'>('section'), sectionId: fc.string({ maxLength: 10 }) }),
);

const VALID_SOURCES = [
  'override', 'theme', 'brand', 'org', 'alias',
  'platform-fallback', 'companion-fallback', 'system-alias', 'system-default-literal',
] as const;

/** Build a DeckTokenState from generated components. */
function buildDeckState(
  deckTheme: Map<TokenRef, TokenValue>,
  brandTheme: Map<TokenRef, TokenValue>,
  orgTheme: Map<TokenRef, TokenValue>,
  aliasEdges: TokenAlias[],
): DeckTokenState {
  return {
    perSlideOverrides: new Map(),
    sectionOverrides: new Map(),
    deckTheme,
    brandContextTheme: brandTheme,
    orgDefaultTheme: orgTheme,
    aliasEdges,
    systemAliases: { prefersColorScheme: 'light', forcedColors: false },
    platformFallbackTheme: new Map(),
    companionFallbackTheme: new Map(),
    evaluateCondition: () => false,
    slideElements: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('property: resolve converges for any precedence chain', () => {
  beforeEach(() => {
    invalidateCache();
  });

  it('resolution always returns a result (value or null) with a valid source — no exceptions', () => {
    invalidateCache();

    fc.assert(
      fc.property(
        fc.array(fc.tuple(tokenRefArb, tokenValueArb), { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(tokenRefArb, tokenValueArb), { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(tokenRefArb, tokenValueArb), { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(tokenRefArb, tokenRefArb), { maxLength: 4 }),
        scopeArb,
        tokenRefArb,
        (
          deckPairs: Array<[TokenRef, TokenValue]>,
          brandPairs: Array<[TokenRef, TokenValue]>,
          orgPairs: Array<[TokenRef, TokenValue]>,
          aliasPairs: Array<[TokenRef, TokenRef]>,
          scope: ResolveScope,
          tokenRef: TokenRef,
        ) => {
          const deckTheme = new Map<TokenRef, TokenValue>(deckPairs);
          const brandTheme = new Map<TokenRef, TokenValue>(brandPairs);
          const orgTheme = new Map<TokenRef, TokenValue>(orgPairs);
          const aliasEdges: TokenAlias[] = aliasPairs.map(([s, t]) => ({ aliasTokenId: s, targetTokenId: t }));
          const deckState = buildDeckState(deckTheme, brandTheme, orgTheme, aliasEdges);

          // Must not throw
          const result = resolve(tokenRef, scope, deckState);

          // Must have a valid structure
          expect(typeof result.tokenId).toBe('string');
          expect(VALID_SOURCES).toContain(result.source);
          expect(
            result.value === null || (typeof result.value === 'object' && result.value !== null && 'type' in result.value),
          ).toBe(true);
          if (result.warn !== undefined) {
            expect(['WARN_TOKEN_UNRESOLVED', 'WARN_TOKEN_FALLBACK']).toContain(result.warn);
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('resolution is deterministic across repeated calls', () => {
    invalidateCache();

    fc.assert(
      fc.property(
        fc.array(fc.tuple(tokenRefArb, tokenValueArb), { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(tokenRefArb, tokenValueArb), { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(tokenRefArb, tokenValueArb), { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(tokenRefArb, tokenRefArb), { maxLength: 4 }),
        scopeArb,
        tokenRefArb,
        (
          deckPairs: Array<[TokenRef, TokenValue]>,
          brandPairs: Array<[TokenRef, TokenValue]>,
          orgPairs: Array<[TokenRef, TokenValue]>,
          aliasPairs: Array<[TokenRef, TokenRef]>,
          scope: ResolveScope,
          tokenRef: TokenRef,
        ) => {
          const deckTheme = new Map<TokenRef, TokenValue>(deckPairs);
          const brandTheme = new Map<TokenRef, TokenValue>(brandPairs);
          const orgTheme = new Map<TokenRef, TokenValue>(orgPairs);
          const aliasEdges: TokenAlias[] = aliasPairs.map(([s, t]) => ({ aliasTokenId: s, targetTokenId: t }));
          const deckState = buildDeckState(deckTheme, brandTheme, orgTheme, aliasEdges);

          const r1 = resolve(tokenRef, scope, deckState);
          const r2 = resolve(tokenRef, scope, deckState);
          // Deterministic: same inputs → same outputs
          expect(r1.value).toEqual(r2.value);
          expect(r1.source).toBe(r2.source);
          expect(r1.warn).toBe(r2.warn);
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('no infinite loops for any acyclic alias graph', () => {
    invalidateCache();

    fc.assert(
      fc.property(
        fc.array(fc.tuple(tokenRefArb, tokenValueArb), { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(tokenRefArb, tokenRefArb), { maxLength: 4 }),
        tokenRefArb,
        (
          deckPairs: Array<[TokenRef, TokenValue]>,
          aliasPairs: Array<[TokenRef, TokenRef]>,
          tokenRef: TokenRef,
        ) => {
          const deckTheme = new Map<TokenRef, TokenValue>(deckPairs);
          const aliasEdges: TokenAlias[] = aliasPairs.map(([s, t]) => ({ aliasTokenId: s, targetTokenId: t }));
          const deckState = buildDeckState(deckTheme, new Map(), new Map(), aliasEdges);

          const start = Date.now();
          const result = resolve(tokenRef, { kind: 'deck' }, deckState);
          const elapsed = Date.now() - start;

          // Must complete within 100ms (no infinite loop)
          expect(elapsed).toBeLessThan(100);
          // Must have a valid result
          expect(typeof result.tokenId).toBe('string');
          expect(VALID_SOURCES).toContain(result.source);
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('cached resolution matches uncached resolution', () => {
    invalidateCache();

    fc.assert(
      fc.property(
        fc.array(fc.tuple(tokenRefArb, tokenValueArb), { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(tokenRefArb, tokenValueArb), { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(tokenRefArb, tokenValueArb), { minLength: 1, maxLength: 5 }),
        scopeArb,
        tokenRefArb,
        (
          deckPairs: Array<[TokenRef, TokenValue]>,
          brandPairs: Array<[TokenRef, TokenValue]>,
          orgPairs: Array<[TokenRef, TokenValue]>,
          scope: ResolveScope,
          tokenRef: TokenRef,
        ) => {
          invalidateCache();
          const deckTheme = new Map<TokenRef, TokenValue>(deckPairs);
          const brandTheme = new Map<TokenRef, TokenValue>(brandPairs);
          const orgTheme = new Map<TokenRef, TokenValue>(orgPairs);
          const deckState = buildDeckState(deckTheme, brandTheme, orgTheme, []);

          const r1 = resolve(tokenRef, scope, deckState);
          invalidateCache();
          const r2 = resolveWithCache(tokenRef, scope, deckState);

          expect(r1.value).toEqual(r2.value);
          expect(r1.source).toBe(r2.source);
          expect(r1.warn).toBe(r2.warn);
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
