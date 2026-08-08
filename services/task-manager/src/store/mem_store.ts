/**
 * In-memory task-link store (Phase 18 #191).
 *
 * Backs every method of {@link TaskLinkStore} with Maps. Used in unit
 * tests and in dev when DATABASE_URL is unset.
 */

import type { TaskLink } from '../types.js';
import { TaskLinkNotFoundError } from '../types.js';
import type { TaskLinkStore } from './store.js';

export class InMemoryTaskLinkStore implements TaskLinkStore {
  private readonly links = new Map<string, TaskLink>();

  async saveLink(link: TaskLink): Promise<void> {
    this.links.set(link.id, link);
  }

  async getLink(linkId: string): Promise<TaskLink | null> {
    return this.links.get(linkId) ?? null;
  }

  async listLinks(workspaceId: string): Promise<TaskLink[]> {
    const results: TaskLink[] = [];
    for (const l of this.links.values()) {
      if (l.workspace_id === workspaceId) results.push(l);
    }
    return results;
  }

  async listLinksByAssignment(assignmentId: string): Promise<TaskLink[]> {
    const results: TaskLink[] = [];
    for (const l of this.links.values()) {
      if (l.assignment_id === assignmentId) results.push(l);
    }
    return results;
  }

  async updateLink(
    linkId: string,
    patch: Partial<Pick<TaskLink, 'field_map' | 'sync_mode' | 'last_synced_at' | 'updated_at'>>,
  ): Promise<TaskLink> {
    const existing = this.links.get(linkId);
    if (!existing) throw new TaskLinkNotFoundError(linkId);
    const updated: TaskLink = { ...existing, ...patch };
    this.links.set(linkId, updated);
    return updated;
  }

  async deleteLink(linkId: string): Promise<void> {
    if (!this.links.has(linkId)) throw new TaskLinkNotFoundError(linkId);
    this.links.delete(linkId);
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  clear(): void {
    this.links.clear();
  }
}
