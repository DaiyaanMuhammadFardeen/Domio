/**
 * @domio/session-archiver — in-memory store.
 */

import type { SessionArchive } from '../types.js';
import type { ArchiveStore } from '../store.js';

export class InMemoryArchiveStore implements ArchiveStore {
  private readonly rows: SessionArchive[] = [];

  async put(archive: SessionArchive): Promise<void> {
    const idx = this.rows.findIndex((r) => r.workspace_id === archive.workspace_id && r.session_id === archive.session_id);
    if (idx >= 0) this.rows[idx] = archive;
    else this.rows.push(archive);
  }

  async get(input: { workspace_id: string; session_id: string }): Promise<SessionArchive | null> {
    return this.rows.find((r) => r.workspace_id === input.workspace_id && r.session_id === input.session_id) ?? null;
  }

  async list(input: { workspace_id: string; limit?: number }): Promise<ReadonlyArray<SessionArchive>> {
    const filtered = this.rows.filter((r) => r.workspace_id === input.workspace_id);
    const limit = input.limit ?? 100;
    return filtered.slice(0, limit);
  }
}