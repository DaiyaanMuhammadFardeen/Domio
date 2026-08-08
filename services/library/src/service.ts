/**
 * Library service (Phase 18 Wave 3).
 *
 * Transport-agnostic orchestration of slide library entries, versions,
 * and auto-update bindings.
 * Depends on:
 *  - {@link LibraryStore}         — persistence.
 *  - {@link LibraryEventEmitter}  — event emission (default: noopEmitter).
 */

import type {
  SlideLibraryEntry,
  LibraryVersion,
  LibrarySnapshotInput,
  AutoUpdateBinding,
  AutoUpdateMode,
} from './types.js';
import {
  EntryNotFoundError,
  VersionNotFoundError,
  BindingNotFoundError,
} from './types.js';
import {
  createEntryBody,
  addVersionBody,
  publishEntryBody,
  retireEntryBody,
  insertFromLibraryBody,
  isBindingDue,
  shouldApply,
} from './entries.js';
import { checkFeature, FEATURE_FLAGS } from './feature_flags.js';
import type { LibraryEventEmitter } from './types.js';
import { noopEmitter } from './types.js';
import type { LibraryStore } from './store/store.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface LibraryServiceOptions {
  readonly store: LibraryStore;
  readonly eventEmitter?: LibraryEventEmitter;
  /** Clock. Default Date.now. */
  readonly now?: () => Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LibraryService {
  private readonly store: LibraryStore;
  private readonly emitter: LibraryEventEmitter;
  private readonly clock: () => Date;

  constructor(opts: LibraryServiceOptions) {
    if (!opts.store) throw new Error('LibraryService: store is required');
    this.store = opts.store;
    this.emitter = opts.eventEmitter ?? noopEmitter;
    this.clock = opts.now ?? (() => new Date());
  }

  private idGen(): string {
    return crypto.randomUUID();
  }

  private now(): Date {
    return this.clock();
  }

  // -------------------------------------------------------------------------
  // Library entries
  // -------------------------------------------------------------------------

  async createEntry(input: {
    workspace_id: string;
    scope: string;
    team_id?: string;
    title: string;
    description?: string;
    tags?: readonly string[];
    owner_id: string;
    approval_chain?: Record<string, unknown>;
    snapshot: LibrarySnapshotInput;
  }, actorId: string): Promise<{ entry: SlideLibraryEntry; version: LibraryVersion }> {
    checkFeature(FEATURE_FLAGS.library);
    const { entry, version } = createEntryBody(input, actorId, {
      now: () => this.now(),
      idGen: () => this.idGen(),
    });

    await this.store.insertEntry(entry);
    await this.store.insertVersion(version);

    await this.emitter.publish('library.entry_created', {
      event_id: this.idGen(),
      event_type: 'library.entry_created',
      ts_ms: this.now().getTime(),
      workspace_id: entry.workspace_id,
      actor_id: actorId,
      actor_type: 'member',
      payload: { entry_id: entry.id, version_id: version.id },
    });

    return { entry, version };
  }

  async getEntry(entryId: string): Promise<SlideLibraryEntry> {
    checkFeature(FEATURE_FLAGS.library);
    const entry = await this.store.getEntry(entryId);
    if (!entry) throw new EntryNotFoundError(entryId);
    return entry;
  }

  async listEntries(workspaceId: string): Promise<SlideLibraryEntry[]> {
    checkFeature(FEATURE_FLAGS.library);
    return this.store.listEntriesByWorkspace(workspaceId);
  }

  async addVersion(
    entryId: string,
    snapshot: LibrarySnapshotInput,
    actorId: string,
  ): Promise<LibraryVersion> {
    checkFeature(FEATURE_FLAGS.library);
    const entry = await this.store.getEntry(entryId);
    if (!entry) throw new EntryNotFoundError(entryId);

    const latestNum = await this.store.getMaxVersionNum(entryId);
    const version = addVersionBody(entry, snapshot, latestNum, actorId, {
      now: () => this.now(),
      idGen: () => this.idGen(),
    });

    await this.store.insertVersion(version);

    // Update entry's version_id to latest
    await this.store.updateEntry(entryId, {
      version_id: version.id,
      updated_at: this.now(),
      updated_by: actorId,
    });

    await this.emitter.publish('library.version_added', {
      event_id: this.idGen(),
      event_type: 'library.version_added',
      ts_ms: this.now().getTime(),
      workspace_id: entry.workspace_id,
      actor_id: actorId,
      actor_type: 'member',
      payload: { entry_id: entryId, version_id: version.id, version_num: version.version_num },
    });

    return version;
  }

  async publishEntry(entryId: string, actorId: string): Promise<SlideLibraryEntry> {
    checkFeature(FEATURE_FLAGS.library);
    const entry = await this.store.getEntry(entryId);
    if (!entry) throw new EntryNotFoundError(entryId);

    // Find latest version
    const versions = await this.store.listVersionsByEntry(entryId);
    if (versions.length === 0) {
      throw new Error('Cannot publish entry with no versions');
    }
    const latestVersion = versions.reduce((a, b) => a.version_num > b.version_num ? a : b);

    const update = publishEntryBody(entry, latestVersion.id, {
      now: () => this.now(),
      idGen: () => this.idGen(),
    });

    const updated = await this.store.updateEntry(entryId, {
      status: update.status,
      version_id: update.version_id,
      updated_at: update.updated_at,
      updated_by: actorId,
    });

    await this.emitter.publish('library.entry_published', {
      event_id: this.idGen(),
      event_type: 'library.entry_published',
      ts_ms: this.now().getTime(),
      workspace_id: updated.workspace_id,
      actor_id: actorId,
      actor_type: 'member',
      payload: { entry_id: entryId, version_id: update.version_id, status: update.status },
    });

    return updated;
  }

  async retireEntry(
    entryId: string,
    supersededBy: string | undefined,
    actorId: string,
  ): Promise<SlideLibraryEntry> {
    checkFeature(FEATURE_FLAGS.library);
    const entry = await this.store.getEntry(entryId);
    if (!entry) throw new EntryNotFoundError(entryId);

    const allEntries = await this.store.listEntriesByWorkspace(entry.workspace_id);
    const update = retireEntryBody(entry, supersededBy, allEntries, {
      now: () => this.now(),
      idGen: () => this.idGen(),
    });

    const updated = await this.store.updateEntry(entryId, {
      status: update.status,
      updated_at: update.updated_at,
      updated_by: actorId,
      ...(update.superseded_by != null ? { superseded_by: update.superseded_by } : {}),
    });

    await this.emitter.publish('library.entry_retired', {
      event_id: this.idGen(),
      event_type: 'library.entry_retired',
      ts_ms: this.now().getTime(),
      workspace_id: updated.workspace_id,
      actor_id: actorId,
      actor_type: 'member',
      payload: {
        entry_id: entryId,
        superseded_by: update.superseded_by,
      },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Insert from library
  // -------------------------------------------------------------------------

  async insertFromLibrary(
    entryId: string,
    mode: 'reference' | 'copy',
    deckId: string,
    slideId: string,
    workspaceId: string,
    actorId: string,
  ): Promise<{ version_id: string; binding?: AutoUpdateBinding }> {
    checkFeature(FEATURE_FLAGS.library);
    const entry = await this.store.getEntry(entryId);
    if (!entry) throw new EntryNotFoundError(entryId);

    const version = await this.store.getVersion(entry.version_id);
    if (!version) throw new VersionNotFoundError(entry.version_id);

    const result = insertFromLibraryBody(entry, version, mode);

    // If reference mode, also create an auto_update_binding in 'immediate' mode
    if (mode === 'reference') {
      const now = this.now();
      const binding: AutoUpdateBinding = {
        id: this.idGen(),
        workspace_id: workspaceId,
        consumer_deck_id: deckId,
        consumer_slide_id: slideId,
        library_entry_id: entryId,
        mode: 'immediate',
        schedule: {},
        is_mandatory: false,
        created_at: now,
        updated_at: now,
        created_by: actorId,
        updated_by: actorId,
      };
      await this.store.insertBinding(binding);

      await this.emitter.publish('auto_update.binding_created', {
        event_id: this.idGen(),
        event_type: 'auto_update.binding_created',
        ts_ms: now.getTime(),
        workspace_id: workspaceId,
        deck_id: deckId,
        actor_id: actorId,
        actor_type: 'member',
        payload: { binding_id: binding.id, library_entry_id: entryId, mode: binding.mode },
      });

      return { version_id: result.version_id, binding };
    }

    return { version_id: result.version_id };
  }

  // -------------------------------------------------------------------------
  // Auto-update bindings
  // -------------------------------------------------------------------------

  async createBinding(input: {
    workspace_id: string;
    consumer_deck_id: string;
    consumer_slide_id: string;
    library_entry_id: string;
    pinned_version_id?: string;
    mode: AutoUpdateMode;
    schedule?: Record<string, unknown>;
    is_mandatory?: boolean;
  }, actorId: string): Promise<AutoUpdateBinding> {
    checkFeature(FEATURE_FLAGS.autoupdate);

    // Verify entry exists
    const entry = await this.store.getEntry(input.library_entry_id);
    if (!entry) throw new EntryNotFoundError(input.library_entry_id);

    const now = this.now();
    const bindingBase = {
      id: this.idGen(),
      workspace_id: input.workspace_id,
      consumer_deck_id: input.consumer_deck_id,
      consumer_slide_id: input.consumer_slide_id,
      library_entry_id: input.library_entry_id,
      mode: input.mode,
      schedule: input.schedule ?? {},
      is_mandatory: input.is_mandatory ?? false,
      created_at: now,
      updated_at: now,
      created_by: actorId,
      updated_by: actorId,
    };

    const binding: AutoUpdateBinding = {
      ...bindingBase,
      ...(input.pinned_version_id != null ? { pinned_version_id: input.pinned_version_id } : {}),
    };

    await this.store.insertBinding(binding);

    await this.emitter.publish('auto_update.binding_created', {
      event_id: this.idGen(),
      event_type: 'auto_update.binding_created',
      ts_ms: now.getTime(),
      workspace_id: input.workspace_id,
      actor_id: actorId,
      actor_type: 'member',
      payload: { binding_id: binding.id, library_entry_id: input.library_entry_id, mode: binding.mode },
    });

    return binding;
  }

  async listBindings(workspaceId: string): Promise<AutoUpdateBinding[]> {
    checkFeature(FEATURE_FLAGS.autoupdate);
    return this.store.listBindingsByWorkspace(workspaceId);
  }

  async updateBinding(
    bindingId: string,
    patch: Partial<Pick<AutoUpdateBinding, 'pinned_version_id' | 'mode' | 'schedule' | 'is_mandatory'>>,
    actorId: string,
  ): Promise<AutoUpdateBinding> {
    checkFeature(FEATURE_FLAGS.autoupdate);
    const existing = await this.store.getBinding(bindingId);
    if (!existing) throw new BindingNotFoundError(bindingId);

    return this.store.updateBinding(bindingId, {
      ...patch,
      updated_at: this.now(),
      updated_by: actorId,
    });
  }

  async deleteBinding(bindingId: string): Promise<void> {
    checkFeature(FEATURE_FLAGS.autoupdate);
    await this.store.deleteBinding(bindingId);
  }

  // -------------------------------------------------------------------------
  // Propagation (called by the worker)
  // -------------------------------------------------------------------------

  async getPropagationCandidates(nowMs: number): Promise<Array<{
    binding: AutoUpdateBinding;
    latestVersion: LibraryVersion;
  }>> {
    checkFeature(FEATURE_FLAGS.autoupdate);

    const allBindings = await this.store.listAllBindings();
    const candidates: Array<{ binding: AutoUpdateBinding; latestVersion: LibraryVersion }> = [];

    for (const binding of allBindings) {
      if (!isBindingDue(binding, nowMs)) continue;

      // Get latest version of the library entry
      const entry = await this.store.getEntry(binding.library_entry_id);
      if (!entry) continue;
      if (entry.status === 'retired') continue;

      const versions = await this.store.listVersionsByEntry(binding.library_entry_id);
      if (versions.length === 0) continue;
      const latestVersion = versions.reduce((a, b) => a.version_num > b.version_num ? a : b);

      // Check shouldApply
      const decision = shouldApply(binding, latestVersion.version_num);
      if (!decision.apply) continue;

      candidates.push({ binding, latestVersion });
    }

    return candidates;
  }

  async applyBinding(
    bindingId: string,
    latestVersion: LibraryVersion,
    nowMs: number,
  ): Promise<{ applied: boolean; reason?: string }> {
    checkFeature(FEATURE_FLAGS.autoupdate);

    const binding = await this.store.getBinding(bindingId);
    if (!binding) throw new BindingNotFoundError(bindingId);

    const entry = await this.store.getEntry(binding.library_entry_id);
    if (!entry) throw new EntryNotFoundError(binding.library_entry_id);

    // Check for consumer conflict placeholder
    if (binding.last_sync_status === 'conflict') {
      return { applied: false, reason: 'consumer_conflict' };
    }

    // Apply the update
    const now = this.now();
    await this.store.updateBinding(bindingId, {
      last_synced_at: now,
      last_sync_status: 'applied',
      updated_at: now,
      updated_by: 'system',
    });

    await this.emitter.publish('auto_update.applied', {
      event_id: this.idGen(),
      event_type: 'auto_update.applied',
      ts_ms: nowMs,
      workspace_id: binding.workspace_id,
      deck_id: binding.consumer_deck_id,
      actor_id: 'system',
      actor_type: 'system',
      payload: {
        binding_id: bindingId,
        library_entry_id: binding.library_entry_id,
        version_id: latestVersion.id,
        version_num: latestVersion.version_num,
      },
    });

    return { applied: true };
  }
}
