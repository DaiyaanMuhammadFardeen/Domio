/**
 * In-memory calendar store (Phase 18 W3).
 *
 * Backs every method of {@link CalendarStore} with Maps.
 * Used in unit tests and in dev when DATABASE_URL is unset.
 */

import type { CalendarLink } from '../types.js';
import type { CalendarStore } from './store.js';

export class InMemoryCalendarStore implements CalendarStore {
  private readonly links = new Map<string, CalendarLink>();
  private readonly dedupeIndex = new Map<string, string>(); // "deckId:vendor:eventId" → link.id

  async saveLink(link: CalendarLink): Promise<void> {
    this.links.set(link.id, link);
    const key = `${link.deck_id}:${link.vendor}:${link.event_id}`;
    this.dedupeIndex.set(key, link.id);
  }

  async getLink(id: string): Promise<CalendarLink | null> {
    return this.links.get(id) ?? null;
  }

  async listLinksByDeck(deckId: string): Promise<CalendarLink[]> {
    const results: CalendarLink[] = [];
    for (const link of this.links.values()) {
      if (link.deck_id === deckId) {
        results.push(link);
      }
    }
    return results.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  }

  async listLinksByUser(userId: string): Promise<CalendarLink[]> {
    const results: CalendarLink[] = [];
    for (const link of this.links.values()) {
      if (link.user_id === userId) {
        results.push(link);
      }
    }
    return results.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  }

  async deleteLink(id: string): Promise<void> {
    const link = this.links.get(id);
    if (link) {
      const key = `${link.deck_id}:${link.vendor}:${link.event_id}`;
      this.dedupeIndex.delete(key);
      this.links.delete(id);
    }
  }

  async findDuplicateLink(
    deckId: string,
    vendor: string,
    eventId: string,
  ): Promise<CalendarLink | null> {
    const key = `${deckId}:${vendor}:${eventId}`;
    const linkId = this.dedupeIndex.get(key);
    if (!linkId) return null;
    return this.links.get(linkId) ?? null;
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  clear(): void {
    this.links.clear();
    this.dedupeIndex.clear();
  }
}
