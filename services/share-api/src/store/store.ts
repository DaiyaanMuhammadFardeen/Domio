/**
 * Share-link store interface (Phase 14 W1).
 *
 * Transport-agnostic persistence layer for share_link + link_policy rows.
 * Two implementations:
 *  - {@link InMemoryShareStore} — used in tests and dev.
 *  - {@link PgShareStore}       — pgx-pool-backed (W1 PR ships the
 *    scaffolding + nil-guards; full DML follows in M2 once the migration
 *    is applied against a live Postgres).
 *
 * Methods are intentionally narrow — every privileged action in the API
 * surface has a corresponding store method, and the audit emitter
 * receives a `before/after` snapshot so the audit log is tamper-evident.
 */

import type {
  CreateShareInput,
  ExtendExpiryInput,
  LinkPolicy,
  ShareLink,
  UpdateShareInput,
} from '../types.js';

// ---------------------------------------------------------------------------
// Snapshot / before-after
// ---------------------------------------------------------------------------

export interface ShareLinkSnapshot {
  readonly link: ShareLink;
  readonly policy: LinkPolicy;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class StoreError extends Error {
  readonly code: string = 'STORE_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'StoreError';
  }
}

export class ShortIdCollisionError extends StoreError {
  readonly code = 'STORE_SHORT_ID_COLLISION';
  constructor(public readonly shortId: string) {
    super(`Short id collision: ${shortId}`);
    this.name = 'ShortIdCollisionError';
  }
}

export class ConcurrentModificationError extends StoreError {
  readonly code = 'STORE_CONCURRENT_MODIFICATION';
  constructor(public readonly linkId: string) {
    super(`Concurrent modification on share link ${linkId}`);
    this.name = 'ConcurrentModificationError';
  }
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface ShareStore {
  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  /** Find a share link by its id. Returns null if not found, or if the
   *  link has been revoked (revoked rows are soft-deleted and are not
   *  visible to readers — once revoked, the link is gone). */
  findById(workspaceId: string, linkId: string): Promise<ShareLinkSnapshot | null>;

  /** Find a share link by its public short id. Returns null if not found
   *  or if the link has been revoked. */
  findByShortId(workspaceId: string, shortId: string): Promise<ShareLinkSnapshot | null>;

  /** Find a share link by its slug (if set). Returns null if not found
   *  or if the link has been revoked. */
  findBySlug(workspaceId: string, slug: string): Promise<ShareLinkSnapshot | null>;

  /** True iff a row already exists for `(workspace_id, short_id)` and
   *  is not revoked. */
  shortIdExists(workspaceId: string, shortId: string): Promise<boolean>;

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  /**
   * Insert a new share link + policy. Throws ShortIdCollisionError if the
   * short id is taken in this workspace (the caller should retry with a
   * fresh id).
   */
  insert(input: CreateShareInput, link: ShareLink, policy: LinkPolicy): Promise<void>;

  /** Patch the link + policy fields. Returns the post-update snapshot.
   *  Throws ShareNotFoundError if the row vanished, or
   *  ConcurrentModificationError if the in-memory seq raced. */
  update(
    workspaceId: string,
    linkId: string,
    patch: UpdateShareInput,
    expectedSeq: number,
  ): Promise<ShareLinkSnapshot>;

  /** Extend the link's expiry. Returns the post-update snapshot. */
  extendExpiry(
    workspaceId: string,
    linkId: string,
    input: ExtendExpiryInput,
    expectedSeq: number,
  ): Promise<ShareLinkSnapshot>;

  /** Rotate the token — update token_hash on the link. Returns the post-update snapshot. */
  rotateToken(
    workspaceId: string,
    linkId: string,
    newTokenHash: string,
    actorId: string,
    expectedSeq: number,
  ): Promise<ShareLinkSnapshot>;

  /** Soft-revoke (status='revoked', revoked_at=now). Returns the post-update snapshot. */
  revoke(
    workspaceId: string,
    linkId: string,
    actorId: string,
    expectedSeq: number,
  ): Promise<ShareLinkSnapshot>;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** True iff `s` is a usable (non-nil) store. Mirrors the P13 nil-guard
 *  idiom but adapted for TS — in TS we cannot dereference a null/undefined
 *  store, so callers can use this guard before invocation. */
export function isStore(s: ShareStore | null | undefined): s is ShareStore {
  return s !== null && s !== undefined;
}
