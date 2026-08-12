/**
 * Viewer deck service — fetches the deck document a viewer should play.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns the bundled example deck. The viewer-runtime will
 * replace this with a real fetch from the deck-svc.
 */

import type { DeckDocument } from '@domio/schema/generated/scene-graph';
import exampleDeck from '../../../../fixtures/example-deck.json' with { type: 'json' };

export async function fetchViewerDeck(_deckId: string): Promise<DeckDocument> {
  return exampleDeck as unknown as DeckDocument;
}