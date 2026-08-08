/**
 * pg-backed merge request store (Phase 18 W2).
 *
 * Full parameterized-SQL implementation of all {@link MergeRequestStore} methods.
 * Accepts a `Pool` (pg's public interface). Every method checks
 * `this.pool != null` upfront and throws {@link StoreNotConfiguredError}.
 *
 * SQL conventions (from services/collab/src/store/pg_store.ts):
 *  - All queries use $N parameterised placeholders.
 *  - jsonb columns (slide_diffs, binding_diffs): inserted via $N::jsonb,
 *    read via parseJsonb since node-pg returns jsonb as a plain object.
 *  - timestamptz ↔ Date: node-pg returns Date for timestamptz; on insert
 *    we pass Date objects directly.
 *  - Dynamic UPDATE via 'key' in patch pattern.
 *  - withTransaction<T> for atomic multi-statement operations.
 */

import type { Pool as PgPool, PoolClient } from 'pg';
import type { MergeRequest, SlideDiff, MergeRequestStatus, SlideDiffEntry, BindingDiffEntry } from '../types.js';
import type { MergeRequestStore } from './store.js';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class PgMergeRequestStore implements MergeRequestStore {
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
  // Merge requests
  // -------------------------------------------------------------------------

  async insertMergeRequest(mr: MergeRequest): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertMergeRequest');
    await this.pool.query(
      `INSERT INTO merge_request (
        id, workspace_id, deck_id, source_branch, target_branch,
        title, description, author_id, status, diff_id,
        created_at, updated_at, created_by, updated_by,
        merged_at, merged_by, merge_commit_id
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17
      )`,
      [
        mr.id,
        mr.workspace_id,
        mr.deck_id,
        mr.source_branch,
        mr.target_branch,
        mr.title,
        mr.description,
        mr.author_id,
        mr.status,
        mr.diff_id,
        mr.created_at,
        mr.updated_at,
        mr.created_by,
        mr.updated_by,
        mr.merged_at,
        mr.merged_by,
        mr.merge_commit_id,
      ],
    );
  }

  async updateMergeRequest(mr: MergeRequest): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('updateMergeRequest');
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Scalar text fields
    const scalarFields: Array<{ key: keyof MergeRequest; dbCol: string }> = [
      { key: 'title', dbCol: 'title' },
      { key: 'description', dbCol: 'description' },
      { key: 'status', dbCol: 'status' },
      { key: 'diff_id', dbCol: 'diff_id' },
      { key: 'merged_by', dbCol: 'merged_by' },
      { key: 'merge_commit_id', dbCol: 'merge_commit_id' },
      { key: 'updated_by', dbCol: 'updated_by' },
    ];
    for (const f of scalarFields) {
      if (f.key in mr) {
        setClauses.push(`${f.dbCol} = $${idx++}`);
        params.push(mr[f.key]);
      }
    }

    // Nullable timestamptz fields
    const tsFields: Array<{ key: keyof MergeRequest; dbCol: string }> = [
      { key: 'merged_at', dbCol: 'merged_at' },
    ];
    for (const f of tsFields) {
      if (f.key in mr) {
        setClauses.push(`${f.dbCol} = $${idx++}`);
        params.push(mr[f.key]);
      }
    }

    // Always bump updated_at
    setClauses.push(`updated_at = $${idx++}`);
    params.push(new Date());

    params.push(mr.id);
    const sql = `UPDATE merge_request SET ${setClauses.join(', ')} WHERE id = $${idx}`;
    await this.pool.query(sql, params);
  }

  async getMergeRequest(id: string): Promise<MergeRequest | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getMergeRequest');
    const { rows } = await this.pool.query(
      'SELECT * FROM merge_request WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return null;
    return mergeRequestRowToDomain(rows[0]!);
  }

  async listMergeRequestsByDeck(
    deckId: string,
    opts?: { status?: MergeRequestStatus },
  ): Promise<MergeRequest[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listMergeRequestsByDeck');
    const conditions: string[] = ['deck_id = $1'];
    const params: unknown[] = [deckId];
    let idx = 2;
    if (opts?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(opts.status);
    }
    const sql = `SELECT * FROM merge_request WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`;
    const { rows } = await this.pool.query(sql, params);
    return rows.map(mergeRequestRowToDomain);
  }

  // -------------------------------------------------------------------------
  // Slide diffs
  // -------------------------------------------------------------------------

  async insertSlideDiff(diff: SlideDiff): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertSlideDiff');
    await this.pool.query(
      `INSERT INTO slide_diff (
        id, workspace_id, mr_id, base_version_id, target_version_id,
        source_version_id, slide_diffs, binding_diffs, computed_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7::jsonb, $8::jsonb, $9
      )`,
      [
        diff.id,
        diff.workspace_id,
        diff.mr_id,
        diff.base_version_id,
        diff.target_version_id,
        diff.source_version_id,
        JSON.stringify(diff.slide_diffs),
        JSON.stringify(diff.binding_diffs),
        diff.computed_at,
      ],
    );
  }

  async getSlideDiff(id: string): Promise<SlideDiff | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getSlideDiff');
    const { rows } = await this.pool.query(
      'SELECT * FROM slide_diff WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return null;
    return slideDiffRowToDomain(rows[0]!);
  }

  async getSlideDiffByMrId(mrId: string): Promise<SlideDiff | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getSlideDiffByMrId');
    const { rows } = await this.pool.query(
      'SELECT * FROM slide_diff WHERE mr_id = $1',
      [mrId],
    );
    if (rows.length === 0) return null;
    return slideDiffRowToDomain(rows[0]!);
  }

  async updateSlideDiff(
    id: string,
    patch: { slide_diffs: SlideDiffEntry[]; binding_diffs: BindingDiffEntry[] },
  ): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('updateSlideDiff');
    await this.pool.query(
      `UPDATE slide_diff SET
        slide_diffs = $1::jsonb,
        binding_diffs = $2::jsonb,
        computed_at = now()
      WHERE id = $3`,
      [
        JSON.stringify(patch.slide_diffs),
        JSON.stringify(patch.binding_diffs),
        id,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

function mergeRequestRowToDomain(row: Record<string, unknown>): MergeRequest {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    deck_id: row.deck_id as string,
    source_branch: row.source_branch as string,
    target_branch: row.target_branch as string,
    title: row.title as string,
    description: row.description as string | null,
    author_id: row.author_id as string,
    status: row.status as MergeRequestStatus,
    diff_id: row.diff_id as string | null,
    created_at: toDate(row.created_at),
    updated_at: toDate(row.updated_at),
    created_by: row.created_by as string | null,
    updated_by: row.updated_by as string | null,
    merged_at: row.merged_at != null ? toDate(row.merged_at) : null,
    merged_by: row.merged_by as string | null,
    merge_commit_id: row.merge_commit_id as string | null,
  };
}

function slideDiffRowToDomain(row: Record<string, unknown>): SlideDiff {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    mr_id: row.mr_id as string,
    base_version_id: row.base_version_id as string,
    target_version_id: row.target_version_id as string,
    source_version_id: row.source_version_id as string,
    slide_diffs: parseJsonb(row.slide_diffs) as SlideDiffEntry[],
    binding_diffs: parseJsonb(row.binding_diffs) as BindingDiffEntry[],
    computed_at: toDate(row.computed_at),
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
