/**
 * Task-manager service (Phase 18 #191).
 *
 * Transport-agnostic orchestration of external task tracker links
 * (Asana / Jira / Linear), declarative field mapping, LWW conflict
 * resolution, and sync orchestration.
 * Depends on:
 *  - {@link TaskLinkStore}         — persistence.
 *  - {@link TaskManagerEventEmitter} — event emission (default: noopEmitter).
 *  - {@link TaskProvider}          — external task adapter (default: noopTaskProvider).
 */

import type {
  TaskLink,
  TaskVendor,
  SyncMode,
  FieldMap,
  TaskState,
  TaskProvider,
  TaskManagerEventEmitter,
} from './types.js';
import { TaskLinkNotFoundError, DuplicateTaskLinkError, ValidationError } from './types.js';
import { noopEmitter, noopTaskProvider } from './types.js';
import { checkFeature, FEATURE_FLAGS } from './feature_flags.js';
import { validateFieldMap } from './mapping.js';
import { detectConflict, resolveSyncConflict } from './conflicts.js';
import type { TaskLinkStore } from './store/store.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface TaskManagerServiceOptions {
  readonly store: TaskLinkStore;
  readonly eventEmitter?: TaskManagerEventEmitter;
  readonly taskProvider?: TaskProvider;
  /** Clock. Default Date.now. */
  readonly now?: () => Date;
}

// ---------------------------------------------------------------------------
// Bulk sync summary
// ---------------------------------------------------------------------------

export interface SyncLinksSummary {
  readonly processed: number;
  readonly conflicts: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TaskManagerService {
  private readonly store: TaskLinkStore;
  private readonly emitter: TaskManagerEventEmitter;
  private readonly provider: TaskProvider;
  private readonly clock: () => Date;

  constructor(opts: TaskManagerServiceOptions) {
    if (!opts.store) throw new Error('TaskManagerService: store is required');
    this.store = opts.store;
    this.emitter = opts.eventEmitter ?? noopEmitter;
    this.provider = opts.taskProvider ?? noopTaskProvider;
    this.clock = opts.now ?? (() => new Date());
  }

  private idGen(): string {
    return crypto.randomUUID();
  }

  private now(): Date {
    return this.clock();
  }

  // -------------------------------------------------------------------------
  // createLink
  // -------------------------------------------------------------------------

  async createLink(input: {
    readonly workspace_id: string;
    readonly assignment_id: string;
    readonly vendor: TaskVendor;
    readonly external_task_id: string;
    readonly external_project_id: string;
    readonly field_map?: FieldMap;
    readonly sync_mode?: SyncMode;
  }): Promise<TaskLink> {
    checkFeature(FEATURE_FLAGS.tasks);

    // Validate vendor
    const validVendors: TaskVendor[] = ['asana', 'jira', 'linear'];
    if (!validVendors.includes(input.vendor)) {
      throw new ValidationError(`Invalid vendor: ${input.vendor}`);
    }

    // Validate field map if provided
    if (input.field_map) {
      validateFieldMap(input.field_map);
    }

    // Deduplicate by (assignment_id, vendor)
    const existing = await this.store.listLinksByAssignment(input.assignment_id);
    const dupe = existing.find((l) => l.vendor === input.vendor);
    if (dupe) {
      throw new DuplicateTaskLinkError(input.assignment_id, input.vendor);
    }

    const now = this.now();
    const link: TaskLink = {
      id: this.idGen(),
      workspace_id: input.workspace_id,
      assignment_id: input.assignment_id,
      vendor: input.vendor,
      external_task_id: input.external_task_id,
      external_project_id: input.external_project_id,
      field_map: input.field_map ?? {},
      sync_mode: input.sync_mode ?? 'last_write_wins',
      last_synced_at: null,
      created_at: now,
      updated_at: now,
    };

    await this.store.saveLink(link);
    return link;
  }

  // -------------------------------------------------------------------------
  // listLinks
  // -------------------------------------------------------------------------

  async listLinks(workspaceId: string): Promise<TaskLink[]> {
    checkFeature(FEATURE_FLAGS.tasks);
    return this.store.listLinks(workspaceId);
  }

  // -------------------------------------------------------------------------
  // updateLink
  // -------------------------------------------------------------------------

  async updateLink(
    linkId: string,
    patch: Partial<Pick<TaskLink, 'field_map' | 'sync_mode'>>,
    _actorId: string,
  ): Promise<TaskLink> {
    checkFeature(FEATURE_FLAGS.tasks);

    const existing = await this.store.getLink(linkId);
    if (!existing) throw new TaskLinkNotFoundError(linkId);

    // Validate field map if being updated
    if (patch.field_map) {
      validateFieldMap(patch.field_map);
    }

    const now = this.now();
    return this.store.updateLink(linkId, {
      ...patch,
      updated_at: now,
    });
  }

  // -------------------------------------------------------------------------
  // deleteLink
  // -------------------------------------------------------------------------

  async deleteLink(linkId: string): Promise<void> {
    checkFeature(FEATURE_FLAGS.tasks);
    await this.store.deleteLink(linkId);
  }

  // -------------------------------------------------------------------------
  // syncLink
  // -------------------------------------------------------------------------

  async syncLink(
    linkId: string,
    direction: 'domio_to_task' | 'task_to_domio',
    actorId: string = 'system',
  ): Promise<{
    readonly outcome: 'synced' | 'skipped' | 'conflict';
    readonly conflict_resolution?: string;
  }> {
    checkFeature(FEATURE_FLAGS.tasks);

    const link = await this.store.getLink(linkId);
    if (!link) throw new TaskLinkNotFoundError(linkId);

    // Emit task.sync_requested
    await this.emitter.publish('task.sync_requested', {
      event_id: this.idGen(),
      event_type: 'task.sync_requested',
      ts_ms: this.now().getTime(),
      workspace_id: link.workspace_id,
      actor_id: actorId,
      actor_type: 'system',
      payload: {
        task_link_id: link.id,
        assignment_id: link.assignment_id,
        vendor: link.vendor,
        direction,
      },
    });

    // Pull remote state (noopTaskProvider returns null)
    const taskState = await this.provider.pullTask(link);

    // Build domio state from field_map — since we're the "source of truth" for domio,
    // we construct a synthetic TaskState from the link's field_map metadata
    const domioState: TaskState = {
      status: 'active',
      priority: 'medium',
      assignee: '',
      due_date: '',
      title: '',
      updatedAt: this.now(),
    };

    if (!taskState) {
      // No external state → skip
      await this.emitter.publish('task.sync_completed', {
        event_id: this.idGen(),
        event_type: 'task.sync_completed',
        ts_ms: this.now().getTime(),
        workspace_id: link.workspace_id,
        actor_id: actorId,
        actor_type: 'system',
        payload: {
          task_link_id: link.id,
          assignment_id: link.assignment_id,
          vendor: link.vendor,
          status: 'skipped',
        },
      });
      return { outcome: 'skipped' };
    }

    // Check for conflicts on mapped fields
    const hasConflict = detectConflict(domioState, taskState, link.field_map);

    if (hasConflict) {
      const resolution = resolveSyncConflict({
        domioState,
        taskState,
        syncMode: link.sync_mode,
        fieldMap: link.field_map,
      });

      // Emit conflict event
      await this.emitter.publish('task.sync_completed', {
        event_id: this.idGen(),
        event_type: 'task.sync_completed',
        ts_ms: this.now().getTime(),
        workspace_id: link.workspace_id,
        actor_id: actorId,
        actor_type: 'system',
        payload: {
          task_link_id: link.id,
          assignment_id: link.assignment_id,
          vendor: link.vendor,
          status: 'conflict',
          conflict_resolution: resolution.resolution,
        },
      });

      // Update last_synced_at even on conflict (we attempted sync)
      await this.store.updateLink(linkId, {
        last_synced_at: this.now(),
        updated_at: this.now(),
      });

      return { outcome: 'conflict', conflict_resolution: resolution.resolution };
    }

    // No conflict — push state if direction is domio_to_task
    if (direction === 'domio_to_task') {
      await this.provider.pushTask(link, domioState);
    }

    // Update last_synced_at
    await this.store.updateLink(linkId, {
      last_synced_at: this.now(),
      updated_at: this.now(),
    });

    // Emit synced event
    await this.emitter.publish('task.sync_completed', {
      event_id: this.idGen(),
      event_type: 'task.sync_completed',
      ts_ms: this.now().getTime(),
      workspace_id: link.workspace_id,
      actor_id: actorId,
      actor_type: 'system',
      payload: {
        task_link_id: link.id,
        assignment_id: link.assignment_id,
        vendor: link.vendor,
        status: 'synced',
      },
    });

    return { outcome: 'synced' };
  }

  // -------------------------------------------------------------------------
  // syncLinks (bulk)
  // -------------------------------------------------------------------------

  async syncLinks(
    linkIds: readonly string[],
    direction: 'domio_to_task' | 'task_to_domio' = 'domio_to_task',
    actorId: string = 'system',
  ): Promise<SyncLinksSummary> {
    checkFeature(FEATURE_FLAGS.tasks);

    let processed = 0;
    let conflicts = 0;

    // Parallel-safe: run all syncs concurrently
    const results = await Promise.allSettled(
      linkIds.map((id) => this.syncLink(id, direction, actorId)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        processed++;
        if (result.value.outcome === 'conflict') {
          conflicts++;
        }
      }
    }

    return { processed, conflicts };
  }
}
