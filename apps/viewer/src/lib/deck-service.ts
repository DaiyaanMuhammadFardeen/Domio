/**
 * Viewer deck service — fetches the deck document a viewer should play.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * The viewer-runtime hits `GET /v1/decks/{deckId}` once per page load,
 * then renders the resulting `DeckDocument` deterministically. Today
 * (bootstrap mode) the service returns the bundled example deck for
 * any `deckId` query so the viewer is reachable end-to-end before the
 * deck-svc is wired in.
 */

import type { DeckDocument, Slide, ULID } from '@domio/schema/generated/scene-graph';
import exampleDeck from '../../../../fixtures/example-deck.json' with { type: 'json' };

const BOOTSTRAP_DECK = exampleDeck as unknown as DeckDocument;

export interface DeckResolution {
  readonly deck: DeckDocument;
  /** True when the deck is the bundled example. False once real deck-svc lands. */
  readonly bootstrap: boolean;
}

export async function fetchViewerDeck(deckId: string): Promise<DeckResolution> {
  // Bootstrap: serve the bundled fixture for every deckId. Real svc will
  // short-circuit non-existent ids to a 404 page.
  void deckId;
  return { deck: BOOTSTRAP_DECK, bootstrap: true };
}

export async function fetchViewerSlide(
  deckId: string,
  slideIdx: number,
): Promise<{ deck: DeckDocument; slide: Slide; slideIdx: number } | null> {
  const { deck } = await fetchViewerDeck(deckId);
  if (slideIdx < 0 || slideIdx >= deck.slides.length) return null;
  return { deck, slide: deck.slides[slideIdx]!, slideIdx };
}

export interface DeepLink {
  readonly href: string;
  readonly label: string;
}

/**
 * Compute the deep-link graph for a deck: for each slide, what other slides
 * can it route to via the runtime's branching edges (Phase 07)?
 *
 * Bootstrap: every slide points to the next slide + the previous slide,
 * forming a simple linear graph. Real implementation will read branching
 * edges from the deck's `x-domio:branching-edges` slot.
 */
export function computeDeepLinks(deck: DeckDocument, currentIdx: number): readonly DeepLink[] {
  const links: DeepLink[] = [];
  if (currentIdx > 0) {
    links.push({
      href: `/${deck.id}/${currentIdx - 1}`,
      label: `← Slide ${currentIdx}`,
    });
  }
  if (currentIdx < deck.slides.length - 1) {
    links.push({
      href: `/${deck.id}/${currentIdx + 1}`,
      label: `Slide ${currentIdx + 2} →`,
    });
  }
  return links;
}

/**
 * Compute the canonical share URL for a deck. The viewer surfaces this
 * in the chrome + the SEO meta.
 */
export function canonicalDeckUrl(deckId: string | ULID, slideIdx?: number): string {
  const base = `https://deck.domio.app/${deckId}`;
  return typeof slideIdx === 'number' ? `${base}/${slideIdx}` : base;
}

/**
 * Compute the canonical scroll URL for a deck (`?mode=scroll`).
 * The viewer surfaces this in the chrome as a shareable toggle.
 */
export function scrollModeUrl(deckId: string | ULID, startIdx?: number): string {
  const base = `https://deck.domio.app/${deckId}/scroll`;
  return typeof startIdx === 'number' && startIdx > 0 ? `${base}?start=${startIdx}` : base;
}
