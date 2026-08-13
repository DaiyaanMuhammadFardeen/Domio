/**
 * @domio/annotation-engine — Postgres store.
 *
 * Maps `annotation_layer` table columns to the AnnotationLayerRecord.
 * Tenant isolation is enforced via `app.tenant_id` (RLS) — the runtime
 * is expected to set this before the query.
 */

import type { Pool, PoolClient } from 'pg';
import type { AnnotationLayerRecord, AnnotationKind, AnnotationGeometry } from '../types.js';
import { makeStoreError, type AnnotationStore } from './store.js';

export interface PgAnnotationStoreOptions {
  pool: Pool | PoolClient;
  /** When true, uses `pool.connect()` per call. Default false. */
  perCallClient?: boolean;
}

export class PgAnnotationStore implements AnnotationStore {
  private readonly pool: Pool | PoolClient;
  private readonly perCallClient: boolean;

  constructor(opts: PgAnnotationStoreOptions) {
    this.pool = opts.pool;
    this.perCallClient = opts.perCallClient ?? false;
  }

  private async withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    if (this.perCallClient) {
      const c = await (this.pool as Pool).connect();
      try {
        return await fn(c);
      } finally {
        c.release();
      }
    }
    return fn(this.pool as PoolClient);
  }

  async create(row: AnnotationLayerRecord): Promise<AnnotationLayerRecord> {
    return this.withClient(async (c) => {
      const res = await c.query(
        `INSERT INTO annotation_layer (
            id, workspace_id, presenter_session_id, slide_id,
            kind, geometry, style, color, stroke_width,
            ephemeral, drawn_by, drawn_by_display_name
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id, workspace_id, presenter_session_id AS session_id, slide_id, kind,
                    geometry, style, color, stroke_width, ephemeral, saved_overlay_id,
                    drawn_by, drawn_by_display_name, created_at`,
        [
          row.id,
          row.workspace_id,
          row.session_id,
          row.slide_id,
          row.kind,
          JSON.stringify(row.geometry),
          JSON.stringify(row.style),
          row.color,
          row.stroke_width,
          row.ephemeral,
          row.drawn_by,
          row.drawn_by_display_name,
        ],
      );
      return rowToRecord(res.rows[0]);
    });
  }

  async getById(id: string): Promise<AnnotationLayerRecord | null> {
    return this.withClient(async (c) => {
      const res = await c.query(
        `SELECT id, workspace_id, presenter_session_id AS session_id, slide_id, kind,
                geometry, style, color, stroke_width, ephemeral, saved_overlay_id,
                drawn_by, drawn_by_display_name,
                EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms
         FROM annotation_layer WHERE id = $1`,
        [id],
      );
      if (res.rows.length === 0) return null;
      return rowToRecord(res.rows[0]);
    });
  }

  async listForSession(session_id: string, ephemeral: boolean): Promise<AnnotationLayerRecord[]> {
    return this.withClient(async (c) => {
      const res = await c.query(
        `SELECT id, workspace_id, presenter_session_id AS session_id, slide_id, kind,
                geometry, style, color, stroke_width, ephemeral, saved_overlay_id,
                drawn_by, drawn_by_display_name,
                EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms
         FROM annotation_layer
         WHERE presenter_session_id = $1 AND ephemeral = $2
         ORDER BY created_at ASC`,
        [session_id, ephemeral],
      );
      return res.rows.map(rowToRecord);
    });
  }

  async listSavedForSlide(slide_id: string): Promise<AnnotationLayerRecord[]> {
    return this.withClient(async (c) => {
      const res = await c.query(
        `SELECT id, workspace_id, presenter_session_id AS session_id, slide_id, kind,
                geometry, style, color, stroke_width, ephemeral, saved_overlay_id,
                drawn_by, drawn_by_display_name,
                EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms
         FROM annotation_layer
         WHERE slide_id = $1 AND ephemeral = false
         ORDER BY created_at ASC`,
        [slide_id],
      );
      return res.rows.map(rowToRecord);
    });
  }

  async rollback(id: string, workspace_id: string): Promise<void> {
    return this.withClient(async (c) => {
      const res = await c.query(
        `DELETE FROM annotation_layer
         WHERE id = $1 AND workspace_id = $2 AND ephemeral = true`,
        [id, workspace_id],
      );
      if (res.rowCount === 0) {
        // Either not found or not ephemeral — distinguish.
        const exists = await c.query(
          `SELECT ephemeral FROM annotation_layer WHERE id = $1 AND workspace_id = $2`,
          [id, workspace_id],
        );
        if (exists.rowCount === 0) throw makeStoreError('NOT_FOUND', `annotation ${id} not found`);
        throw makeStoreError('IMMUTABLE', `saved overlay ${id} cannot be rolled back`);
      }
    });
  }

  async promote(id: string, workspace_id: string, by: string): Promise<AnnotationLayerRecord> {
    return this.withClient(async (c) => {
      const res = await c.query(
        `UPDATE annotation_layer
         SET ephemeral = false,
             saved_overlay_id = COALESCE(saved_overlay_id, gen_random_uuid()),
             promoted_at = now(),
             promoted_by = $3
         WHERE id = $1 AND workspace_id = $2
         RETURNING id, workspace_id, presenter_session_id AS session_id, slide_id, kind,
                   geometry, style, color, stroke_width, ephemeral, saved_overlay_id,
                   drawn_by, drawn_by_display_name,
                   EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms`,
        [id, workspace_id, by],
      );
      if (res.rowCount === 0) throw makeStoreError('NOT_FOUND', `annotation ${id} not found`);
      return rowToRecord(res.rows[0]);
    });
  }

  async clearEphemeral(session_id: string, workspace_id: string): Promise<void> {
    await this.withClient((c) =>
      c.query(
        `DELETE FROM annotation_layer
         WHERE presenter_session_id = $1 AND workspace_id = $2 AND ephemeral = true`,
        [session_id, workspace_id],
      ),
    );
  }
}

function rowToRecord(row: Record<string, unknown>): AnnotationLayerRecord {
  return {
    id: row['id'] as string,
    workspace_id: row['workspace_id'] as string,
    session_id: row['session_id'] as string,
    slide_id: row['slide_id'] as string,
    layer_id: null,
    kind: row['kind'] as AnnotationKind,
    geometry: row['geometry'] as AnnotationGeometry,
    style: (row['style'] as Record<string, unknown>) ?? {},
    color: (row['color'] as string | null) ?? null,
    stroke_width: row['stroke_width'] === null ? null : Number(row['stroke_width']),
    ephemeral: row['ephemeral'] as boolean,
    saved_overlay_id: (row['saved_overlay_id'] as string | null) ?? null,
    drawn_by: row['drawn_by'] as string,
    drawn_by_display_name: (row['drawn_by_display_name'] as string | null) ?? null,
    created_at_ms: Number(row['created_at_ms']),
  };
}
