/**
 * Client-side document loader — for the editor canvas. Wraps the SDK
 * loader and provides a synchronous `example()` for the Phase 03 example
 * deck used by the boot page.
 *
 * Real network calls land in P04/P05; for now the editor renders the
 * committed `fixtures/example-deck.json` so the UI is verifiable without a
 * control plane.
 */

import type { DeckDocument } from '@domio/schema';
import exampleDeck from '../../../../fixtures/example-deck.json' with { type: 'json' };

export interface DocumentLoader {
  fetch(deckId: string): Promise<DeckDocument>;
  /** Synchronous access to the bundled example for the boot page. */
  example(): DeckDocument;
}

export function createDocumentLoader(baseUrl?: string): DocumentLoader {
  const url = baseUrl ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
  return {
    async fetch() {
      // Real fetch lands in P04/P05; until then the editor falls back to
      // the bundled example so the UI is verifiable without a control plane.
      void url;
      return exampleDeck as unknown as DeckDocument;
    },
    example() {
      return exampleDeck as unknown as DeckDocument;
    },
  };
}