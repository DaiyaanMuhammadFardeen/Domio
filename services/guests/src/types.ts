/**
 * Guests service — shared types and errors (Phase 18).
 *
 * Common types for guest access and magic-link flows.
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type ScopeType = 'folder' | 'project' | 'deck';

export interface GuestAccess {
  readonly guest_access_id: string;
  readonly workspace_id: string;
  readonly inviter_id: string;
  readonly guest_email: string;
  readonly guest_user_id: string | null;
  readonly scope_type: ScopeType;
  readonly scope_id: string;
  readonly capabilities: string[];
  readonly expires_at: Date;
  readonly created_at: Date;
  readonly revoked_at: Date | null;
}

export interface GuestMagicLink {
  readonly id: string;
  readonly workspace_id: string;
  readonly guest_access_id: string;
  readonly token_hash: string;
  readonly expires_at: Date;
  readonly consumed_at: Date | null;
  readonly invalidated_at: Date | null;
  readonly created_at: Date;
  readonly created_by: string;
}

export interface CreateGuestInput {
  readonly workspace_id: string;
  readonly guest_email: string;
  readonly scope_type: ScopeType;
  readonly scope_id: string;
  readonly capabilities?: string[];
  readonly expires_in_minutes?: number;
}

export interface MagicLinkConsumeResult {
  readonly guest_access: GuestAccess;
  readonly magic_link: GuestMagicLink;
}

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

export interface GuestEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly ts_ms: number;
  readonly workspace_id: string;
  readonly actor_id: string;
  readonly actor_type: string;
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// EventEmitter interface (injected dependency)
// ---------------------------------------------------------------------------

export interface GuestEventEmitter {
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

export const noopEmitter: GuestEventEmitter = {
  async publish(): Promise<void> {
    /* drop */
  },
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class GuestNotFoundError extends Error {
  readonly code = 'GUEST_NOT_FOUND' as const;
  constructor(public readonly guestAccessId: string) {
    super(`Guest access not found: ${guestAccessId}`);
    this.name = 'GuestNotFoundError';
  }
}

export class MagicLinkInvalidError extends Error {
  readonly code = 'MAGIC_LINK_INVALID' as const;
  constructor(message: string = 'Magic link is invalid') {
    super(message);
    this.name = 'MagicLinkInvalidError';
  }
}

export class MagicLinkExpiredError extends Error {
  readonly code = 'MAGIC_LINK_EXPIRED' as const;
  constructor(public readonly magicLinkId: string) {
    super(`Magic link expired: ${magicLinkId}`);
    this.name = 'MagicLinkExpiredError';
  }
}

export class MagicLinkConsumedError extends Error {
  readonly code = 'MAGIC_LINK_CONSUMED' as const;
  constructor(public readonly magicLinkId: string) {
    super(`Magic link already consumed: ${magicLinkId}`);
    this.name = 'MagicLinkConsumedError';
  }
}

export class MagicLinkInvalidatedError extends Error {
  readonly code = 'MAGIC_LINK_INVALIDATED' as const;
  constructor(public readonly magicLinkId: string) {
    super(`Magic link invalidated: ${magicLinkId}`);
    this.name = 'MagicLinkInvalidatedError';
  }
}

export class GuestRevokedError extends Error {
  readonly code = 'GUEST_REVOKED' as const;
  constructor(public readonly guestAccessId: string) {
    super(`Guest access revoked: ${guestAccessId}`);
    this.name = 'GuestRevokedError';
  }
}

export class GuestExpiredError extends Error {
  readonly code = 'GUEST_EXPIRED' as const;
  constructor(public readonly guestAccessId: string) {
    super(`Guest access expired: ${guestAccessId}`);
    this.name = 'GuestExpiredError';
  }
}

export class InvalidCapabilityError extends Error {
  readonly code = 'INVALID_CAPABILITY' as const;
  constructor(public readonly capability: string) {
    super(`Invalid capability: ${capability}`);
    this.name = 'InvalidCapabilityError';
  }
}

export class FeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED' as const;
  constructor(public readonly flag: string) {
    super(`Feature disabled: ${flag}`);
    this.name = 'FeatureDisabledError';
  }
}
