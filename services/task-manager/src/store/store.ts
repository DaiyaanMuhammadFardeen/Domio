/**
 * Task-link store interface (Phase 18 #191).
 *
 * Transport-agnostic persistence layer for task links.
 * Two implementations:
 *  - {@link InMemoryTaskLinkStore} — used in tests and dev.
 *  - {@link PgTaskLinkStore}       — pg-pool-backed (scaffolding + nil-guards).
 */

import type { TaskLink } from '../types.js';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface TaskLinkStore {
  saveLink(link: TaskLink): Promise<void>;
  getLink(linkId: string): Promise<TaskLink | null>;
  listLinks(workspaceId: string): Promise<TaskLink[]>;
  listLinksByAssignment(assignmentId: string): Promise<TaskLink[]>;
  updateLink(linkId: string, patch: Partial<Pick<TaskLink, 'field_map' | 'sync_mode' | 'last_synced_at' | 'updated_at'>>): Promise<TaskLink>;
  deleteLink(linkId: string): Promise<void>;
}
