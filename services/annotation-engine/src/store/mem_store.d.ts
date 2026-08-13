/**
 * @domio/annotation-engine — in-memory store.
 *
 * Used in tests and dev. Insertion-ordered iteration matches what we'd
 * see from a SELECT with ORDER BY created_at — strokes replay in the
 * order they were drawn.
 */
import type { AnnotationLayerRecord } from '../types.js';
import { type AnnotationStore } from './store.js';
export declare class InMemoryAnnotationStore implements AnnotationStore {
  private readonly rows;
  create(row: AnnotationLayerRecord): Promise<AnnotationLayerRecord>;
  getById(id: string): Promise<AnnotationLayerRecord | null>;
  listForSession(session_id: string, ephemeral: boolean): Promise<AnnotationLayerRecord[]>;
  listSavedForSlide(slide_id: string): Promise<AnnotationLayerRecord[]>;
  rollback(id: string, workspace_id: string): Promise<void>;
  promote(id: string, workspace_id: string, by: string): Promise<AnnotationLayerRecord>;
  clearEphemeral(session_id: string, workspace_id: string): Promise<void>;
}
//# sourceMappingURL=mem_store.d.ts.map
