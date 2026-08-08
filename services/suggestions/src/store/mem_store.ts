/**
 * In-memory suggestions store (Phase 18 #182).
 *
 * Backs every method of {@link SuggestionsStore} with Maps. Used in unit
 * tests and in dev when DATABASE_URL is unset.
 */

import type { Suggestion, SuggestionStatus } from '../types.js';
import { SuggestionNotFoundError } from '../types.js';
import type { SuggestionsStore } from './store.js';

export class InMemorySuggestionsStore implements SuggestionsStore {
  private readonly suggestions = new Map<string, Suggestion>();

  async insertSuggestion(suggestion: Suggestion): Promise<void> {
    this.suggestions.set(suggestion.id, suggestion);
  }

  async getSuggestion(suggestionId: string): Promise<Suggestion | null> {
    return this.suggestions.get(suggestionId) ?? null;
  }

  async listSuggestionsByDeck(
    deckId: string,
    status?: SuggestionStatus,
  ): Promise<Suggestion[]> {
    const results: Suggestion[] = [];
    for (const s of this.suggestions.values()) {
      if (s.deck_id !== deckId) continue;
      if (status && s.status !== status) continue;
      results.push(s);
    }
    return results;
  }

  async listSuggestionsByWorkspace(workspaceId: string): Promise<Suggestion[]> {
    const results: Suggestion[] = [];
    for (const s of this.suggestions.values()) {
      if (s.workspace_id === workspaceId) results.push(s);
    }
    return results;
  }

  async updateSuggestion(
    suggestionId: string,
    patch: Partial<Pick<Suggestion, 'status' | 'resolved_at' | 'resolved_by' | 'updated_at' | 'updated_by'>>,
  ): Promise<Suggestion> {
    const existing = this.suggestions.get(suggestionId);
    if (!existing) throw new SuggestionNotFoundError(suggestionId);
    const updated: Suggestion = { ...existing, ...patch };
    this.suggestions.set(suggestionId, updated);
    return updated;
  }

  async listOpenSuggestions(): Promise<Suggestion[]> {
    const results: Suggestion[] = [];
    for (const s of this.suggestions.values()) {
      if (s.status === 'open') results.push(s);
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  clear(): void {
    this.suggestions.clear();
  }
}
