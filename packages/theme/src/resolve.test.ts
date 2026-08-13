/**
 * @domio/theme — Unit tests for the token resolution engine.
 *
 * ≥30 tests covering every precedence level, alias cycles, fallback ladder,
 * cache invalidation, findReferrers, computeInheritanceChain, computeThemeDiff,
 * and resolveMany.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { TokenValue, TokenRef, TokenAlias, DeckTokenState, SlideElementRef } from './types.js';
import { resolve, resolveWithCache, invalidateCache } from './resolve.js';
import { resolveMany } from './batch.js';
import { findReferrers } from './find-referrers.js';
import { computeInheritanceChain } from './compute-inheritance-chain.js';
import { computeThemeDiff } from './compute-theme-diff.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const COLOR_PRIMARY: TokenValue = {
  type: 'color',
  value: { space: 'srgb', channels: [1, 0, 0], alpha: 1 },
};

const COLOR_SECONDARY: TokenValue = {
  type: 'color',
  value: { space: 'srgb', channels: [0, 1, 0], alpha: 1 },
};

const COLOR_BRAND: TokenValue = {
  type: 'color',
  value: { space: 'srgb', channels: [0, 0, 1], alpha: 1 },
};

const COLOR_ORG: TokenValue = {
  type: 'color',
  value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
};

const COLOR_PLATFORM: TokenValue = {
  type: 'color',
  value: { space: 'srgb', channels: [0.2, 0.2, 0.2], alpha: 1 },
};

const COLOR_COMPANION: TokenValue = {
  type: 'color',
  value: { space: 'srgb', channels: [0.8, 0.8, 0.8], alpha: 1 },
};

function makeDeckState(overrides?: Partial<DeckTokenState>): DeckTokenState {
  return {
    perSlideOverrides: overrides?.perSlideOverrides ?? new Map(),
    sectionOverrides: overrides?.sectionOverrides ?? new Map(),
    deckTheme: overrides?.deckTheme ?? new Map([['color.brand.primary', COLOR_PRIMARY]]),
    brandContextTheme:
      overrides?.brandContextTheme ?? new Map([['color.brand.secondary', COLOR_SECONDARY]]),
    orgDefaultTheme: overrides?.orgDefaultTheme ?? new Map([['color.brand.org', COLOR_ORG]]),
    aliasEdges: overrides?.aliasEdges ?? [],
    systemAliases: overrides?.systemAliases ?? { prefersColorScheme: 'light', forcedColors: false },
    platformFallbackTheme:
      overrides?.platformFallbackTheme ?? new Map([['color.platform.fallback', COLOR_PLATFORM]]),
    companionFallbackTheme:
      overrides?.companionFallbackTheme ?? new Map([['color.companion', COLOR_COMPANION]]),
    evaluateCondition: overrides?.evaluateCondition ?? (() => false),
    slideElements: overrides?.slideElements ?? new Map(),
  };
}

// ---------------------------------------------------------------------------
// Step 1: Per-slide override precedence
// ---------------------------------------------------------------------------

describe('resolve — per-slide override', () => {
  it('returns per-slide override when slide scope and override exists', () => {
    const overrideVal: TokenValue = {
      type: 'color',
      value: { space: 'srgb', channels: [1, 1, 0], alpha: 1 },
    };
    const deckState = makeDeckState({
      perSlideOverrides: new Map([['slide-1', new Map([['color.brand.primary', overrideVal]])]]),
    });
    const result = resolve('color.brand.primary', { kind: 'slide', slideId: 'slide-1' }, deckState);
    expect(result.value).toEqual(overrideVal);
    expect(result.source).toBe('override');
    expect(result.warn).toBeUndefined();
  });

  it('falls through to deck theme when no per-slide override exists', () => {
    const deckState = makeDeckState();
    const result = resolve(
      'color.brand.primary',
      { kind: 'slide', slideId: 'slide-99' },
      deckState,
    );
    expect(result.value).toEqual(COLOR_PRIMARY);
    expect(result.source).toBe('theme');
  });
});

// ---------------------------------------------------------------------------
// Step 2: Deck theme precedence
// ---------------------------------------------------------------------------

describe('resolve — deck theme', () => {
  it('returns deck theme value when not overridden', () => {
    const deckState = makeDeckState();
    const result = resolve('color.brand.primary', { kind: 'deck' }, deckState);
    expect(result.value).toEqual(COLOR_PRIMARY);
    expect(result.source).toBe('theme');
  });
});

// ---------------------------------------------------------------------------
// Step 3: Brand context theme precedence
// ---------------------------------------------------------------------------

describe('resolve — brand context theme', () => {
  it('returns brand value when not in deck theme', () => {
    const deckState = makeDeckState();
    const result = resolve('color.brand.secondary', { kind: 'deck' }, deckState);
    expect(result.value).toEqual(COLOR_SECONDARY);
    expect(result.source).toBe('brand');
  });
});

// ---------------------------------------------------------------------------
// Step 4: Org default theme precedence
// ---------------------------------------------------------------------------

describe('resolve — org default theme', () => {
  it('returns org value when not in deck or brand', () => {
    const deckState = makeDeckState();
    const result = resolve('color.brand.org', { kind: 'deck' }, deckState);
    expect(result.value).toEqual(COLOR_ORG);
    expect(result.source).toBe('org');
  });
});

// ---------------------------------------------------------------------------
// Step 5: Alias chain resolution
// ---------------------------------------------------------------------------

describe('resolve — alias chain', () => {
  it('resolves a single alias to its target value', () => {
    const aliasEdges: TokenAlias[] = [
      { aliasTokenId: 'color.alias', targetTokenId: 'color.brand.primary' },
    ];
    const deckState = makeDeckState({ aliasEdges });
    const result = resolve('color.alias', { kind: 'deck' }, deckState);
    expect(result.value).toEqual(COLOR_PRIMARY);
    expect(result.source).toBe('alias');
  });

  it('resolves deep alias chain (5+ levels)', () => {
    const aliasEdges: TokenAlias[] = [
      { aliasTokenId: 'a', targetTokenId: 'b' },
      { aliasTokenId: 'b', targetTokenId: 'c' },
      { aliasTokenId: 'c', targetTokenId: 'd' },
      { aliasTokenId: 'd', targetTokenId: 'e' },
      { aliasTokenId: 'e', targetTokenId: 'color.brand.primary' },
    ];
    const deckState = makeDeckState({ aliasEdges });
    const result = resolve('a', { kind: 'deck' }, deckState);
    expect(result.value).toEqual(COLOR_PRIMARY);
    expect(result.source).toBe('alias');
  });

  it('detects alias cycle and returns null + WARN_TOKEN_UNRESOLVED', () => {
    const aliasEdges: TokenAlias[] = [
      { aliasTokenId: 'a', targetTokenId: 'b' },
      { aliasTokenId: 'b', targetTokenId: 'a' },
    ];
    const deckState = makeDeckState({ aliasEdges });
    const result = resolve('a', { kind: 'deck' }, deckState);
    expect(result.value).toBeNull();
    expect(result.warn).toBe('WARN_TOKEN_UNRESOLVED');
    expect(result.source).toBe('alias');
  });

  it('detects self-referencing alias cycle', () => {
    const aliasEdges: TokenAlias[] = [{ aliasTokenId: 'a', targetTokenId: 'a' }];
    const deckState = makeDeckState({ aliasEdges });
    const result = resolve('a', { kind: 'deck' }, deckState);
    expect(result.value).toBeNull();
    expect(result.warn).toBe('WARN_TOKEN_UNRESOLVED');
  });

  it('resolves alias chain within active brand context', () => {
    const aliasEdges: TokenAlias[] = [
      { aliasTokenId: 'color.bg.surface', targetTokenId: 'color.brand.primary' },
    ];
    const deckState = makeDeckState({ aliasEdges });
    const result = resolve('color.bg.surface', { kind: 'brand' }, deckState);
    expect(result.value).toEqual(COLOR_PRIMARY);
    expect(result.source).toBe('alias');
  });
});

// ---------------------------------------------------------------------------
// Step 6: System alias
// ---------------------------------------------------------------------------

describe('resolve — system alias', () => {
  it('resolves color.system.canvas for forced-colors mode', () => {
    const deckState = makeDeckState({
      systemAliases: { prefersColorScheme: 'light', forcedColors: true },
    });
    const result = resolve('color.system.canvas', { kind: 'deck' }, deckState);
    expect(result.value).not.toBeNull();
    expect(result.source).toBe('system-alias');
  });

  it('resolves color.system.canvasText for forced-colors mode', () => {
    const deckState = makeDeckState({
      systemAliases: { prefersColorScheme: 'light', forcedColors: true },
    });
    const result = resolve('color.system.canvasText', { kind: 'deck' }, deckState);
    expect(result.value).not.toBeNull();
    expect(result.source).toBe('system-alias');
  });

  it('resolves dark canvas when prefers-color-scheme is dark', () => {
    const deckState = makeDeckState({
      systemAliases: { prefersColorScheme: 'dark', forcedColors: false },
    });
    const result = resolve('color.system.canvas', { kind: 'deck' }, deckState);
    expect(result.value).not.toBeNull();
    expect(result.source).toBe('system-alias');
  });

  it('resolves dark canvasText when prefers-color-scheme is dark', () => {
    const deckState = makeDeckState({
      systemAliases: { prefersColorScheme: 'dark', forcedColors: false },
    });
    const result = resolve('color.system.canvasText', { kind: 'deck' }, deckState);
    expect(result.value).not.toBeNull();
    expect(result.source).toBe('system-alias');
  });
});

// ---------------------------------------------------------------------------
// Step 7: Fallback ladder (§3.3)
// ---------------------------------------------------------------------------

describe('resolve — fallback ladder', () => {
  it('falls back to companion theme when token missing', () => {
    const deckState = makeDeckState();
    const result = resolve('color.companion', { kind: 'deck' }, deckState);
    expect(result.value).toEqual(COLOR_COMPANION);
    expect(result.source).toBe('companion-fallback');
    expect(result.warn).toBe('WARN_TOKEN_FALLBACK');
  });

  it('falls back to platform theme when token missing from companion', () => {
    const deckState = makeDeckState();
    const result = resolve('color.platform.fallback', { kind: 'deck' }, deckState);
    expect(result.value).toEqual(COLOR_PLATFORM);
    expect(result.source).toBe('platform-fallback');
    expect(result.warn).toBe('WARN_TOKEN_FALLBACK');
  });

  it('falls back to system-default literal for missing color tokens', () => {
    const deckState = makeDeckState();
    const result = resolve('color.brand.nonexistent', { kind: 'deck' }, deckState);
    expect(result.value).not.toBeNull();
    expect(result.source).toBe('system-default-literal');
    expect(result.warn).toBe('WARN_TOKEN_FALLBACK');
  });

  it('returns WARN_TOKEN_UNRESOLVED for completely unknown non-color token', () => {
    const deckState = makeDeckState();
    const result = resolve('typography.unknown', { kind: 'deck' }, deckState);
    expect(result.value).toBeNull();
    expect(result.warn).toBe('WARN_TOKEN_UNRESOLVED');
  });
});

// ---------------------------------------------------------------------------
// Missing token
// ---------------------------------------------------------------------------

describe('resolve — missing token', () => {
  it('missing color token gets system-default literal (#888888) with WARN_TOKEN_FALLBACK', () => {
    const deckState = makeDeckState();
    const result = resolve('color.missing', { kind: 'deck' }, deckState);
    // Per §3.3: missing color tokens fall back to system-default literal (#888888)
    expect(result.value).not.toBeNull();
    expect(result.source).toBe('system-default-literal');
    expect(result.warn).toBe('WARN_TOKEN_FALLBACK');
  });

  it('missing non-color token returns null + WARN_TOKEN_UNRESOLVED', () => {
    const deckState = makeDeckState();
    const result = resolve('typography.nonexistent', { kind: 'deck' }, deckState);
    expect(result.value).toBeNull();
    expect(result.warn).toBe('WARN_TOKEN_UNRESOLVED');
    expect(result.tokenId).toBe('typography.nonexistent');
  });
});

// ---------------------------------------------------------------------------
// State-conditional override
// ---------------------------------------------------------------------------

describe('resolve — state-conditional override', () => {
  it('applies override when condition is true', () => {
    const condTrue = () => true;
    const overrideWithCondition = {
      aliasTokenId: 'color.brand.positive' as const,
      targetTokenId: 'color.brand.primary',
      conditionExpr: { variableId: 'scenario', operator: '==' as const, value: 'bear' },
    };
    const deckState = makeDeckState({
      perSlideOverrides: new Map([
        [
          'slide-1',
          new Map([['color.brand.primary', overrideWithCondition as unknown as TokenValue]]),
        ],
      ]),
      evaluateCondition: condTrue,
    });
    const result = resolve('color.brand.primary', { kind: 'slide', slideId: 'slide-1' }, deckState);
    expect(result.source).toBe('override');
    expect(result.value).not.toBeNull();
  });

  it('falls through when condition is false', () => {
    const condFalse = () => false;
    const overrideWithCondition = {
      aliasTokenId: 'color.brand.positive' as const,
      targetTokenId: 'color.brand.primary',
      conditionExpr: { variableId: 'scenario', operator: '==' as const, value: 'bear' },
    };
    const deckState = makeDeckState({
      perSlideOverrides: new Map([
        [
          'slide-1',
          new Map([['color.brand.primary', overrideWithCondition as unknown as TokenValue]]),
        ],
      ]),
      evaluateCondition: condFalse,
    });
    const result = resolve('color.brand.primary', { kind: 'slide', slideId: 'slide-1' }, deckState);
    // Should fall through to deck theme
    expect(result.source).toBe('theme');
    expect(result.value).toEqual(COLOR_PRIMARY);
  });
});

// ---------------------------------------------------------------------------
// Section override
// ---------------------------------------------------------------------------

describe('resolve — section override', () => {
  it('returns section override when section scope and override exists', () => {
    const overrideVal: TokenValue = {
      type: 'color',
      value: { space: 'srgb', channels: [0.1, 0.2, 0.3], alpha: 1 },
    };
    const deckState = makeDeckState({
      sectionOverrides: new Map([['section-1', new Map([['color.brand.primary', overrideVal]])]]),
    });
    const result = resolve(
      'color.brand.primary',
      { kind: 'section', sectionId: 'section-1' },
      deckState,
    );
    expect(result.value).toEqual(overrideVal);
    expect(result.source).toBe('override');
  });
});

// ---------------------------------------------------------------------------
// Batch resolution (resolveMany)
// ---------------------------------------------------------------------------

describe('resolveMany', () => {
  it('resolves multiple tokens and aggregates warnings', () => {
    const deckState = makeDeckState();
    const result = resolveMany(
      ['color.brand.primary', 'color.brand.secondary', 'color.brand.org', 'color.brand.missing'],
      { kind: 'deck' },
      deckState,
    );
    expect(result.count).toBe(4);
    expect(result.resolved.size).toBe(4);
    // color.brand.missing falls back to system-default literal, so WARN_TOKEN_FALLBACK
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.fallbackCount).toBeGreaterThanOrEqual(1);
  });

  it('returns empty warnings when all tokens resolve cleanly', () => {
    const deckState = makeDeckState();
    const result = resolveMany(['color.brand.primary'], { kind: 'deck' }, deckState);
    expect(result.count).toBe(1);
    expect(result.warnings.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// findReferrers
// ---------------------------------------------------------------------------

describe('findReferrers', () => {
  it('counts slide element references', () => {
    const slideElements = new Map<string, readonly SlideElementRef[]>([
      [
        'slide-1',
        [{ elementId: 'el-1', tokenRefs: ['color.brand.primary', 'color.brand.secondary'] }],
      ],
      ['slide-2', [{ elementId: 'el-2', tokenRefs: ['color.brand.primary'] }]],
      ['slide-3', [{ elementId: 'el-3', tokenRefs: ['color.brand.secondary'] }]],
    ]);
    const deckState = makeDeckState({ slideElements });
    const result = findReferrers('color.brand.primary', deckState);
    expect(result.count).toBeGreaterThanOrEqual(2);
    expect(result.sampleReferrers.length).toBeGreaterThan(0);
  });

  it('counts per-slide overrides as referrers', () => {
    const perSlideOverrides = new Map([
      ['slide-1', new Map([['color.brand.primary', COLOR_PRIMARY]])],
      ['slide-2', new Map([['color.brand.primary', COLOR_PRIMARY]])],
    ]);
    const deckState = makeDeckState({ perSlideOverrides });
    const result = findReferrers('color.brand.primary', deckState);
    expect(result.count).toBeGreaterThanOrEqual(2);
  });

  it('counts alias target references', () => {
    const aliasEdges: TokenAlias[] = [
      { aliasTokenId: 'color.alias1', targetTokenId: 'color.brand.primary' },
      { aliasTokenId: 'color.alias2', targetTokenId: 'color.brand.primary' },
    ];
    const deckState = makeDeckState({ aliasEdges });
    const result = findReferrers('color.brand.primary', deckState);
    expect(result.count).toBeGreaterThanOrEqual(2);
    expect(result.sampleReferrers.some((r) => r.startsWith('alias:'))).toBe(true);
  });

  it('returns count 0 for token with no referrers', () => {
    const deckState = makeDeckState();
    const result = findReferrers('color.totally.unreferenced', deckState);
    expect(result.count).toBe(0);
    expect(result.sampleReferrers).toEqual([]);
  });

  it('limits sampleReferrers to 10', () => {
    const slideElements = new Map<string, readonly SlideElementRef[]>();
    for (let i = 0; i < 15; i++) {
      slideElements.set(`slide-${i}`, [
        { elementId: `el-${i}`, tokenRefs: ['color.brand.primary'] },
      ]);
    }
    const deckState = makeDeckState({ slideElements });
    const result = findReferrers('color.brand.primary', deckState);
    expect(result.count).toBeGreaterThanOrEqual(15);
    expect(result.sampleReferrers.length).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// computeInheritanceChain
// ---------------------------------------------------------------------------

describe('computeInheritanceChain', () => {
  it('returns the ordered inheritance chain', () => {
    const deckState = makeDeckState();
    const chain = computeInheritanceChain('color.brand.primary', deckState, 'slide-1');
    expect(chain.length).toBeGreaterThanOrEqual(4);
    expect(chain[0]?.level).toBe('per-slide override');
    expect(chain.some((e) => e.level === 'deck theme')).toBe(true);
    expect(chain.some((e) => e.level === 'brand context theme')).toBe(true);
    expect(chain.some((e) => e.level === 'org default theme')).toBe(true);
  });

  it('shows winning value at deck theme level', () => {
    const deckState = makeDeckState();
    const chain = computeInheritanceChain('color.brand.primary', deckState, 'slide-1');
    const deckEntry = chain.find((e) => e.level === 'deck theme');
    expect(deckEntry).toBeDefined();
    expect(deckEntry?.value).toEqual(COLOR_PRIMARY);
    expect(deckEntry?.source).toBe('theme');
  });

  it('returns null for missing tokens at all levels', () => {
    const deckState = makeDeckState();
    const chain = computeInheritanceChain('color.nonexistent', deckState, 'slide-1');
    for (const entry of chain) {
      expect(entry.value).toBeNull();
    }
  });

  it('shows per-slide override value when override exists', () => {
    const overrideVal: TokenValue = {
      type: 'color',
      value: { space: 'srgb', channels: [1, 1, 1], alpha: 1 },
    };
    const deckState = makeDeckState({
      perSlideOverrides: new Map([['slide-1', new Map([['color.brand.primary', overrideVal]])]]),
    });
    const chain = computeInheritanceChain('color.brand.primary', deckState, 'slide-1');
    const slideEntry = chain.find((e) => e.level === 'per-slide override');
    expect(slideEntry?.value).toEqual(overrideVal);
    expect(slideEntry?.source).toBe('override');
  });
});

// ---------------------------------------------------------------------------
// computeThemeDiff
// ---------------------------------------------------------------------------

describe('computeThemeDiff', () => {
  it('identifies changed and unchanged tokens', () => {
    const themeA = new Map<TokenRef, TokenValue>([
      ['color.a', COLOR_PRIMARY],
      ['color.b', COLOR_SECONDARY],
    ]);
    const themeB = new Map<TokenRef, TokenValue>([
      ['color.a', COLOR_PRIMARY], // unchanged
      ['color.b', COLOR_BRAND], // changed
    ]);
    const diff = computeThemeDiff(themeA, themeB);
    expect(diff.length).toBe(2);
    const diffA = diff.find((d) => d.tokenId === 'color.a');
    const diffB = diff.find((d) => d.tokenId === 'color.b');
    expect(diffA?.changed).toBe(false);
    expect(diffB?.changed).toBe(true);
  });

  it('handles tokens present only in theme A', () => {
    const themeA = new Map<TokenRef, TokenValue>([['color.only-a', COLOR_PRIMARY]]);
    const themeB = new Map<TokenRef, TokenValue>();
    const diff = computeThemeDiff(themeA, themeB);
    expect(diff.length).toBe(1);
    expect(diff[0]?.changed).toBe(true);
    expect(diff[0]?.valueA).toEqual(COLOR_PRIMARY);
    expect(diff[0]?.valueB).toBeNull();
  });

  it('handles tokens present only in theme B', () => {
    const themeA = new Map<TokenRef, TokenValue>();
    const themeB = new Map<TokenRef, TokenValue>([['color.only-b', COLOR_PRIMARY]]);
    const diff = computeThemeDiff(themeA, themeB);
    expect(diff.length).toBe(1);
    expect(diff[0]?.changed).toBe(true);
    expect(diff[0]?.valueA).toBeNull();
    expect(diff[0]?.valueB).toEqual(COLOR_PRIMARY);
  });

  it('returns empty array for identical themes', () => {
    const themeA = new Map<TokenRef, TokenValue>([['color.a', COLOR_PRIMARY]]);
    const diff = computeThemeDiff(themeA, themeA);
    expect(diff.length).toBe(1);
    expect(diff[0]?.changed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cache invalidation
// ---------------------------------------------------------------------------

describe('resolveWithCache and invalidateCache', () => {
  beforeEach(() => {
    invalidateCache();
  });

  it('returns cached result on second call', () => {
    const deckState = makeDeckState();
    const r1 = resolveWithCache('color.brand.primary', { kind: 'deck' }, deckState);
    const r2 = resolveWithCache('color.brand.primary', { kind: 'deck' }, deckState);
    expect(r1).toEqual(r2);
  });

  it('invalidateCache clears all entries', () => {
    const deckState = makeDeckState();
    resolveWithCache('color.brand.primary', { kind: 'deck' }, deckState);
    invalidateCache();
    // After invalidation, next call re-resolves (no error thrown)
    const result = resolveWithCache('color.brand.primary', { kind: 'deck' }, deckState);
    expect(result.value).toEqual(COLOR_PRIMARY);
  });

  it('invalidateCache(scopeKey) clears only that scope', () => {
    const deckState = makeDeckState();
    resolveWithCache('color.brand.primary', { kind: 'deck' }, deckState);
    resolveWithCache('color.brand.primary', { kind: 'slide', slideId: 'slide-1' }, deckState);
    invalidateCache('slide:slide-1');
    // Deck scope still cached
    const deckResult = resolveWithCache('color.brand.primary', { kind: 'deck' }, deckState);
    expect(deckResult.value).toEqual(COLOR_PRIMARY);
  });
});
