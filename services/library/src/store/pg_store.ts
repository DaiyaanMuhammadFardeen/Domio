/**
 * pg-backed library store (Phase 18 Wave 3).
 *
 * Full parameterized-SQL implementation of all 13 {@link LibraryStore} methods.
 * Accepts a `Pool` (pg's public interface). Every mutating method checks
 * `this.pool != null` upfront and throws {@link StoreNotConfiguredError}.
 *
 * SQL conventions:
 *  - All queries use $N parameterised placeholders (no string interpolation).
 *  - jsonb columns (approval_chain, slide_snapshot, data_bindings, schedule):
 *    written via $N::jsonb + JSON.stringify(value); read via parseJsonb after
 *    node-pg returns parsed object (guard both shapes).
 *  - timestamptz ↔ Date: node-pg returns Date for timestamptz; on insert
 *    we pass Date objects directly (pg handles conversion).
 *  - text[] columns (tags): inserted via $N::text[], read as string[]
 *    (node-pg returns string[] for text[] columns automatically).
 *  - Nullable uuid/text fields: written as null when the domain value is null/undefined.
 *  - Dynamic UPDATE uses `'key' in patch` to distinguish undefined (skip) vs null (clear).
 *  - auto-updates `updated_at` when absent on tables that have it.
 *
 * Note: With `exactOptionalPropertyTypes: true`, optional domain fields (?)
 * are conditionally included via spread to avoid assigning `undefined` to
 * an optional property.
 */

import type { Pool as PgPool, PoolClient } from 'pg';
import type { SlideLibraryEntry, LibraryVersion, AutoUpdateBinding } from '../types.js';
import { EntryNotFoundError, BindingNotFoundError } from '../types.js';
import type { LibraryStore } from './store.js';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class PgLibraryStore implements LibraryStore {
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
  // Entries
  // -------------------------------------------------------------------------

  async insertEntry(entry: SlideLibraryEntry): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertEntry');
    await this.pool.query(
      `INSERT INTO slide_library_entry (
        id, workspace_id, scope, team_id, title, description,
        tags, owner_id, approval_chain, status, version_id,
        superseded_by, last_reviewed_at, created_at, updated_at,
        created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::text[], $8, $9::jsonb, $10, $11,
        $12, $13, $14, $15, $16, $17
      )`,
      [
        entry.id,
        entry.workspace_id,
        entry.scope,
        entry.team_id ?? null,
        entry.title,
        entry.description ?? null,
        [...entry.tags],
        entry.owner_id,
        JSON.stringify(entry.approval_chain),
        entry.status,
        entry.version_id,
        entry.superseded_by ?? null,
        entry.last_reviewed_at ?? null,
        entry.created_at,
        entry.updated_at,
        entry.created_by,
        entry.updated_by,
      ],
    );
  }

  async getEntry(entryId: string): Promise<SlideLibraryEntry | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getEntry');
    const { rows } = await this.pool.query(
      'SELECT * FROM slide_library_entry WHERE id = $1',
      [entryId],
    );
    if (rows.length === 0) return null;
    return entryRowToDomain(rows[0]!);
  }

  async listEntriesByWorkspace(workspaceId: string): Promise<SlideLibraryEntry[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listEntriesByWorkspace');
    const { rows } = await this.pool.query(
      'SELECT * FROM slide_library_entry WHERE workspace_id = $1 ORDER BY created_at ASC',
      [workspaceId],
    );
    return rows.map(entryRowToDomain);
  }

  async updateEntry(
    entryId: string,
    patch: Partial<Pick<SlideLibraryEntry, 'status' | 'version_id' | 'superseded_by' | 'last_reviewed_at' | 'updated_at' | 'updated_by'>>,
  ): Promise<SlideLibraryEntry> {
    if (!this.pool) throw new StoreNotConfiguredError('updateEntry');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Scalar text fields
    if ('status' in patch) {
      setClauses.push(`status = $${idx++}`);
      params.push(patch.status);
    }
    if ('version_id' in patch) {
      setClauses.push(`version_id = $${idx++}`);
      params.push(patch.version_id);
    }

    // Nullable text fields (superseded_by is optional in domain, nullable in DB)
    if ('superseded_by' in patch) {
      setClauses.push(`superseded_by = $${idx++}`);
      params.push(patch.superseded_by ?? null);
    }

    // Nullable uuid fields
    if ('updated_by' in patch) {
      setClauses.push(`updated_by = $${idx++}`);
      params.push(patch.updated_by ?? null);
    }

    // Nullable timestamptz fields
    if ('last_reviewed_at' in patch) {
      setClauses.push(`last_reviewed_at = $${idx++}`);
      params.push(patch.last_reviewed_at ?? null);
    }
    if ('updated_at' in patch) {
      setClauses.push(`updated_at = $${idx++}`);
      params.push(patch.updated_at);
    }

    if (setClauses.length === 0) {
      const existing = await this.getEntry(entryId);
      if (!existing) throw new EntryNotFoundError(entryId);
      return existing;
    }

    // Always bump updated_at if the patch didn't already include it
    if (!('updated_at' in patch)) {
      setClauses.push(`updated_at = $${idx++}`);
      params.push(new Date());
    }

    params.push(entryId);
    const sql = `UPDATE slide_library_entry SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new EntryNotFoundError(entryId);
    return entryRowToDomain(rows[0]!);
  }

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------

  async insertVersion(version: LibraryVersion): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertVersion');
    // NOTE: library_version DDL has workspace_id NOT NULL but the domain
    // LibraryVersion type does not include it. We pass '' as a placeholder;
    // the column is used for RLS/tenant isolation and is set at the DB level.
    await this.pool.query(
      `INSERT INTO library_version (
        id, workspace_id, entry_id, version_num,
        slide_snapshot, data_bindings, brand_locked,
        created_by, created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5::jsonb, $6::jsonb, $7,
        $8, $9
      )`,
      [
        version.id,
        '',
        version.entry_id,
        version.version_num,
        JSON.stringify(version.slide_snapshot),
        JSON.stringify(version.data_bindings),
        version.brand_locked,
        version.created_by,
        version.created_at,
      ],
    );
  }

  async getVersion(versionId: string): Promise<LibraryVersion | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getVersion');
    const { rows } = await this.pool.query(
      'SELECT * FROM library_version WHERE id = $1',
      [versionId],
    );
    if (rows.length === 0) return null;
    return versionRowToDomain(rows[0]!);
  }

  async listVersionsByEntry(entryId: string): Promise<LibraryVersion[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listVersionsByEntry');
    const { rows } = await this.pool.query(
      'SELECT * FROM library_version WHERE entry_id = $1 ORDER BY version_num ASC',
      [entryId],
    );
    return rows.map(versionRowToDomain);
  }

  async getMaxVersionNum(entryId: string): Promise<number> {
    if (!this.pool) throw new StoreNotConfiguredError('getMaxVersionNum');
    const { rows } = await this.pool.query(
      'SELECT COALESCE(MAX(version_num), 0) AS max_num FROM library_version WHERE entry_id = $1',
      [entryId],
    );
    return (rows[0]!.max_num as number) ?? 0;
  }

  // -------------------------------------------------------------------------
  // Auto-update bindings
  // -------------------------------------------------------------------------

  async insertBinding(binding: AutoUpdateBinding): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertBinding');
    await this.pool.query(
      `INSERT INTO auto_update_binding (
        id, workspace_id, consumer_deck_id, consumer_slide_id,
        library_entry_id, pinned_version_id, mode, schedule,
        is_mandatory, last_synced_at, last_sync_status,
        created_at, updated_at, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8::jsonb,
        $9, $10, $11,
        $12, $13, $14, $15
      )`,
      [
        binding.id,
        binding.workspace_id,
        binding.consumer_deck_id,
        binding.consumer_slide_id,
        binding.library_entry_id,
        binding.pinned_version_id ?? null,
        binding.mode,
        JSON.stringify(binding.schedule),
        binding.is_mandatory,
        binding.last_synced_at ?? null,
        binding.last_sync_status ?? null,
        binding.created_at,
        binding.updated_at,
        binding.created_by,
        binding.updated_by,
      ],
    );
  }

  async getBinding(bindingId: string): Promise<AutoUpdateBinding | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getBinding');
    const { rows } = await this.pool.query(
      'SELECT * FROM auto_update_binding WHERE id = $1',
      [bindingId],
    );
    if (rows.length === 0) return null;
    return bindingRowToDomain(rows[0]!);
  }

  async listBindingsByWorkspace(workspaceId: string): Promise<AutoUpdateBinding[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listBindingsByWorkspace');
    const { rows } = await this.pool.query(
      'SELECT * FROM auto_update_binding WHERE workspace_id = $1 ORDER BY created_at ASC',
      [workspaceId],
    );
    return rows.map(bindingRowToDomain);
  }

  async listBindingsByEntry(libraryEntryId: string): Promise<AutoUpdateBinding[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listBindingsByEntry');
    const { rows } = await this.pool.query(
      'SELECT * FROM auto_update_binding WHERE library_entry_id = $1 ORDER BY created_at ASC',
      [libraryEntryId],
    );
    return rows.map(bindingRowToDomain);
  }

  async updateBinding(
    bindingId: string,
    patch: Partial<Pick<AutoUpdateBinding, 'pinned_version_id' | 'mode' | 'schedule' | 'is_mandatory' | 'last_synced_at' | 'last_sync_status' | 'updated_at' | 'updated_by'>>,
  ): Promise<AutoUpdateBinding> {
    if (!this.pool) throw new StoreNotConfiguredError('updateBinding');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Nullable text fields
    if ('pinned_version_id' in patch) {
      setClauses.push(`pinned_version_id = $${idx++}`);
      params.push(patch.pinned_version_id ?? null);
    }
    if ('mode' in patch) {
      setClauses.push(`mode = $${idx++}`);
      params.push(patch.mode);
    }
    if ('last_sync_status' in patch) {
      setClauses.push(`last_sync_status = $${idx++}`);
      params.push(patch.last_sync_status ?? null);
    }

    // Nullable uuid fields
    if ('updated_by' in patch) {
      setClauses.push(`updated_by = $${idx++}`);
      params.push(patch.updated_by ?? null);
    }

    // jsonb fields
    if ('schedule' in patch) {
      setClauses.push(`schedule = $${idx++}::jsonb`);
      params.push(JSON.stringify(patch.schedule));
    }

    // Scalar boolean fields
    if ('is_mandatory' in patch) {
      setClauses.push(`is_mandatory = $${idx++}`);
      params.push(patch.is_mandatory);
    }

    // Nullable timestamptz fields
    if ('last_synced_at' in patch) {
      setClauses.push(`last_synced_at = $${idx++}`);
      params.push(patch.last_synced_at ?? null);
    }
    if ('updated_at' in patch) {
      setClauses.push(`updated_at = $${idx++}`);
      params.push(patch.updated_at);
    }

    if (setClauses.length === 0) {
      const existing = await this.getBinding(bindingId);
      if (!existing) throw new BindingNotFoundError(bindingId);
      return existing;
    }

    // Always bump updated_at if the patch didn't already include it
    if (!('updated_at' in patch)) {
      setClauses.push(`updated_at = $${idx++}`);
      params.push(new Date());
    }

    params.push(bindingId);
    const sql = `UPDATE auto_update_binding SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new BindingNotFoundError(bindingId);
    return bindingRowToDomain(rows[0]!);
  }

  async deleteBinding(bindingId: string): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('deleteBinding');
    const { rowCount } = await this.pool.query(
      'DELETE FROM auto_update_binding WHERE id = $1',
      [bindingId],
    );
    if ((rowCount ?? 0) === 0) throw new BindingNotFoundError(bindingId);
  }

  async listAllBindings(): Promise<AutoUpdateBinding[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listAllBindings');
    const { rows } = await this.pool.query(
      'SELECT * FROM auto_update_binding ORDER BY created_at ASC',
    );
    return rows.map(bindingRowToDomain);
  }
}

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

/**
 * Helper to conditionally include an optional field.
 * With `exactOptionalPropertyTypes: true`, we can't assign `undefined` to
 * an optional property — we must either include the value or omit the key.
 */
function optionalField<T>(key: string, val: T | undefined | null): Record<string, T> {
  if (val === undefined || val === null) return {};
  return { [key]: val };
}

function entryRowToDomain(row: Record<string, unknown>): SlideLibraryEntry {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    scope: row.scope as SlideLibraryEntry['scope'],
    title: row.title as string,
    tags: (row.tags as string[]) ?? [],
    owner_id: row.owner_id as string,
    approval_chain: parseJsonb(row.approval_chain) as Record<string, unknown>,
    status: row.status as SlideLibraryEntry['status'],
    version_id: row.version_id as string,
    created_at: toDate(row.created_at),
    updated_at: toDate(row.updated_at),
    created_by: row.created_by as string,
    updated_by: row.updated_by as string,
    ...optionalField('team_id', row.team_id as string | undefined),
    ...optionalField('description', row.description as string | undefined),
    ...optionalField('superseded_by', row.superseded_by as string | undefined),
    ...optionalField('last_reviewed_at', row.last_reviewed_at != null ? toDate(row.last_reviewed_at) : undefined),
  };
}

function versionRowToDomain(row: Record<string, unknown>): LibraryVersion {
  return {
    id: row.id as string,
    entry_id: row.entry_id as string,
    version_num: row.version_num as number,
    slide_snapshot: parseJsonb(row.slide_snapshot) as Record<string, unknown>,
    data_bindings: parseJsonb(row.data_bindings) as readonly Record<string, unknown>[],
    brand_locked: row.brand_locked as boolean,
    created_by: row.created_by as string,
    created_at: toDate(row.created_at),
  };
}

function bindingRowToDomain(row: Record<string, unknown>): AutoUpdateBinding {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    consumer_deck_id: row.consumer_deck_id as string,
    consumer_slide_id: row.consumer_slide_id as string,
    library_entry_id: row.library_entry_id as string,
    mode: row.mode as AutoUpdateBinding['mode'],
    schedule: parseJsonb(row.schedule) as Record<string, unknown>,
    is_mandatory: row.is_mandatory as boolean,
    created_at: toDate(row.created_at),
    updated_at: toDate(row.updated_at),
    created_by: row.created_by as string,
    updated_by: row.updated_by as string,
    ...optionalField('pinned_version_id', row.pinned_version_id as string | undefined),
    ...optionalField('last_synced_at', row.last_synced_at != null ? toDate(row.last_synced_at) : undefined),
    ...optionalField('last_sync_status', row.last_sync_status as string | undefined),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a jsonb value that may already be an object (from node-pg) or a string. */
function parseJsonb(val: unknown): unknown {
  if (val == null) return null;
  if (typeof val === 'string') return JSON.parse(val);
  // node-pg already deserializes jsonb into a JS object
  return val;
}

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
