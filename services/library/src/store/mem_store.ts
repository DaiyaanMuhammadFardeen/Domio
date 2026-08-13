/**
 * In-memory library store (Phase 18 Wave 3).
 *
 * Backs every method of {@link LibraryStore} with Maps. Used in unit
 * tests and in dev when DATABASE_URL is unset.
 */

import type { SlideLibraryEntry, LibraryVersion, AutoUpdateBinding } from '../types.js';
import { EntryNotFoundError, BindingNotFoundError } from '../types.js';
import type { LibraryStore } from './store.js';

export class InMemoryLibraryStore implements LibraryStore {
  private readonly entries = new Map<string, SlideLibraryEntry>();
  private readonly versions = new Map<string, LibraryVersion>();
  private readonly bindings = new Map<string, AutoUpdateBinding>();

  // -------------------------------------------------------------------------
  // Entries
  // -------------------------------------------------------------------------

  async insertEntry(entry: SlideLibraryEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async getEntry(entryId: string): Promise<SlideLibraryEntry | null> {
    return this.entries.get(entryId) ?? null;
  }

  async listEntriesByWorkspace(workspaceId: string): Promise<SlideLibraryEntry[]> {
    const results: SlideLibraryEntry[] = [];
    for (const e of this.entries.values()) {
      if (e.workspace_id === workspaceId) results.push(e);
    }
    return results;
  }

  async updateEntry(
    entryId: string,
    patch: Partial<
      Pick<
        SlideLibraryEntry,
        'status' | 'version_id' | 'superseded_by' | 'last_reviewed_at' | 'updated_at' | 'updated_by'
      >
    >,
  ): Promise<SlideLibraryEntry> {
    const existing = this.entries.get(entryId);
    if (!existing) throw new EntryNotFoundError(entryId);
    const updated: SlideLibraryEntry = { ...existing, ...patch };
    this.entries.set(entryId, updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------

  async insertVersion(version: LibraryVersion): Promise<void> {
    this.versions.set(version.id, version);
  }

  async getVersion(versionId: string): Promise<LibraryVersion | null> {
    return this.versions.get(versionId) ?? null;
  }

  async listVersionsByEntry(entryId: string): Promise<LibraryVersion[]> {
    const results: LibraryVersion[] = [];
    for (const v of this.versions.values()) {
      if (v.entry_id === entryId) results.push(v);
    }
    return results;
  }

  async getMaxVersionNum(entryId: string): Promise<number> {
    let max = 0;
    for (const v of this.versions.values()) {
      if (v.entry_id === entryId && v.version_num > max) {
        max = v.version_num;
      }
    }
    return max;
  }

  // -------------------------------------------------------------------------
  // Auto-update bindings
  // -------------------------------------------------------------------------

  async insertBinding(binding: AutoUpdateBinding): Promise<void> {
    this.bindings.set(binding.id, binding);
  }

  async getBinding(bindingId: string): Promise<AutoUpdateBinding | null> {
    return this.bindings.get(bindingId) ?? null;
  }

  async listBindingsByWorkspace(workspaceId: string): Promise<AutoUpdateBinding[]> {
    const results: AutoUpdateBinding[] = [];
    for (const b of this.bindings.values()) {
      if (b.workspace_id === workspaceId) results.push(b);
    }
    return results;
  }

  async listBindingsByEntry(libraryEntryId: string): Promise<AutoUpdateBinding[]> {
    const results: AutoUpdateBinding[] = [];
    for (const b of this.bindings.values()) {
      if (b.library_entry_id === libraryEntryId) results.push(b);
    }
    return results;
  }

  async updateBinding(
    bindingId: string,
    patch: Partial<
      Pick<
        AutoUpdateBinding,
        | 'pinned_version_id'
        | 'mode'
        | 'schedule'
        | 'is_mandatory'
        | 'last_synced_at'
        | 'last_sync_status'
        | 'updated_at'
        | 'updated_by'
      >
    >,
  ): Promise<AutoUpdateBinding> {
    const existing = this.bindings.get(bindingId);
    if (!existing) throw new BindingNotFoundError(bindingId);
    const updated: AutoUpdateBinding = { ...existing, ...patch };
    this.bindings.set(bindingId, updated);
    return updated;
  }

  async deleteBinding(bindingId: string): Promise<void> {
    if (!this.bindings.has(bindingId)) throw new BindingNotFoundError(bindingId);
    this.bindings.delete(bindingId);
  }

  async listAllBindings(): Promise<AutoUpdateBinding[]> {
    return Array.from(this.bindings.values());
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  clear(): void {
    this.entries.clear();
    this.versions.clear();
    this.bindings.clear();
  }
}
