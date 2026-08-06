/**
 * pgx-backed share-link store (Phase 14 W1).
 *
 * Skeleton + nil-guards. Full DML lands in M2 once the migration is
 * applied against a live Postgres (M1 ships the schema; M2 wires it).
 *
 * The store accepts a `Pool` (pgx-pool's public interface). Every method
 * checks `s == null || s.pool == null` upfront and throws `StoreError`
 * so that callers using `ts-ignore` or runtime-resolved configs don't
 * trigger SIGSEGV-style null dereferences. This mirrors the P13 M1
 * pattern in `services/mcp-server/internal/store/pgx_store.go`.
 */

import type { Pool as PgPool } from 'pg';
import type {
  CreateShareInput,
  ExtendExpiryInput,
  LinkPolicy,
  ShareLink,
  UpdateShareInput,
} from '../types.js';
import {
  validateCreateInput,
  validateExtendExpiry,
  validateUpdateInput,
} from '../types.js';
import type { ShareLinkSnapshot, ShareStore } from './store.js';

/**
 * Thin wrapper around the pgx Pool. Exists as a struct so callers can
 * stub it in tests without standing up a real Postgres. All methods
 * short-circuit with StoreError when `s` or `s.pool` is null.
 */
export class PgShareStore implements ShareStore {
  /** Public for test injection. */
  readonly pool: PgPool | null;

  constructor(pool: PgPool | null) {
    this.pool = pool;
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  async findById(workspaceId: string, linkId: string): Promise<ShareLinkSnapshot | null> {
    if (!this.pool) throw new StoreNotConfiguredError('findById');
    // M2 wires the real query:
    //   SELECT ... FROM share_link JOIN link_policy ON ...
    //   WHERE workspace_id = $1 AND id = $2
    throw new StoreNotImplementedError('findById', { workspaceId, linkId });
  }

  async findByShortId(workspaceId: string, shortId: string): Promise<ShareLinkSnapshot | null> {
    if (!this.pool) throw new StoreNotConfiguredError('findByShortId');
    throw new StoreNotImplementedError('findByShortId', { workspaceId, shortId });
  }

  async findBySlug(workspaceId: string, slug: string): Promise<ShareLinkSnapshot | null> {
    if (!this.pool) throw new StoreNotConfiguredError('findBySlug');
    throw new StoreNotImplementedError('findBySlug', { workspaceId, slug });
  }

  async shortIdExists(workspaceId: string, shortId: string): Promise<boolean> {
    if (!this.pool) throw new StoreNotConfiguredError('shortIdExists');
    throw new StoreNotImplementedError('shortIdExists', { workspaceId, shortId });
  }

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  async insert(_input: CreateShareInput, link: ShareLink, _policy: LinkPolicy): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insert');
    validateCreateInput(_input);
    throw new StoreNotImplementedError('insert', { linkId: link.id });
  }

  async update(
    workspaceId: string,
    linkId: string,
    patch: UpdateShareInput,
    _expectedSeq: number,
  ): Promise<ShareLinkSnapshot> {
    if (!this.pool) throw new StoreNotConfiguredError('update');
    validateUpdateInput(patch);
    throw new StoreNotImplementedError('update', { workspaceId, linkId });
  }

  async extendExpiry(
    workspaceId: string,
    linkId: string,
    input: ExtendExpiryInput,
    _expectedSeq: number,
  ): Promise<ShareLinkSnapshot> {
    if (!this.pool) throw new StoreNotConfiguredError('extendExpiry');
    validateExtendExpiry(input);
    throw new StoreNotImplementedError('extendExpiry', { workspaceId, linkId });
  }

  async rotateToken(
    workspaceId: string,
    linkId: string,
    _newTokenHash: string,
    _actorId: string,
    _expectedSeq: number,
  ): Promise<ShareLinkSnapshot> {
    if (!this.pool) throw new StoreNotConfiguredError('rotateToken');
    throw new StoreNotImplementedError('rotateToken', { workspaceId, linkId });
  }

  async revoke(
    workspaceId: string,
    linkId: string,
    _actorId: string,
    _expectedSeq: number,
  ): Promise<ShareLinkSnapshot> {
    if (!this.pool) throw new StoreNotConfiguredError('revoke');
    throw new StoreNotImplementedError('revoke', { workspaceId, linkId });
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class StoreNotConfiguredError extends Error {
  readonly code = 'STORE_NOT_CONFIGURED' as const;
  constructor(public readonly op: string) {
    super(`pg store has no pool configured (op=${op})`);
    this.name = 'StoreNotConfiguredError';
  }
}

export class StoreNotImplementedError extends Error {
  readonly code = 'STORE_NOT_IMPLEMENTED' as const;
  constructor(public readonly op: string, public readonly args: Record<string, unknown>) {
    super(`pg store op ${op} not yet implemented (M2); args=${JSON.stringify(args)}`);
    this.name = 'StoreNotImplementedError';
  }
}

/** Nil-guard for a possibly-undefined pg store. Mirrors `isStore`. */
export function isPgStore(s: PgShareStore | null | undefined): s is PgShareStore {
  return s !== null && s !== undefined;
}