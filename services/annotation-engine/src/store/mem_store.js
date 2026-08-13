/**
 * @domio/annotation-engine — in-memory store.
 *
 * Used in tests and dev. Insertion-ordered iteration matches what we'd
 * see from a SELECT with ORDER BY created_at — strokes replay in the
 * order they were drawn.
 */
import { makeStoreError } from './store.js';
export class InMemoryAnnotationStore {
  rows = new Map();
  async create(row) {
    if (this.rows.has(row.id)) {
      throw makeStoreError('CONFLICT', `annotation ${row.id} already exists`);
    }
    this.rows.set(row.id, { ...row });
    return { ...row };
  }
  async getById(id) {
    const r = this.rows.get(id);
    return r ? { ...r } : null;
  }
  async listForSession(session_id, ephemeral) {
    return [...this.rows.values()]
      .filter((r) => r.session_id === session_id && r.ephemeral === ephemeral)
      .sort((a, b) => a.created_at_ms - b.created_at_ms);
  }
  async listSavedForSlide(slide_id) {
    return [...this.rows.values()]
      .filter((r) => r.slide_id === slide_id && !r.ephemeral)
      .sort((a, b) => a.created_at_ms - b.created_at_ms);
  }
  async rollback(id, workspace_id) {
    const r = this.rows.get(id);
    if (!r) throw makeStoreError('NOT_FOUND', `annotation ${id} not found`);
    if (r.workspace_id !== workspace_id) {
      throw makeStoreError('NOT_FOUND', `annotation ${id} not in workspace`);
    }
    if (!r.ephemeral)
      throw makeStoreError('IMMUTABLE', `saved overlay ${id} cannot be rolled back`);
    this.rows.delete(id);
  }
  async promote(id, workspace_id, by) {
    const r = this.rows.get(id);
    if (!r) throw makeStoreError('NOT_FOUND', `annotation ${id} not found`);
    if (r.workspace_id !== workspace_id) {
      throw makeStoreError('NOT_FOUND', `annotation ${id} not in workspace`);
    }
    const saved_id = r.saved_overlay_id ?? cryptoId();
    const next = {
      ...r,
      ephemeral: false,
      saved_overlay_id: saved_id,
      drawn_by_display_name: by ? r.drawn_by_display_name : r.drawn_by_display_name,
    };
    this.rows.set(id, next);
    return { ...next };
  }
  async clearEphemeral(session_id, workspace_id) {
    for (const [id, r] of this.rows) {
      if (r.session_id === session_id && r.workspace_id === workspace_id && r.ephemeral) {
        this.rows.delete(id);
      }
    }
  }
}
function cryptoId() {
  const c = globalThis.crypto;
  return (
    c?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
  );
}
//# sourceMappingURL=mem_store.js.map
