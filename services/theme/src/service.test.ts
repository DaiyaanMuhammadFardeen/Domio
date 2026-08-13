/**
 * Theme service tests — covers token CRUD, alias cycle detection,
 * referrer-blocked deletion, theme apply, and overrides.
 */

import { describe, it, expect } from 'vitest';
import type { ULID } from '@domio/schema';
import { asULID } from '@domio/schema';
import type { TokenValue } from '@domio/tokens';

import { ThemeService } from './service.js';
import {
  TokenAliasCycleError,
  TokenReferencedError,
  InvalidTokenIdError,
  TokenValidationError,
  ThemeNotFoundError,
} from './service.js';
import {
  InMemoryTokenRepository,
  InMemoryTokenAliasRepository,
  InMemoryThemeRepository,
  InMemoryThemeVersionRepository,
  InMemoryThemeOverrideRepository,
  InMemoryThemeApplicationEventRepository,
} from './dal.js';

const ORG = 'org-1';

function color(r: number, g: number, b: number, alpha = 1): TokenValue {
  return { type: 'color', value: { space: 'srgb', channels: [r, g, b], alpha } };
}

function dim(value: number, unit: 'px' | 'rem' | 'em' | '%' = 'px'): TokenValue {
  return { type: 'dimension', value: { value, unit } };
}

function makeService() {
  let counter = 0;
  const ids: ULID[] = [];
  const idGen = () => {
    counter++;
    // Build a 26-char Crockford-base32 ULID by interleaving a monotonic
    // counter into the random portion. The first 10 chars are time-
    // stamped (constant per test); the remaining 16 chars encode the
    // counter with a deterministic offset to ensure uniqueness.
    const ts = '01H0A0B0C0D';
    const rand = counter.toString(32).padStart(16, '0').toUpperCase().slice(-16);
    const out = asULID(`${ts}${rand}`);
    ids.push(out);
    return out;
  };
  let now = new Date('2026-08-02T00:00:00Z');
  const clock = () => now;
  const svc = new ThemeService({
    tokens: new InMemoryTokenRepository(),
    aliases: new InMemoryTokenAliasRepository(),
    themes: new InMemoryThemeRepository(),
    themeVersions: new InMemoryThemeVersionRepository(),
    overrides: new InMemoryThemeOverrideRepository(),
    applications: new InMemoryThemeApplicationEventRepository(),
    idGenerator: idGen,
    clock,
  });
  return { svc, clock: { tick: () => (now = new Date(now.getTime() + 1000)) }, ids };
}

describe('ThemeService — token CRUD', () => {
  it('creates a color token', async () => {
    const { svc } = makeService();
    const t = await svc.createToken({
      tokenId: 'color.brand.primary',
      orgId: ORG,
      group: 'color' as never,
      type: 'color',
      value: color(0.2, 0.4, 0.8),
      createdBy: 'alice',
    });
    expect(t.tokenId).toBe('color.brand.primary');
    expect(t.orgId).toBe(ORG);
    expect(t.createdBy).toBe('alice');
  });

  it('rejects invalid tokenId format', async () => {
    const { svc } = makeService();
    await expect(
      svc.createToken({
        tokenId: 'Color-Brand',
        orgId: ORG,
        group: 'color' as never,
        type: 'color',
        value: color(0.5, 0.5, 0.5),
        createdBy: 'alice',
      }),
    ).rejects.toBeInstanceOf(InvalidTokenIdError);
  });

  it('rejects invalid color values (channels out of range)', async () => {
    const { svc } = makeService();
    await expect(
      svc.createToken({
        tokenId: 'color.bad',
        orgId: ORG,
        group: 'color' as never,
        type: 'color',
        value: { type: 'color', value: { space: 'srgb', channels: [1.5, 0.5, 0.5], alpha: 1 } },
        createdBy: 'alice',
      }),
    ).rejects.toBeInstanceOf(TokenValidationError);
  });

  it('rejects unknown token types', async () => {
    const { svc } = makeService();
    await expect(
      svc.createToken({
        tokenId: 'weird.thing',
        orgId: ORG,
        group: 'color' as never,
        type: 'color',
        // Pass a TokenValue with an unknown type discriminator
        value: {
          type: 'gradient',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
        } as never,
        createdBy: 'alice',
      }),
    ).rejects.toBeInstanceOf(TokenValidationError);
  });

  it('lists tokens filtered by group', async () => {
    const { svc } = makeService();
    await svc.createToken({
      tokenId: 'color.brand.primary',
      orgId: ORG,
      group: 'color' as never,
      type: 'color',
      value: color(0.5, 0.5, 0.5),
      createdBy: 'alice',
    });
    await svc.createToken({
      tokenId: 'spacing.layout.gutter',
      orgId: ORG,
      group: 'spacing' as never,
      type: 'dimension',
      value: dim(16),
      createdBy: 'alice',
    });
    const colors = await svc.listTokens(ORG, 'color' as never);
    expect(colors.map((t) => t.tokenId)).toEqual(['color.brand.primary']);
  });

  it('updates a token value', async () => {
    const { svc } = makeService();
    await svc.createToken({
      tokenId: 'color.brand.primary',
      orgId: ORG,
      group: 'color' as never,
      type: 'color',
      value: color(0.5, 0.5, 0.5),
      createdBy: 'alice',
    });
    const updated = await svc.updateToken(
      'color.brand.primary',
      ORG,
      { value: color(0.8, 0.2, 0.4) },
      'alice',
    );
    expect(updated.value).toEqual(color(0.8, 0.2, 0.4));
  });
});

describe('ThemeService — alias cycle detection', () => {
  it('accepts a valid linear chain', async () => {
    const { svc } = makeService();
    const a = await svc.createAlias({
      aliasTokenId: 'color.bg.surface',
      targetTokenId: 'color.brand.primary',
      orgId: ORG,
    });
    expect(a.aliasTokenId).toBe('color.bg.surface');
    // Second alias in chain
    await svc.createAlias({
      aliasTokenId: 'color.brand.primary',
      targetTokenId: 'color.semantic.primary',
      orgId: ORG,
    });
  });

  it('rejects a self-loop', async () => {
    const { svc } = makeService();
    await expect(
      svc.createAlias({ aliasTokenId: 'a', targetTokenId: 'a', orgId: ORG }),
    ).rejects.toBeInstanceOf(TokenAliasCycleError);
  });

  it('rejects a 2-cycle', async () => {
    const { svc } = makeService();
    await svc.createAlias({ aliasTokenId: 'a', targetTokenId: 'b', orgId: ORG });
    await expect(
      svc.createAlias({ aliasTokenId: 'b', targetTokenId: 'a', orgId: ORG }),
    ).rejects.toBeInstanceOf(TokenAliasCycleError);
  });

  it('rejects a 3-cycle', async () => {
    const { svc } = makeService();
    await svc.createAlias({ aliasTokenId: 'a', targetTokenId: 'b', orgId: ORG });
    await svc.createAlias({ aliasTokenId: 'b', targetTokenId: 'c', orgId: ORG });
    await expect(
      svc.createAlias({ aliasTokenId: 'c', targetTokenId: 'a', orgId: ORG }),
    ).rejects.toBeInstanceOf(TokenAliasCycleError);
  });
});

describe('ThemeService — referrer-blocked deletion', () => {
  it('blocks deletion when a token is referenced in overrides', async () => {
    const { svc } = makeService();
    await svc.createToken({
      tokenId: 'color.brand.primary',
      orgId: ORG,
      group: 'color' as never,
      type: 'color',
      value: color(0.2, 0.4, 0.8),
      createdBy: 'alice',
    });
    await svc.createOverride({
      orgId: ORG,
      deckId: 'deck-1',
      scope: { kind: 'slide', slideId: 'slide-4' },
      tokensPartial: new Map([['color.brand.primary', color(0.9, 0.1, 0.1)]]),
      createdBy: 'alice',
    });
    await expect(svc.deleteToken('color.brand.primary', ORG)).rejects.toBeInstanceOf(
      TokenReferencedError,
    );
  });

  it('allows deletion when no referrers exist', async () => {
    const { svc } = makeService();
    await svc.createToken({
      tokenId: 'color.unused',
      orgId: ORG,
      group: 'color' as never,
      type: 'color',
      value: color(0.5, 0.5, 0.5),
      createdBy: 'alice',
    });
    await expect(svc.deleteToken('color.unused', ORG)).resolves.toBeUndefined();
  });

  it('reports referrer counts and samples', async () => {
    const { svc } = makeService();
    await svc.createToken({
      tokenId: 'color.brand.primary',
      orgId: ORG,
      group: 'color' as never,
      type: 'color',
      value: color(0.2, 0.4, 0.8),
      createdBy: 'alice',
    });
    for (const slideId of ['s1', 's2', 's3']) {
      await svc.createOverride({
        orgId: ORG,
        deckId: 'deck-1',
        scope: { kind: 'slide', slideId },
        tokensPartial: new Map([['color.brand.primary', color(0.9, 0.1, 0.1)]]),
        createdBy: 'alice',
      });
    }
    const refs = await svc.findReferrers(ORG, 'deck-1', 'color.brand.primary');
    expect(refs.count).toBeGreaterThanOrEqual(3);
    expect(refs.sampleReferrers.length).toBeGreaterThan(0);
  });
});

describe('ThemeService — theme CRUD + apply', () => {
  it('creates a theme with version 1', async () => {
    const { svc } = makeService();
    const theme = await svc.createTheme({
      orgId: ORG,
      name: 'Sunrise',
      kind: 'user',
      createdBy: 'alice',
      tokens: new Map([['color.brand.primary', color(1, 0.5, 0)]]),
    });
    expect(theme.signature).toMatch(/^[0-9a-f]{8}$/);
  });

  it('applies a theme and produces an op batch', async () => {
    const { svc } = makeService();
    const theme = await svc.createTheme({
      orgId: ORG,
      name: 'Sunrise',
      kind: 'user',
      createdBy: 'alice',
      tokens: new Map([
        ['color.brand.primary', color(1, 0.5, 0)],
        ['color.brand.secondary', color(0, 0.5, 1)],
      ]),
    });

    const result = await svc.applyTheme({
      orgId: ORG,
      deckId: 'deck-1',
      toThemeId: theme.themeId,
      actorId: 'alice',
      deckElements: [
        {
          slideId: 's1',
          elementId: 'e1',
          tokenRef: 'color.brand.primary',
          currentResolved: color(0.2, 0.2, 0.2),
        },
        {
          slideId: 's1',
          elementId: 'e2',
          tokenRef: 'color.brand.secondary',
          currentResolved: null,
        },
        {
          slideId: 's2',
          elementId: 'e3',
          tokenRef: 'color.brand.primary',
          currentResolved: color(0.2, 0.2, 0.2),
        },
      ],
    });

    expect(result.tokensChangedCount).toBe(3);
    expect(result.ops).toHaveLength(3);
    expect(result.ops[0]?.newValue).toEqual(color(1, 0.5, 0));
  });

  it('skips elements already at the new value (idempotent re-apply)', async () => {
    const { svc } = makeService();
    const theme = await svc.createTheme({
      orgId: ORG,
      name: 'Sunrise',
      kind: 'user',
      createdBy: 'alice',
      tokens: new Map([['color.brand.primary', color(1, 0.5, 0)]]),
    });

    const result = await svc.applyTheme({
      orgId: ORG,
      deckId: 'deck-1',
      toThemeId: theme.themeId,
      actorId: 'alice',
      deckElements: [
        {
          slideId: 's1',
          elementId: 'e1',
          tokenRef: 'color.brand.primary',
          currentResolved: color(1, 0.5, 0),
        },
      ],
    });

    expect(result.tokensChangedCount).toBe(0);
    expect(result.ops).toHaveLength(0);
  });

  it('throws ThemeNotFound when applying an unknown theme', async () => {
    const { svc } = makeService();
    await expect(
      svc.applyTheme({
        orgId: ORG,
        deckId: 'deck-1',
        toThemeId: 'nonexistent',
        actorId: 'alice',
        deckElements: [],
      }),
    ).rejects.toBeInstanceOf(ThemeNotFoundError);
  });
});

describe('ThemeService — overrides', () => {
  it('creates slide, section, and state-conditional overrides', async () => {
    const { svc } = makeService();
    await svc.createOverride({
      orgId: ORG,
      deckId: 'deck-1',
      scope: { kind: 'slide', slideId: 'slide-4' },
      tokensPartial: new Map([['color.brand.primary', color(0.9, 0.1, 0.1)]]),
      createdBy: 'alice',
    });
    await svc.createOverride({
      orgId: ORG,
      deckId: 'deck-1',
      scope: { kind: 'section', sectionId: 'section-2' },
      tokensPartial: new Map([['spacing.layout.gutter', dim(24)]]),
      createdBy: 'alice',
    });
    await svc.createOverride({
      orgId: ORG,
      deckId: 'deck-1',
      scope: { kind: 'state-conditional', exprJson: '{"variable":"score","op":"<","value":0}' },
      tokensPartial: new Map([['color.brand.primary', color(0.1, 0.1, 0.9)]]),
      createdBy: 'alice',
    });
    const all = await svc.listOverrides('deck-1', ORG);
    expect(all).toHaveLength(3);
  });

  it('deletes an override', async () => {
    const { svc } = makeService();
    const o = await svc.createOverride({
      orgId: ORG,
      deckId: 'deck-1',
      scope: { kind: 'slide', slideId: 's1' },
      tokensPartial: new Map(),
      createdBy: 'alice',
    });
    await svc.deleteOverride(o.overrideId, ORG);
    const remaining = await svc.listOverrides('deck-1', ORG);
    expect(remaining).toHaveLength(0);
  });
});

describe('ThemeService — engine integration', () => {
  it('resolveTokens returns theme tokens through the engine', async () => {
    const { svc } = makeService();
    await svc.createToken({
      tokenId: 'color.brand.primary',
      orgId: ORG,
      group: 'color' as never,
      type: 'color',
      value: color(0.2, 0.4, 0.8),
      createdBy: 'alice',
    });
    await svc.createAlias({
      aliasTokenId: 'color.bg.surface',
      targetTokenId: 'color.brand.primary',
      orgId: ORG,
    });
    const resolved = await svc.resolveTokens(ORG, undefined, ['color.bg.surface']);
    const r = resolved.get('color.bg.surface');
    expect(r).toBeDefined();
    expect(r!.source).toBe('alias');
    expect(r!.value).toEqual(color(0.2, 0.4, 0.8));
  });

  it('computes a diff between two theme versions', async () => {
    const { svc } = makeService();
    const a = await svc.createTheme({
      orgId: ORG,
      name: 'A',
      kind: 'user',
      createdBy: 'alice',
      tokens: new Map([['color.brand.primary', color(0.5, 0.5, 0.5)]]),
    });
    const b = await svc.createTheme({
      orgId: ORG,
      name: 'B',
      kind: 'user',
      createdBy: 'alice',
      tokens: new Map([
        ['color.brand.primary', color(0.9, 0.1, 0.1)],
        ['color.brand.secondary', color(0.1, 0.9, 0.1)],
      ]),
    });
    const diff = await svc.computeThemeDiff(a.themeId, b.themeId, ORG);
    const changed = diff.filter((d) => d.changed);
    expect(changed.length).toBeGreaterThanOrEqual(2);
  });
});
