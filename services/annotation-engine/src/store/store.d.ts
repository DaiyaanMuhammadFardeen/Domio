/**
 * @domio/annotation-engine — store interface.
 *
 * The annotation store is keyed by `(session_id, slide_id, ephemeral)`.
 * Ephemeral overlays are wiped on session end. Saved overlays survive.
 *
 * Operations:
 *   - create  — append a stroke; bumps session version.
 *   - getById — read a single annotation.
 *   - listForSession — full ephemeral set for the live canvas.
 *   - listSavedForSlide — saved overlays attached to a slide.
 *   - rollback — delete by id (presenter "undo").
 *   - promote — mark ephemeral as saved (returns saved_overlay_id).
 *   - clearEphemeral — wipe on session end.
 */
import type { AnnotationLayerRecord } from '../types.js';
export type StoreErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'ENDED' | 'IMMUTABLE';
export interface StoreError extends Error {
  readonly code: StoreErrorCode;
}
export interface AnnotationStore {
  create(row: AnnotationLayerRecord): Promise<AnnotationLayerRecord>;
  getById(id: string): Promise<AnnotationLayerRecord | null>;
  listForSession(session_id: string, ephemeral: boolean): Promise<AnnotationLayerRecord[]>;
  listSavedForSlide(slide_id: string): Promise<AnnotationLayerRecord[]>;
  rollback(id: string, workspace_id: string): Promise<void>;
  promote(id: string, workspace_id: string, by: string): Promise<AnnotationLayerRecord>;
  clearEphemeral(session_id: string, workspace_id: string): Promise<void>;
}
export declare function makeStoreError(code: StoreErrorCode, message: string): StoreError;
export declare function isStore(x: unknown): x is AnnotationStore;
//# sourceMappingURL=store.d.ts.map
