/**
 * pg-backed guest store (Phase 18).
 *
 * Full parameterized-SQL implementation of all {@link GuestStore} methods.
 * Accepts a `Pool` (pg's public interface). Every mutating method checks
 * `this.pool != null` upfront and throws {@link StoreNotConfiguredError}.
 *
 * SQL conventions:
 *  - All queries use $N parameterised placeholders (no string interpolation).
 *  - text[] columns: inserted via $N::text[], read as string[]
 *    (node-pg returns string[] for text[] columns automatically).
 *  - timestamptz ↔ Date: node-pg returns Date for timestamptz; on insert
 *    we pass Date objects directly (pg handles conversion).
 *  - withTransaction<T> for atomic multi-statement operations.
 */

import type { Pool as PgPool, PoolClient } from 'pg';
import type { GuestAccess, GuestMagicLink } from '../types.js';
import type { GuestStore } from './store.js';
import { GuestNotFoundError } from '../types.js';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class PgGuestStore implements GuestStore {
  /** Public for test injection. */
  readonly pool: PgPool | null;

  constructor(pool: PgPool | null) {
    this.pool = pool;
  }

  // -------------------------------------------------------------------------
  // Transaction helper
  // -------------------------------------------------------------------------

  /**
   * Execute `fn` inside a BEGIN/COMMIT transaction. On exception the
   * transaction is rolled back. The callback receives a PoolClient that
   * must NOT be released by the caller — this method handles cleanup.
   */
  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new StoreNotConfiguredError('withTransaction');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Guest access
  // -------------------------------------------------------------------------

  async createGuestAccess(row: GuestAccess): Promise<GuestAccess> {
    if (!this.pool) throw new StoreNotConfiguredError('createGuestAccess');
    await this.pool.query(
      `INSERT INTO guest_access (
        id, workspace_id, inviter_id, guest_email, guest_user_id,
        scope_type, scope_id, capabilities, expires_at,
        created_at, revoked_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8::text[], $9,
        $10, $11
      )`,
      [
        row.guest_access_id,
        row.workspace_id,
        row.inviter_id,
        row.guest_email,
        row.guest_user_id,
        row.scope_type,
        row.scope_id,
        row.capabilities,
        row.expires_at,
        row.created_at,
        row.revoked_at,
      ],
    );
    return row;
  }

  async getGuestAccess(id: string): Promise<GuestAccess | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getGuestAccess');
    const { rows } = await this.pool.query(
      'SELECT * FROM guest_access WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return null;
    return guestAccessRowToDomain(rows[0]!);
  }

  async getGuestAccessByEmail(
    scopeType: string,
    scopeId: string,
    email: string,
  ): Promise<GuestAccess | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getGuestAccessByEmail');
    const { rows } = await this.pool.query(
      'SELECT * FROM guest_access WHERE scope_type = $1 AND scope_id = $2 AND guest_email = $3 LIMIT 1',
      [scopeType, scopeId, email],
    );
    if (rows.length === 0) return null;
    return guestAccessRowToDomain(rows[0]!);
  }

  async setGuestRevoked(id: string, at: Date): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('setGuestRevoked');
    const { rows } = await this.pool.query(
      'UPDATE guest_access SET revoked_at = $1 WHERE id = $2 RETURNING id',
      [at, id],
    );
    if (rows.length === 0) throw new GuestNotFoundError(id);
  }

  async markGuestUser(guestAccessId: string, guestUserId: string): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('markGuestUser');
    const { rows } = await this.pool.query(
      'UPDATE guest_access SET guest_user_id = $1 WHERE id = $2 RETURNING id',
      [guestUserId, guestAccessId],
    );
    if (rows.length === 0) throw new GuestNotFoundError(guestAccessId);
  }

  // -------------------------------------------------------------------------
  // Magic links
  // -------------------------------------------------------------------------

  async createMagicLink(row: GuestMagicLink): Promise<GuestMagicLink> {
    if (!this.pool) throw new StoreNotConfiguredError('createMagicLink');
    await this.pool.query(
      `INSERT INTO guest_magic_link (
        id, workspace_id, guest_access_id, token_hash,
        expires_at, consumed_at, invalidated_at,
        created_at, created_by
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9
      )`,
      [
        row.id,
        row.workspace_id,
        row.guest_access_id,
        row.token_hash,
        row.expires_at,
        row.consumed_at,
        row.invalidated_at,
        row.created_at,
        row.created_by,
      ],
    );
    return row;
  }

  async getOpenMagicLinks(guestAccessId: string): Promise<GuestMagicLink[]> {
    if (!this.pool) throw new StoreNotConfiguredError('getOpenMagicLinks');
    const { rows } = await this.pool.query(
      `SELECT * FROM guest_magic_link
       WHERE guest_access_id = $1
         AND consumed_at IS NULL
         AND invalidated_at IS NULL
       ORDER BY created_at ASC`,
      [guestAccessId],
    );
    return rows.map(magicLinkRowToDomain);
  }

  async getMagicLinkByHash(tokenHash: string): Promise<GuestMagicLink | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getMagicLinkByHash');
    const { rows } = await this.pool.query(
      'SELECT * FROM guest_magic_link WHERE token_hash = $1',
      [tokenHash],
    );
    if (rows.length === 0) return null;
    return magicLinkRowToDomain(rows[0]!);
  }

  async markMagicLinkConsumed(id: string, at: Date): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('markMagicLinkConsumed');
    const { rows } = await this.pool.query(
      'UPDATE guest_magic_link SET consumed_at = $1 WHERE id = $2 RETURNING id',
      [at, id],
    );
    if (rows.length === 0) throw new GuestNotFoundError(id);
  }

  async invalidateMagicLinks(guestAccessId: string, at: Date): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('invalidateMagicLinks');
    await this.pool.query(
      `UPDATE guest_magic_link
       SET invalidated_at = $1
       WHERE guest_access_id = $2
         AND consumed_at IS NULL
         AND invalidated_at IS NULL`,
      [at, guestAccessId],
    );
  }
}

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

function guestAccessRowToDomain(row: Record<string, unknown>): GuestAccess {
  return {
    guest_access_id: row.id as string,
    workspace_id: row.workspace_id as string,
    inviter_id: row.inviter_id as string,
    guest_email: row.guest_email as string,
    guest_user_id: row.guest_user_id as string | null,
    scope_type: row.scope_type as GuestAccess['scope_type'],
    scope_id: row.scope_id as string,
    capabilities: (row.capabilities as string[]) ?? [],
    expires_at: toDate(row.expires_at),
    created_at: toDate(row.created_at),
    revoked_at: row.revoked_at != null ? toDate(row.revoked_at) : null,
  };
}

function magicLinkRowToDomain(row: Record<string, unknown>): GuestMagicLink {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    guest_access_id: row.guest_access_id as string,
    token_hash: row.token_hash as string,
    expires_at: toDate(row.expires_at),
    consumed_at: row.consumed_at != null ? toDate(row.consumed_at) : null,
    invalidated_at: row.invalidated_at != null ? toDate(row.invalidated_at) : null,
    created_at: toDate(row.created_at),
    created_by: row.created_by as string,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a timestamptz value (Date from pg, or string) to a Date. */
function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (typeof val === 'string') return new Date(val);
  return new Date(val as number);
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
    super(`pg store op ${op} not yet implemented; args=${JSON.stringify(args)}`);
    this.name = 'StoreNotImplementedError';
  }
}
