/**
 * @domio/session-archiver — archive store interface.
 */

import type { SessionArchive } from './types.js';

export interface ArchiveStore {
  put(archive: SessionArchive): Promise<void>;
  get(input: { workspace_id: string; session_id: string }): Promise<SessionArchive | null>;
  list(input: { workspace_id: string; limit?: number }): Promise<ReadonlyArray<SessionArchive>>;
}

export function isArchiveStore(v: unknown): v is ArchiveStore {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.put === 'function' && typeof o.get === 'function' && typeof o.list === 'function';
}
