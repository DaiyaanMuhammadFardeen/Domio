/**
 * Guest store interface (Phase 18).
 *
 * Transport-agnostic persistence layer for guest_access and guest_magic_link.
 * Two implementations:
 *  - {@link InMemoryGuestStore} — used in tests and dev.
 *  - {@link PgGuestStore}       — pg-pool-backed with full parameterized DML.
 */

import type { GuestAccess, GuestMagicLink } from '../types.js';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface GuestStore {
  createGuestAccess(row: GuestAccess): Promise<GuestAccess>;
  createMagicLink(row: GuestMagicLink): Promise<GuestMagicLink>;
  getGuestAccess(id: string): Promise<GuestAccess | null>;
  getGuestAccessByEmail(scopeType: string, scopeId: string, email: string): Promise<GuestAccess | null>;
  getOpenMagicLinks(guestAccessId: string): Promise<GuestMagicLink[]>;
  getMagicLinkByHash(tokenHash: string): Promise<GuestMagicLink | null>;
  markMagicLinkConsumed(id: string, at: Date): Promise<void>;
  invalidateMagicLinks(guestAccessId: string, at: Date): Promise<void>;
  setGuestRevoked(id: string, at: Date): Promise<void>;
  markGuestUser(guestAccessId: string, guestUserId: string): Promise<void>;
}
