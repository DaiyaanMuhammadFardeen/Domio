/**
 * Calendar store interface (Phase 18 W3).
 *
 * Transport-agnostic persistence layer for calendar links.
 * Two implementations:
 *  - {@link InMemoryCalendarStore} — used in tests and dev.
 *  - {@link PgCalendarStore}       — pg-pool-backed (full DML).
 */

import type { CalendarLink } from '../types.js';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface CalendarStore {
  saveLink(link: CalendarLink): Promise<void>;
  getLink(id: string): Promise<CalendarLink | null>;
  listLinksByDeck(deckId: string): Promise<CalendarLink[]>;
  listLinksByUser(userId: string): Promise<CalendarLink[]>;
  deleteLink(id: string): Promise<void>;
  findDuplicateLink(deckId: string, vendor: string, eventId: string): Promise<CalendarLink | null>;
}
