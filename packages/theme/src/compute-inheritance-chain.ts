/**
 * @domio/theme — Inheritance inspector.
 *
 * Returns the ordered inheritance chain for a token on a given slide,
 * showing the winning value + source at each level.
 * Used by the editor's "primary" inspector UI.
 */

import type {
  TokenRef,
  TokenValue,
  DeckTokenState,
  InheritanceChainEntry,
} from './types.js';
import { resolve } from './resolve.js';

/**
 * Compute the inheritance chain for a tokenRef on a specific slide.
 *
 * Walks the precedence chain and records what value each level provides
 * (or null if the level doesn't have the token).
 *
 * Returns the chain in order: per-slide override → section override →
 * deck theme → brand context theme → org default theme.
 */
export function computeInheritanceChain(
  tokenRef: TokenRef,
  deckState: DeckTokenState,
  slideId: string,
): readonly InheritanceChainEntry[] {
  const chain: InheritanceChainEntry[] = [];

  // 1. Per-slide override
  const slideOverrides = deckState.perSlideOverrides.get(slideId);
  if (slideOverrides?.has(tokenRef)) {
    const override = slideOverrides.get(tokenRef);
    // Resolve if it's an alias
    const val = override !== undefined && 'value' in override
      ? (override as TokenValue)
      : resolve(tokenRef, { kind: 'slide', slideId }, deckState).value;
    chain.push({ level: 'per-slide override', value: val ?? null, source: 'override' });
  } else {
    chain.push({ level: 'per-slide override', value: null, source: null });
  }

  // 2. Section override (find section for this slide — we use a simplified approach)
  // In a real implementation, we'd look up which section the slide belongs to.
  // For the inheritance chain inspector, we check all section overrides for this token.
  let sectionFound = false;
  for (const [, sectionOverrides] of deckState.sectionOverrides) {
    if (sectionOverrides.has(tokenRef)) {
      const override = sectionOverrides.get(tokenRef);
      const val = override !== undefined && 'value' in override
        ? (override as TokenValue)
        : resolve(tokenRef, { kind: 'deck' }, deckState).value;
      chain.push({ level: 'section override', value: val ?? null, source: 'override' });
      sectionFound = true;
      break;
    }
  }
  if (!sectionFound) {
    chain.push({ level: 'section override', value: null, source: null });
  }

  // 3. Deck theme
  const deckVal = deckState.deckTheme.get(tokenRef);
  chain.push({
    level: 'deck theme',
    value: deckVal ?? null,
    source: deckVal !== undefined ? 'theme' : null,
  });

  // 4. Brand context theme
  const brandVal = deckState.brandContextTheme.get(tokenRef);
  chain.push({
    level: 'brand context theme',
    value: brandVal ?? null,
    source: brandVal !== undefined ? 'brand' : null,
  });

  // 5. Org default theme
  const orgVal = deckState.orgDefaultTheme.get(tokenRef);
  chain.push({
    level: 'org default theme',
    value: orgVal ?? null,
    source: orgVal !== undefined ? 'org' : null,
  });

  return chain;
}
