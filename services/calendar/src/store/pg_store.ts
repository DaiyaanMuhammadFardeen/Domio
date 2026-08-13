/**
 * pg-backed calendar store (Phase 18 W3).
 *
 * Full parameterized-SQL implementation of all {@link CalendarStore} methods.
 * Accepts a `Pool` (pg's public interface). Every method checks
 * `this.pool != null` upfront and throws {@link StoreNotConfiguredError}.
 *
 * SQL conventions (from services/merge-requests/src/store/pg_store.ts):
 *  - All queries use $N parameterised placeholders.
 *  - timestamptz ↔ Date: node-pg returns Date for timestamptz; on insert
 *    we pass Date objects directly.
 *  - Dynamic UPDATE via 'key' in patch pattern.
 *  - withTransaction<T> for atomic multi-statement operations.
 */

import type { Pool as PgPool, PoolClient } from 'pg';
import type { CalendarLink, CalendarVendor } from '../types.js';
import type { CalendarStore } from './store.js';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class PgCalendarStore implements CalendarStore {
  /** Public for test injection. */
  readonly pool: PgPool | null;

  constructor(pool: PgPool | null) {
    this.pool = pool;
  }

  // -------------------------------------------------------------------------
  // Transaction helper
  // -------------------------------------------------------------------------

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
  // saveLink (INSERT)
  // -------------------------------------------------------------------------

  async saveLink(link: CalendarLink): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('saveLink');
    await this.pool.query(
      `INSERT INTO calendar_link (
        id, workspace_id, deck_id, user_id, vendor,
        event_id, event_start_at, is_recurring, recurrence_id,
        last_synced_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12
      )`,
      [
        link.id,
        link.workspace_id,
        link.deck_id,
        link.user_id,
        link.vendor,
        link.event_id,
        link.event_start_at,
        link.is_recurring,
        link.recurrence_id,
        link.last_synced_at,
        link.created_at,
        link.updated_at,
      ],
    );
  }

  // -------------------------------------------------------------------------
  // getLink
  // -------------------------------------------------------------------------

  async getLink(id: string): Promise<CalendarLink | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getLink');
    const { rows } = await this.pool.query('SELECT * FROM calendar_link WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    return calendarLinkRowToDomain(rows[0]!);
  }

  // -------------------------------------------------------------------------
  // listLinksByDeck
  // -------------------------------------------------------------------------

  async listLinksByDeck(deckId: string): Promise<CalendarLink[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listLinksByDeck');
    const { rows } = await this.pool.query(
      'SELECT * FROM calendar_link WHERE deck_id = $1 ORDER BY event_start_at ASC',
      [deckId],
    );
    return rows.map(calendarLinkRowToDomain);
  }

  // -------------------------------------------------------------------------
  // listLinksByUser
  // -------------------------------------------------------------------------

  async listLinksByUser(userId: string): Promise<CalendarLink[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listLinksByUser');
    const { rows } = await this.pool.query(
      'SELECT * FROM calendar_link WHERE user_id = $1 ORDER BY event_start_at ASC',
      [userId],
    );
    return rows.map(calendarLinkRowToDomain);
  }

  // -------------------------------------------------------------------------
  // deleteLink
  // -------------------------------------------------------------------------

  async deleteLink(id: string): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('deleteLink');
    await this.pool.query('DELETE FROM calendar_link WHERE id = $1', [id]);
  }

  // -------------------------------------------------------------------------
  // findDuplicateLink
  // -------------------------------------------------------------------------

  async findDuplicateLink(
    deckId: string,
    vendor: string,
    eventId: string,
  ): Promise<CalendarLink | null> {
    if (!this.pool) throw new StoreNotConfiguredError('findDuplicateLink');
    const { rows } = await this.pool.query(
      'SELECT * FROM calendar_link WHERE deck_id = $1 AND vendor = $2 AND event_id = $3 LIMIT 1',
      [deckId, vendor, eventId],
    );
    if (rows.length === 0) return null;
    return calendarLinkRowToDomain(rows[0]!);
  }
}

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

function calendarLinkRowToDomain(row: Record<string, unknown>): CalendarLink {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    deck_id: row.deck_id as string,
    user_id: row.user_id as string,
    vendor: row.vendor as CalendarVendor,
    event_id: row.event_id as string,
    event_start_at: toDate(row.event_start_at),
    is_recurring: row.is_recurring as boolean,
    recurrence_id: row.recurrence_id as string | null,
    last_synced_at: toDate(row.last_synced_at),
    created_at: toDate(row.created_at),
    updated_at: toDate(row.updated_at),
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
  constructor(
    public readonly op: string,
    public readonly args: Record<string, unknown>,
  ) {
    super(`pg store op ${op} not yet implemented; args=${JSON.stringify(args)}`);
    this.name = 'StoreNotImplementedError';
  }
}
