/**
 * Suggestions store interface (Phase 18 #182).
 *
 * Transport-agnostic persistence layer for suggestions.
 * Two implementations:
 *  - {@link InMemorySuggestionsStore} — used in tests and dev.
 *  - {@link PgSuggestionsStore}       — pg-pool-backed (scaffolding + nil-guards).
 */

import type { Suggestion, SuggestionStatus } from '../types.js';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface SuggestionsStore {
  insertSuggestion(suggestion: Suggestion): Promise<void>;
  getSuggestion(suggestionId: string): Promise<Suggestion | null>;
  listSuggestionsByDeck(deckId: string, status?: SuggestionStatus): Promise<Suggestion[]>;
  listSuggestionsByWorkspace(workspaceId: string): Promise<Suggestion[]>;
  updateSuggestion(
    suggestionId: string,
    patch: Partial<
      Pick<Suggestion, 'status' | 'resolved_at' | 'resolved_by' | 'updated_at' | 'updated_by'>
    >,
  ): Promise<Suggestion>;
  listOpenSuggestions(): Promise<Suggestion[]>;
}
