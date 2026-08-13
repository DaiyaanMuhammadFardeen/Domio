/**
 * @domio/annotation-engine — Postgres store.
 *
 * Maps `annotation_layer` table columns to the AnnotationLayerRecord.
 * Tenant isolation is enforced via `app.tenant_id` (RLS) — the runtime
 * is expected to set this before the query.
 */
import type { Pool, PoolClient } from 'pg';
import type { AnnotationLayerRecord } from '../types.js';
import { type AnnotationStore } from './store.js';
export interface PgAnnotationStoreOptions {
  pool: Pool | PoolClient;
  /** When true, uses `pool.connect()` per call. Default false. */
  perCallClient?: boolean;
}
export declare class PgAnnotationStore implements AnnotationStore {
  private readonly pool;
  private readonly perCallClient;
  constructor(opts: PgAnnotationStoreOptions);
  private withClient;
  create(row: AnnotationLayerRecord): Promise<AnnotationLayerRecord>;
  getById(id: string): Promise<AnnotationLayerRecord | null>;
  listForSession(session_id: string, ephemeral: boolean): Promise<AnnotationLayerRecord[]>;
  listSavedForSlide(slide_id: string): Promise<AnnotationLayerRecord[]>;
  rollback(id: string, workspace_id: string): Promise<void>;
  promote(id: string, workspace_id: string, by: string): Promise<AnnotationLayerRecord>;
  clearEphemeral(session_id: string, workspace_id: string): Promise<void>;
}
//# sourceMappingURL=pg_store.d.ts.map
