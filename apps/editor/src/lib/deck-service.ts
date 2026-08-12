/**
 * deck-service — editor deck loader + lister.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Consolidates the previous document-loader-client + deck-list modules.
 * Two loader hooks:
 *   - `createDocumentLoader(deckId)` returns the document for a single deck.
 *   - `fetchDeckList(workspaceId)` returns the workspace's deck summaries.
 *
 * Both follow the bootstrap → fetch → fall-back pattern. The fetcher
 * URLs are wired today; when the control plane `/v1/decks` endpoint
 * goes live in a later wave, the fallback path will simply stop
 * triggering.
 */

import type { DeckDocument } from '@domio/schema/generated/scene-graph';
import exampleDeck from '../../../../fixtures/example-deck.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Single-deck loader
// ---------------------------------------------------------------------------

export interface DocumentLoader {
  fetch(deckId: string): Promise<DeckDocument>;
  /** Synchronous access to the bundled example for the boot page. */
  example(): DeckDocument;
}

export function createDocumentLoader(baseUrl?: string): DocumentLoader {
  const url = baseUrl ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080';
  return {
    async fetch() {
      // The control plane's single-deck endpoint lands in a later wave.
      // Until then the editor falls back to the bundled example so the
      // UI is verifiable without a control plane.
      void url;
      return exampleDeck as unknown as DeckDocument;
    },
    example() {
      return exampleDeck as unknown as DeckDocument;
    },
  };
}

// ---------------------------------------------------------------------------
// Deck list loader
// ---------------------------------------------------------------------------

export interface DeckSummary {
  readonly id: string;
  readonly title: string;
  readonly thumbnail: string | null;
  readonly updatedAt: number | null;
}

const DEMO_DECK: DeckSummary = {
  id: 'demo',
  title: 'Demo deck',
  thumbnail: null,
  updatedAt: null,
};

export interface FetchDeckListResult {
  readonly decks: ReadonlyArray<DeckSummary>;
  /** True when the API call succeeded; false when we fell back to the demo. */
  readonly live: boolean;
}

export async function fetchDeckList(
  workspaceId: string,
): Promise<FetchDeckListResult> {
  const apiBase =
    process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080';
  const url = new URL('/v1/decks', apiBase);
  url.searchParams.set('workspace_id', workspaceId);

  try {
    const res = await fetch(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return { decks: [DEMO_DECK], live: false };
    const json = (await res.json()) as {
      decks?: Array<Record<string, unknown>>;
    };
    const decks = (json.decks ?? [])
      .map((r) => ({
        id: String(r['id'] ?? ''),
        title: String(r['title'] ?? 'Untitled deck'),
        thumbnail: r['thumbnail'] ? String(r['thumbnail']) : null,
        updatedAt:
          typeof r['updated_at'] === 'number'
            ? (r['updated_at'] as number)
            : null,
      }))
      .filter((d) => d.id.length > 0);
    if (!decks.some((d) => d.id === DEMO_DECK.id)) {
      decks.unshift(DEMO_DECK);
    }
    return { decks, live: true };
  } catch {
    return { decks: [DEMO_DECK], live: false };
  }
}
