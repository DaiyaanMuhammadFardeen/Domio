/**
 * Library store interface (Phase 18 Wave 3).
 *
 * Transport-agnostic persistence layer for slide library entries,
 * versions, and auto-update bindings.
 * Two implementations:
 *  - {@link InMemoryLibraryStore} — used in tests and dev.
 *  - {@link PgLibraryStore}       — pg-pool-backed (scaffolding + nil-guards).
 */

import type { SlideLibraryEntry, LibraryVersion, AutoUpdateBinding } from '../types.js';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface LibraryStore {
  // -------------------------------------------------------------------------
  // Entries
  // -------------------------------------------------------------------------

  insertEntry(entry: SlideLibraryEntry): Promise<void>;
  getEntry(entryId: string): Promise<SlideLibraryEntry | null>;
  listEntriesByWorkspace(workspaceId: string): Promise<SlideLibraryEntry[]>;
  updateEntry(entryId: string, patch: Partial<Pick<SlideLibraryEntry, 'status' | 'version_id' | 'superseded_by' | 'last_reviewed_at' | 'updated_at' | 'updated_by'>>): Promise<SlideLibraryEntry>;

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------

  insertVersion(version: LibraryVersion): Promise<void>;
  getVersion(versionId: string): Promise<LibraryVersion | null>;
  listVersionsByEntry(entryId: string): Promise<LibraryVersion[]>;
  getMaxVersionNum(entryId: string): Promise<number>;

  // -------------------------------------------------------------------------
  // Auto-update bindings
  // -------------------------------------------------------------------------

  insertBinding(binding: AutoUpdateBinding): Promise<void>;
  getBinding(bindingId: string): Promise<AutoUpdateBinding | null>;
  listBindingsByWorkspace(workspaceId: string): Promise<AutoUpdateBinding[]>;
  listBindingsByEntry(libraryEntryId: string): Promise<AutoUpdateBinding[]>;
  updateBinding(bindingId: string, patch: Partial<Pick<AutoUpdateBinding, 'pinned_version_id' | 'mode' | 'schedule' | 'is_mandatory' | 'last_synced_at' | 'last_sync_status' | 'updated_at' | 'updated_by'>>): Promise<AutoUpdateBinding>;
  deleteBinding(bindingId: string): Promise<void>;
  listAllBindings(): Promise<AutoUpdateBinding[]>;
}
