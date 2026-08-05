/**
 * @domio/cad-jobs — Phase 11 CAD conversion job domain types.
 *
 * Mirrors contracts/openapi/v1/cad-jobs.yaml and the cad_jobs table in
 * infrastructure/postgres/migrations/0037_phase11_embed_maps_jobs.up.sql.
 *
 * Status transitions:
 *   parsing → meshing → optimizing → done
 *                                    ↘ failed
 */

export type CadFormat = 'glb' | 'gltf';

export type CadProgress = 'parsing' | 'meshing' | 'optimizing' | 'done' | 'failed';

export interface CadJob {
  readonly id: string;
  readonly tenantId: string;
  readonly modelAssetId: string;
  readonly tessellationChordMm: number;
  readonly tessellationAngleDeg: number;
  readonly targetPolyCount: number | null;
  readonly format: CadFormat;
  readonly progress: CadProgress;
  readonly websocketUrl: string | null;
  readonly resultUrl: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export interface CreateCadJobRequest {
  readonly tenantId: string;
  readonly modelAssetId: string;
  readonly tessellationChordMm?: number;
  readonly tessellationAngleDeg?: number;
  readonly targetPolyCount?: number;
  readonly format?: CadFormat;
}

export interface CadJobListResponse {
  readonly items: readonly CadJob[];
}

export interface ErrorResponse {
  readonly code: string;
  readonly message: string;
}

export const DEFAULT_TESSELLATION_CHORD_MM = 0.1;
export const DEFAULT_TESSELLATION_ANGLE_DEG = 15;
export const DEFAULT_TARGET_POLY_COUNT = 250_000;
export const MAX_TARGET_POLY_COUNT = 10_000_000;
export const MIN_TARGET_POLY_COUNT = 1_000;

export const TERMINAL_PROGRESS: ReadonlyArray<CadProgress> = ['done', 'failed'];