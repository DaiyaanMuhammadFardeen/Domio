/**
 * @domio/theme — Referrer search.
 *
 * Scans deck elements, slides, themes, and overrides for references to a token.
 * Powers the 409 TOKEN_REFERENCED deletion blocker.
 */

import type {
  TokenRef,
  DeckTokenState,
  FindReferrersResult,
} from './types.js';

const MAX_SAMPLE_REFERRERS = 10;

/**
 * Find all referrers of a given tokenRef in the deck state.
 *
 * Scans:
 * - slideElements index (slideId → elementRefs)
 * - perSlideOverrides (slideId → token maps)
 * - sectionOverrides (sectionId → token maps)
 * - deckTheme
 * - brandContextTheme
 * - orgDefaultTheme
 * - aliasEdges (source references target)
 */
export function findReferrers(
  tokenRef: TokenRef,
  deckState: DeckTokenState,
): FindReferrersResult {
  const referrers: string[] = [];

  // Scan slide elements
  for (const [slideId, elements] of deckState.slideElements) {
    for (const elem of elements) {
      if (elem.tokenRefs.includes(tokenRef)) {
        referrers.push(`slide:${slideId}/element:${elem.elementId}`);
      }
    }
  }

  // Scan per-slide overrides
  for (const [slideId, overrides] of deckState.perSlideOverrides) {
    if (overrides.has(tokenRef)) {
      referrers.push(`slide:${slideId}/override`);
    }
  }

  // Scan section overrides
  for (const [sectionId, overrides] of deckState.sectionOverrides) {
    if (overrides.has(tokenRef)) {
      referrers.push(`section:${sectionId}/override`);
    }
  }

  // Check if token is in deck theme
  if (deckState.deckTheme.has(tokenRef)) {
    referrers.push('deck-theme');
  }

  // Check if token is in brand context theme
  if (deckState.brandContextTheme.has(tokenRef)) {
    referrers.push('brand-context-theme');
  }

  // Check if token is in org default theme
  if (deckState.orgDefaultTheme.has(tokenRef)) {
    referrers.push('org-default-theme');
  }

  // Check alias edges (source references target)
  for (const edge of deckState.aliasEdges) {
    if (edge.targetTokenId === tokenRef) {
      referrers.push(`alias:${edge.aliasTokenId}`);
    }
  }

  return {
    count: referrers.length,
    sampleReferrers: referrers.slice(0, MAX_SAMPLE_REFERRERS),
  };
}
