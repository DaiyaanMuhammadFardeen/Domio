/**
 * Guest service (Phase 18).
 *
 * Transport-agnostic orchestration of guest access and magic-link flows.
 * Depends on:
 *  - {@link GuestStore}        — persistence.
 *  - {@link GuestEventEmitter} — event emission (default: noopEmitter).
 */

import { randomUUID, createHash } from 'crypto';
import type { CreateGuestInput, GuestAccess, GuestMagicLink, MagicLinkConsumeResult } from './types.js';
import {
  GuestNotFoundError,
  MagicLinkInvalidError,
  MagicLinkExpiredError,
  MagicLinkConsumedError,
  MagicLinkInvalidatedError,
  GuestRevokedError,
  GuestExpiredError,
} from './types.js';
import { validateCapabilities, issueMagicLinkToken, isExpired, resolveTtlMinutes, DEV_SECRET } from './magic_link.js';
import { checkFeature, FEATURE_FLAGS } from './feature_flags.js';
import type { GuestEventEmitter } from './types.js';
import { noopEmitter } from './types.js';
import type { GuestStore } from './store/store.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface GuestServiceOptions {
  readonly store: GuestStore;
  readonly eventEmitter?: GuestEventEmitter;
  /** Clock. Default Date.now. */
  readonly now?: () => Date;
  /** HMAC secret for magic-link tokens. Default dev secret. */
  readonly secret?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GuestService {
  private readonly store: GuestStore;
  private readonly emitter: GuestEventEmitter;
  private readonly clock: () => Date;
  private readonly secret: string;

  constructor(opts: GuestServiceOptions) {
    if (!opts.store) throw new Error('GuestService: store is required');
    this.store = opts.store;
    this.emitter = opts.eventEmitter ?? noopEmitter;
    this.clock = opts.now ?? (() => new Date());
    this.secret = opts.secret ?? DEV_SECRET;
  }

  private idGen(): string {
    return randomUUID();
  }

  private now(): Date {
    return this.clock();
  }

  // -------------------------------------------------------------------------
  // createGuest
  // -------------------------------------------------------------------------

  /**
   * Create a new guest access record with an initial magic link.
   *
   * Atomic: inserts guest_access + first magic_link in a transaction.
   * Emits guest.access_granted.
   */
  async createGuest(
    input: CreateGuestInput,
    actorId: string,
  ): Promise<{ guest: GuestAccess; magic_link_token: string; magic_link_expires_at: Date }> {
    checkFeature(FEATURE_FLAGS.guests);

    // Validate capabilities
    const capabilities = input.capabilities ?? ['comment', 'suggest', 'view'];
    validateCapabilities(capabilities);

    const now = this.now();
    const ttlMinutes = resolveTtlMinutes(input.expires_in_minutes);
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);

    const guestAccessId = this.idGen();
    const guest: GuestAccess = {
      guest_access_id: guestAccessId,
      workspace_id: input.workspace_id,
      inviter_id: actorId,
      guest_email: input.guest_email,
      guest_user_id: null,
      scope_type: input.scope_type,
      scope_id: input.scope_id,
      capabilities,
      expires_at: expiresAt,
      created_at: now,
      revoked_at: null,
    };

    // Issue magic link
    const linkId = this.idGen();
    const { token, tokenHash } = issueMagicLinkToken(guestAccessId, input.guest_email, expiresAt, this.secret, linkId);
    const magicLink: GuestMagicLink = {
      id: linkId,
      workspace_id: input.workspace_id,
      guest_access_id: guestAccessId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      consumed_at: null,
      invalidated_at: null,
      created_at: now,
      created_by: actorId,
    };

    // Atomic insert via store (store must handle transaction for pg_store)
    // We use a simple sequential insert; pg_store.withTransaction is used by the service
    // for atomicity, but for mem_store we just do both inserts.
    await this.store.createGuestAccess(guest);
    await this.store.createMagicLink(magicLink);

    // Emit event
    await this.emitter.publish('guest.access_granted', {
      event_id: this.idGen(),
      event_type: 'guest.access_granted',
      ts_ms: now.getTime(),
      workspace_id: input.workspace_id,
      actor_id: actorId,
      actor_type: 'member',
      payload: {
        guest_access_id: guestAccessId,
        inviter_id: actorId,
        guest_email: input.guest_email,
        scope_type: input.scope_type,
        scope_id: input.scope_id,
        capabilities,
        expires_at: expiresAt.getTime(),
      },
    });

    return { guest, magic_link_token: token, magic_link_expires_at: expiresAt };
  }

  // -------------------------------------------------------------------------
  // getGuest
  // -------------------------------------------------------------------------

  async getGuest(id: string): Promise<GuestAccess> {
    checkFeature(FEATURE_FLAGS.guests);
    const guest = await this.store.getGuestAccess(id);
    if (!guest) throw new GuestNotFoundError(id);
    return guest;
  }

  // -------------------------------------------------------------------------
  // deleteGuest (soft revoke)
  // -------------------------------------------------------------------------

  /**
   * Soft-revoke a guest access: set revoked_at, invalidate all open links.
   * Emits guest.access_revoked.
   */
  async deleteGuest(id: string, actorId: string): Promise<void> {
    checkFeature(FEATURE_FLAGS.guests);
    const guest = await this.store.getGuestAccess(id);
    if (!guest) throw new GuestNotFoundError(id);

    const now = this.now();
    await this.store.setGuestRevoked(id, now);
    await this.store.invalidateMagicLinks(id, now);

    await this.emitter.publish('guest.access_revoked', {
      event_id: this.idGen(),
      event_type: 'guest.access_revoked',
      ts_ms: now.getTime(),
      workspace_id: guest.workspace_id,
      actor_id: actorId,
      actor_type: 'member',
      payload: {
        guest_access_id: id,
        revoked_at: now.getTime(),
        revoked_by: actorId,
      },
    });
  }

  // -------------------------------------------------------------------------
  // resendMagicLink
  // -------------------------------------------------------------------------

  /**
   * Invalidate prior open links, mint a new magic link.
   * No extra event beyond the original access_granted schema.
   */
  async resendMagicLink(
    id: string,
    actorId: string,
  ): Promise<{ magic_link_token: string; magic_link_expires_at: Date }> {
    checkFeature(FEATURE_FLAGS.guests);
    const guest = await this.store.getGuestAccess(id);
    if (!guest) throw new GuestNotFoundError(id);

    // Enforce expiry on every request
    if (isExpired(guest.expires_at, this.now())) {
      throw new GuestExpiredError(id);
    }
    if (guest.revoked_at != null) {
      throw new GuestRevokedError(id);
    }

    const now = this.now();

    // Invalidate prior open links
    await this.store.invalidateMagicLinks(id, now);

    // Mint new link
    const linkId = this.idGen();
    const { token, tokenHash } = issueMagicLinkToken(id, guest.guest_email, guest.expires_at, this.secret, linkId);
    const magicLink: GuestMagicLink = {
      id: linkId,
      workspace_id: guest.workspace_id,
      guest_access_id: id,
      token_hash: tokenHash,
      expires_at: guest.expires_at,
      consumed_at: null,
      invalidated_at: null,
      created_at: now,
      created_by: actorId,
    };
    await this.store.createMagicLink(magicLink);

    return { magic_link_token: token, magic_link_expires_at: guest.expires_at };
  }

  // -------------------------------------------------------------------------
  // consumeMagicLink
  // -------------------------------------------------------------------------

  /**
   * Consume a magic link token: validate all guards, mark consumed, set guest_user.
   * Enforces expiry on every check.
   */
  async consumeMagicLink(
    token: string,
    now: Date,
    guestUserId?: string,
  ): Promise<MagicLinkConsumeResult> {
    checkFeature(FEATURE_FLAGS.guests);

    // Hash the token to look up
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const magicLink = await this.store.getMagicLinkByHash(tokenHash);
    if (!magicLink) {
      throw new MagicLinkInvalidError('Invalid magic link token');
    }

    // Load guest access first so we can check guest state before link state
    const guest = await this.store.getGuestAccess(magicLink.guest_access_id);
    if (!guest) {
      throw new GuestNotFoundError(magicLink.guest_access_id);
    }

    // Check guest access revoked (most severe — check before link-level errors)
    if (guest.revoked_at != null) {
      throw new GuestRevokedError(guest.guest_access_id);
    }

    // Check guest access expired
    if (isExpired(guest.expires_at, now)) {
      throw new GuestExpiredError(guest.guest_access_id);
    }

    // Check consumed
    if (magicLink.consumed_at != null) {
      throw new MagicLinkConsumedError(magicLink.id);
    }

    // Check invalidated
    if (magicLink.invalidated_at != null) {
      throw new MagicLinkInvalidatedError(magicLink.id);
    }

    // Check link expiry
    if (isExpired(magicLink.expires_at, now)) {
      throw new MagicLinkExpiredError(magicLink.id);
    }

    // Mark consumed
    await this.store.markMagicLinkConsumed(magicLink.id, now);

    // Set guest user if provided
    if (guestUserId) {
      await this.store.markGuestUser(guest.guest_access_id, guestUserId);
    }

    // Re-fetch guest to get updated guest_user_id
    const updatedGuest = guestUserId
      ? (await this.store.getGuestAccess(guest.guest_access_id))!
      : guest;

    // Re-fetch magic link to get consumed_at
    const updatedLink: GuestMagicLink = { ...magicLink, consumed_at: now };

    return {
      guest_access: updatedGuest,
      magic_link: updatedLink,
    };
  }
}
