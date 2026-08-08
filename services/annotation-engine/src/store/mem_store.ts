/**
 * @domio/annotation-engine — in-memory store.
 *
 * Used in tests and dev. Insertion-ordered iteration matches what we'd
 * see from a SELECT with ORDER BY created_at — strokes replay in the
 * order they were drawn.
 */

import type { AnnotationLayerRecord } from '../types.js';
import { makeStoreError, type AnnotationStore } from './store.js';

export class InMemoryAnnotationStore implements AnnotationStore {
  private readonly rows = new Map<string, AnnotationLayerRecord>();

  async create(row: AnnotationLayerRecord): Promise<AnnotationLayerRecord> {
    if (this.rows.has(row.id)) {
      throw makeStoreError('CONFLICT', `annotation ${row.id} already exists`);
    }
    this.rows.set(row.id, { ...row });
    return { ...row };
  }

  async getById(id: string): Promise<AnnotationLayerRecord | null> {
    const r = this.rows.get(id);
    return r ? { ...r } : null;
  }

  async listForSession(session_id: string, ephemeral: boolean): Promise<AnnotationLayerRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.session_id === session_id && r.ephemeral === ephemeral)
      .sort((a, b) => a.created_at_ms - b.created_at_ms);
  }

  async listSavedForSlide(slide_id: string): Promise<AnnotationLayerRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.slide_id === slide_id && !r.ephemeral)
      .sort((a, b) => a.created_at_ms - b.created_at_ms);
  }

  async rollback(id: string, workspace_id: string): Promise<void> {
    const r = this.rows.get(id);
    if (!r) throw makeStoreError('NOT_FOUND', `annotation ${id} not found`);
    if (r.workspace_id !== workspace_id) {
      throw makeStoreError('NOT_FOUND', `annotation ${id} not in workspace`);
    }
    if (!r.ephemeral) throw makeStoreError('IMMUTABLE', `saved overlay ${id} cannot be rolled back`);
    this.rows.delete(id);
  }

  async promote(id: string, workspace_id: string, by: string): Promise<AnnotationLayerRecord> {
    const r = this.rows.get(id);
    if (!r) throw makeStoreError('NOT_FOUND', `annotation ${id} not found`);
    if (r.workspace_id !== workspace_id) {
      throw makeStoreError('NOT_FOUND', `annotation ${id} not in workspace`);
    }
    const saved_id = r.saved_overlay_id ?? cryptoId();
    const next: AnnotationLayerRecord = {
      ...r,
      ephemeral: false,
      saved_overlay_id: saved_id,
      drawn_by_display_name: by ? r.drawn_by_display_name : r.drawn_by_display_name,
    };
    this.rows.set(id, next);
    return { ...next };
  }

  async clearEphemeral(session_id: string, workspace_id: string): Promise<void> {
    for (const [id, r] of this.rows) {
      if (r.session_id === session_id && r.workspace_id === workspace_id && r.ephemeral) {
        this.rows.delete(id);
      }
    }
  }
}

function cryptoId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}