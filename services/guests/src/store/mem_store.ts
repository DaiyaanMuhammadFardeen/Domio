/**
 * In-memory guest store (Phase 18).
 *
 * Backs every method of {@link GuestStore} with Maps. Used in unit
 * tests and in dev when DATABASE_URL is unset.
 */

import type { GuestAccess, GuestMagicLink } from '../types.js';
import { GuestNotFoundError } from '../types.js';
import type { GuestStore } from './store.js';

export class InMemoryGuestStore implements GuestStore {
  private readonly guestAccesses = new Map<string, GuestAccess>();
  private readonly magicLinks = new Map<string, GuestMagicLink>();

  async createGuestAccess(row: GuestAccess): Promise<GuestAccess> {
    this.guestAccesses.set(row.guest_access_id, row);
    return row;
  }

  async createMagicLink(row: GuestMagicLink): Promise<GuestMagicLink> {
    this.magicLinks.set(row.id, row);
    return row;
  }

  async getGuestAccess(id: string): Promise<GuestAccess | null> {
    return this.guestAccesses.get(id) ?? null;
  }

  async getGuestAccessByEmail(
    scopeType: string,
    scopeId: string,
    email: string,
  ): Promise<GuestAccess | null> {
    for (const ga of this.guestAccesses.values()) {
      if (ga.scope_type === scopeType && ga.scope_id === scopeId && ga.guest_email === email) {
        return ga;
      }
    }
    return null;
  }

  async getOpenMagicLinks(guestAccessId: string): Promise<GuestMagicLink[]> {
    const results: GuestMagicLink[] = [];
    for (const ml of this.magicLinks.values()) {
      if (
        ml.guest_access_id === guestAccessId &&
        ml.consumed_at == null &&
        ml.invalidated_at == null
      ) {
        results.push(ml);
      }
    }
    return results;
  }

  async getMagicLinkByHash(tokenHash: string): Promise<GuestMagicLink | null> {
    for (const ml of this.magicLinks.values()) {
      if (ml.token_hash === tokenHash) return ml;
    }
    return null;
  }

  async markMagicLinkConsumed(id: string, at: Date): Promise<void> {
    const ml = this.magicLinks.get(id);
    if (!ml) throw new GuestNotFoundError(id);
    // Replace with a new object (immutable update)
    const updated: GuestMagicLink = { ...ml, consumed_at: at };
    this.magicLinks.set(id, updated);
  }

  async invalidateMagicLinks(guestAccessId: string, at: Date): Promise<void> {
    for (const [id, ml] of this.magicLinks) {
      if (
        ml.guest_access_id === guestAccessId &&
        ml.consumed_at == null &&
        ml.invalidated_at == null
      ) {
        this.magicLinks.set(id, { ...ml, invalidated_at: at });
      }
    }
  }

  async setGuestRevoked(id: string, at: Date): Promise<void> {
    const ga = this.guestAccesses.get(id);
    if (!ga) throw new GuestNotFoundError(id);
    this.guestAccesses.set(id, { ...ga, revoked_at: at });
  }

  async markGuestUser(guestAccessId: string, guestUserId: string): Promise<void> {
    const ga = this.guestAccesses.get(guestAccessId);
    if (!ga) throw new GuestNotFoundError(guestAccessId);
    this.guestAccesses.set(guestAccessId, { ...ga, guest_user_id: guestUserId });
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  clear(): void {
    this.guestAccesses.clear();
    this.magicLinks.clear();
  }
}
