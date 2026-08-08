/**
 * pg-backed suggestions store (Phase 18 #182).
 *
 * Full parameterized-SQL implementation of all {@link SuggestionsStore} methods.
 * Accepts a `Pool` (pg's public interface). Every method checks
 * `this.pool != null` upfront and throws {@link StoreNotConfiguredError}.
 *
 * SQL conventions (same as collab pg_store):
 *  - All queries use $N parameterised placeholders (no string interpolation).
 *  - jsonb columns (operation): inserted via $N::jsonb, read via JSON.parse(row.col)
 *    since node-pg returns jsonb as a plain object.
 *  - timestamptz ↔ Date: node-pg returns Date for timestamptz; on insert
 *    we pass Date objects directly (pg handles conversion).
 *  - snake_case domain fields map 1:1 to snake_case DB columns.
 */

import type { Pool as PgPool } from 'pg';
import type { Suggestion, SuggestionStatus } from '../types.js';
import { SuggestionNotFoundError } from '../types.js';
import type { SuggestionsStore } from './store.js';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class PgSuggestionsStore implements SuggestionsStore {
  /** Public for test injection. */
  readonly pool: PgPool | null;

  constructor(pool: PgPool | null) {
    this.pool = pool;
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async insertSuggestion(suggestion: Suggestion): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertSuggestion');
    await this.pool.query(
      `INSERT INTO suggestion (
        id, workspace_id, deck_id, session_id, author_id,
        target_type, target_id, operation, status, thread_id,
        created_at, updated_at, created_by, updated_by,
        resolved_at, resolved_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8::jsonb, $9, $10,
        $11, $12, $13, $14,
        $15, $16
      )`,
      [
        suggestion.id,
        suggestion.workspace_id,
        suggestion.deck_id,
        suggestion.session_id,
        suggestion.author_id,
        suggestion.target_type,
        suggestion.target_id,
        JSON.stringify(suggestion.operation),
        suggestion.status,
        suggestion.thread_id ?? null,
        suggestion.created_at,
        suggestion.updated_at,
        suggestion.created_by ?? null,
        suggestion.updated_by ?? null,
        suggestion.resolved_at ?? null,
        suggestion.resolved_by ?? null,
      ],
    );
  }

  async getSuggestion(suggestionId: string): Promise<Suggestion | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getSuggestion');
    const { rows } = await this.pool.query(
      'SELECT * FROM suggestion WHERE id = $1',
      [suggestionId],
    );
    if (rows.length === 0) return null;
    return suggestionRowToDomain(rows[0]!);
  }

  async listSuggestionsByDeck(
    deckId: string,
    status?: SuggestionStatus,
  ): Promise<Suggestion[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listSuggestionsByDeck');
    const conditions: string[] = ['deck_id = $1'];
    const params: unknown[] = [deckId];
    let idx = 2;
    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    const sql = `SELECT * FROM suggestion WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`;
    const { rows } = await this.pool.query(sql, params);
    return rows.map(suggestionRowToDomain);
  }

  async listSuggestionsByWorkspace(workspaceId: string): Promise<Suggestion[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listSuggestionsByWorkspace');
    const { rows } = await this.pool.query(
      'SELECT * FROM suggestion WHERE workspace_id = $1 ORDER BY created_at ASC',
      [workspaceId],
    );
    return rows.map(suggestionRowToDomain);
  }

  async updateSuggestion(
    suggestionId: string,
    patch: Partial<Pick<Suggestion, 'status' | 'resolved_at' | 'resolved_by' | 'updated_at' | 'updated_by'>>,
  ): Promise<Suggestion> {
    if (!this.pool) throw new StoreNotConfiguredError('updateSuggestion');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Scalar text fields
    const scalarFields: Array<{ key: string; dbCol: string }> = [
      { key: 'status', dbCol: 'status' },
      { key: 'resolved_by', dbCol: 'resolved_by' },
      { key: 'updated_by', dbCol: 'updated_by' },
    ];
    for (const f of scalarFields) {
      if (f.key in patch) {
        setClauses.push(`${f.dbCol} = $${idx++}`);
        params.push((patch as Record<string, unknown>)[f.key]);
      }
    }

    // Nullable timestamptz fields
    const tsFields: Array<{ key: string; dbCol: string }> = [
      { key: 'resolved_at', dbCol: 'resolved_at' },
      { key: 'updated_at', dbCol: 'updated_at' },
    ];
    for (const f of tsFields) {
      if (f.key in patch) {
        setClauses.push(`${f.dbCol} = $${idx++}`);
        params.push((patch as Record<string, unknown>)[f.key]);
      }
    }

    if (setClauses.length === 0) {
      // Nothing to update — just fetch and return
      const existing = await this.getSuggestion(suggestionId);
      if (!existing) throw new SuggestionNotFoundError(suggestionId);
      return existing;
    }

    // Always bump updated_at if the patch didn't already include it
    if (!('updated_at' in patch)) {
      setClauses.push(`updated_at = $${idx++}`);
      params.push(new Date());
    }

    params.push(suggestionId);
    const sql = `UPDATE suggestion SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new SuggestionNotFoundError(suggestionId);
    return suggestionRowToDomain(rows[0]!);
  }

  async listOpenSuggestions(): Promise<Suggestion[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listOpenSuggestions');
    const { rows } = await this.pool.query(
      `SELECT * FROM suggestion WHERE status = 'open' ORDER BY created_at ASC`,
    );
    return rows.map(suggestionRowToDomain);
  }
}

// ---------------------------------------------------------------------------
// Row → domain mapper
// ---------------------------------------------------------------------------

/**
 * Convert a snake_case DB row to the Suggestion domain type.
 * DB columns already use snake_case which matches the domain interface.
 * jsonb columns (operation) come back as parsed objects from node-pg.
 */
function suggestionRowToDomain(row: Record<string, unknown>): Suggestion {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    deck_id: row.deck_id as string,
    session_id: row.session_id as string,
    author_id: row.author_id as string,
    target_type: row.target_type as Suggestion['target_type'],
    target_id: row.target_id as string,
    operation: parseJsonb(row.operation) as Suggestion['operation'],
    status: row.status as Suggestion['status'],
    created_at: toDate(row.created_at),
    updated_at: toDate(row.updated_at),
    // Conditionally include optional fields — exactOptionalPropertyTypes
    // forbids assigning `undefined` to `?` properties, so we spread only
    // when the value is non-null.
    ...(row.thread_id != null ? { thread_id: row.thread_id as string } : {}),
    ...(row.created_by != null ? { created_by: row.created_by as string } : {}),
    ...(row.updated_by != null ? { updated_by: row.updated_by as string } : {}),
    ...(row.resolved_at != null ? { resolved_at: toDate(row.resolved_at) } : {}),
    ...(row.resolved_by != null ? { resolved_by: row.resolved_by as string } : {}),
  } as Suggestion;
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
