/**
 * Task-manager service — tests (Phase 18 #191).
 *
 * Covers:
 *  - Field-map validation, apply, describe
 *  - Conflict resolution (all 3 modes, per-field LWW)
 *  - Task-link CRUD lifecycle
 *  - Deduplication
 *  - syncLink event emissions (sync_requested + sync_completed synced/conflict)
 *  - Bulk sync
 *  - Feature-flag guard
 *  - Handlers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskManagerService } from './service.js';
import { InMemoryTaskLinkStore } from './store/mem_store.js';
import type { TaskManagerEventEmitter, TaskProvider, TaskLink, TaskState, FieldMap, TaskVendor, SyncMode } from './types.js';
import {
  FeatureDisabledError,
  TaskLinkNotFoundError,
  DuplicateTaskLinkError,
  ValidationError,
} from './types.js';
import {
  validateFieldMap,
  applyFieldMap,
  describeMapping,
} from './mapping.js';
import { detectConflict, resolveSyncConflict } from './conflicts.js';
import { handlers } from './handlers.js';
import type { HttpRequest, TaskManagerHandlerContext } from './handlers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fixedDate = new Date('2026-01-15T10:00:00Z');

function makeEventEmitter(): TaskManagerEventEmitter & { events: Array<{ subject: string; payload: Record<string, unknown> }> } {
  const events: Array<{ subject: string; payload: Record<string, unknown> }> = [];
  return {
    events,
    async publish(subject: string, payload: Record<string, unknown>): Promise<void> {
      events.push({ subject, payload });
    },
  };
}

function makeTaskProvider(
  remoteState: TaskState | null = null,
): TaskProvider & { pushed: Array<{ link: TaskLink; state: TaskState }> } {
  const pushed: Array<{ link: TaskLink; state: TaskState }> = [];
  return {
    pushed,
    async pushTask(link: TaskLink, state: TaskState): Promise<void> {
      pushed.push({ link, state });
    },
    async pullTask(): Promise<TaskState | null> {
      return remoteState;
    },
  };
}

function makeTaskState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    status: 'active',
    priority: 'high',
    assignee: 'user-1',
    due_date: '2026-02-01',
    title: 'Fix bug',
    updatedAt: fixedDate,
    ...overrides,
  };
}

function makeReq<P = Record<string, never>, B = unknown>(params: P, body: B, headers: Record<string, string | undefined> = {}): HttpRequest<P, B> {
  return {
    method: 'POST',
    path: '/',
    params,
    body,
    query: {},
    headers,
  };
}

function makeListReq(query: Record<string, string | undefined>): HttpRequest<Record<string, never>, undefined, Record<string, string | undefined>> {
  return {
    method: 'GET',
    path: '/',
    params: {},
    body: undefined,
    query,
    headers: {},
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('TaskManagerService', () => {
  // -----------------------------------------------------------------------
  // Field-map validation
  // -----------------------------------------------------------------------

  describe('validateFieldMap', () => {
    it('accepts valid string mappings', () => {
      expect(() => validateFieldMap({ status: 'state', priority: 'sev' })).not.toThrow();
    });

    it('accepts valid {from, to} tuple mappings', () => {
      expect(() => validateFieldMap({ status: { from: 'state', to: 'status' } })).not.toThrow();
    });

    it('rejects unknown keys', () => {
      expect(() => validateFieldMap({ foo: 'bar' })).toThrow(ValidationError);
    });

    it('rejects non-string, non-tuple values', () => {
      expect(() => validateFieldMap({ status: 123 as unknown as string })).toThrow(ValidationError);
    });

    it('rejects tuple with non-string from/to', () => {
      expect(() => validateFieldMap({ status: { from: 1, to: 2 } as unknown as { from: string; to: string } })).toThrow(ValidationError);
    });

    it('allows empty field map', () => {
      expect(() => validateFieldMap({})).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Field-map apply
  // -----------------------------------------------------------------------

  describe('applyFieldMap', () => {
    it('copies source fields to target using string mapping', () => {
      const result = applyFieldMap(
        { status: 'state', priority: 'sev' },
        { state: 'active', sev: 'high' },
        { status: '', priority: '' },
      );
      expect(result.status).toBe('active');
      expect(result.priority).toBe('high');
    });

    it('copies using {from, to} tuple mapping', () => {
      const result = applyFieldMap(
        { status: { from: 'state', to: 'status' } },
        { state: 'done' },
        { status: '' },
      );
      expect(result.status).toBe('done');
    });

    it('preserves existing target fields not in map', () => {
      const result = applyFieldMap(
        { status: 'state' },
        { state: 'done' },
        { status: 'old', priority: 'medium' },
      );
      expect(result.status).toBe('done');
      expect(result.priority).toBe('medium');
    });

    it('does not overwrite target when source key missing', () => {
      const result = applyFieldMap(
        { status: 'state' },
        {},
        { status: 'existing' },
      );
      expect(result.status).toBe('existing');
    });
  });

  // -----------------------------------------------------------------------
  // Field-map describe
  // -----------------------------------------------------------------------

  describe('describeMapping', () => {
    it('describes string mappings', () => {
      const desc = describeMapping({ status: 'state' });
      expect(desc).toEqual(['status ← source.state']);
    });

    it('describes tuple mappings', () => {
      const desc = describeMapping({ status: { from: 'state', to: 'status' } });
      expect(desc).toEqual(['status ← source.state (renamed to status)']);
    });

    it('returns empty for empty map', () => {
      expect(describeMapping({})).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Conflict detection
  // -----------------------------------------------------------------------

  describe('detectConflict', () => {
    const fieldMap: FieldMap = { status: 'status', priority: 'priority' };

    it('returns false when fields match', () => {
      const domio = makeTaskState({ status: 'active', priority: 'high' });
      const task = makeTaskState({ status: 'active', priority: 'high' });
      expect(detectConflict(domio, task, fieldMap)).toBe(false);
    });

    it('returns true when a mapped field differs', () => {
      const domio = makeTaskState({ status: 'active' });
      const task = makeTaskState({ status: 'done' });
      expect(detectConflict(domio, task, fieldMap)).toBe(true);
    });

    it('ignores unmapped fields', () => {
      const domio = makeTaskState({ assignee: 'user-1' });
      const task = makeTaskState({ assignee: 'user-2' });
      // assignee is not in fieldMap
      expect(detectConflict(domio, task, { status: 'status' })).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Conflict resolution
  // -----------------------------------------------------------------------

  describe('resolveSyncConflict', () => {
    const fieldMap: FieldMap = { status: 'status', priority: 'priority' };
    const domio = makeTaskState({ status: 'domio_status', priority: 'domio_pri', updatedAt: new Date('2026-01-10T10:00:00Z') });
    const task = makeTaskState({ status: 'task_status', priority: 'task_pri', updatedAt: new Date('2026-01-15T10:00:00Z') });

    it('domio_wins returns domioState', () => {
      const result = resolveSyncConflict({ domioState: domio, taskState: task, syncMode: 'domio_wins', fieldMap });
      expect(result.winner).toBe('domio');
      expect(result.merged.status).toBe('domio_status');
      expect(result.resolution).toBe('domio_wins');
    });

    it('task_wins returns taskState', () => {
      const result = resolveSyncConflict({ domioState: domio, taskState: task, syncMode: 'task_wins', fieldMap });
      expect(result.winner).toBe('task');
      expect(result.merged.status).toBe('task_status');
      expect(result.resolution).toBe('task_wins');
    });

    it('last_write_wins: newer side wins per-field', () => {
      const result = resolveSyncConflict({ domioState: domio, taskState: task, syncMode: 'last_write_wins', fieldMap });
      expect(result.winner).toBe('task'); // task.updatedAt is newer
      expect(result.merged.status).toBe('task_status');
      expect(result.merged.priority).toBe('task_pri');
      expect(result.resolution).toBe('last_write_wins');
    });

    it('last_write_wins: domio newer wins per-field', () => {
      const newerDomio = makeTaskState({ status: 'domio_new', updatedAt: new Date('2026-01-20T10:00:00Z') });
      const olderTask = makeTaskState({ status: 'task_old', updatedAt: new Date('2026-01-05T10:00:00Z') });
      const result = resolveSyncConflict({ domioState: newerDomio, taskState: olderTask, syncMode: 'last_write_wins', fieldMap });
      expect(result.winner).toBe('domio');
      expect(result.merged.status).toBe('domio_new');
    });

    it('last_write_wins: equal timestamps use domio', () => {
      const sameTime = makeTaskState({ updatedAt: fixedDate });
      const result = resolveSyncConflict({ domioState: sameTime, taskState: sameTime, syncMode: 'last_write_wins', fieldMap });
      expect(result.winner).toBe('domio');
    });
  });

  // -----------------------------------------------------------------------
  // Service: feature flag
  // -----------------------------------------------------------------------

  describe('feature flag', () => {
    let store: InMemoryTaskLinkStore;
    let service: TaskManagerService;

    beforeEach(() => {
      store = new InMemoryTaskLinkStore();
      service = new TaskManagerService({ store, now: () => fixedDate });
    });

    it('returns 503 when collab.integrations.tasks is disabled', async () => {
      process.env.FEATURE_COLLAB_INTEGRATIONS_TASKS_DISABLED = 'true';
      try {
        await expect(service.listLinks('ws-1')).rejects.toThrow(FeatureDisabledError);
      } finally {
        delete process.env.FEATURE_COLLAB_INTEGRATIONS_TASKS_DISABLED;
      }
    });
  });

  // -----------------------------------------------------------------------
  // Service: createLink lifecycle
  // -----------------------------------------------------------------------

  describe('createLink', () => {
    let store: InMemoryTaskLinkStore;
    let service: TaskManagerService;

    beforeEach(() => {
      store = new InMemoryTaskLinkStore();
      service = new TaskManagerService({ store, now: () => fixedDate });
    });

    it('creates a task link with defaults', async () => {
      const link = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      expect(link.id).toBeDefined();
      expect(link.vendor).toBe('jira');
      expect(link.sync_mode).toBe('last_write_wins');
      expect(link.field_map).toEqual({});
      expect(link.last_synced_at).toBeNull();
    });

    it('creates with custom field_map and sync_mode', async () => {
      const link = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'asana',
        external_task_id: 'EXT-2',
        external_project_id: 'PROJ-2',
        field_map: { status: 'state' },
        sync_mode: 'domio_wins',
      });

      expect(link.field_map).toEqual({ status: 'state' });
      expect(link.sync_mode).toBe('domio_wins');
    });

    it('rejects duplicate (assignment_id, vendor)', async () => {
      await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      await expect(
        service.createLink({
          workspace_id: 'ws-1',
          assignment_id: 'asgn-1',
          vendor: 'jira',
          external_task_id: 'EXT-2',
          external_project_id: 'PROJ-2',
        }),
      ).rejects.toThrow(DuplicateTaskLinkError);
    });

    it('allows same assignment_id with different vendor', async () => {
      await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      const link = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'linear',
        external_task_id: 'EXT-2',
        external_project_id: 'PROJ-2',
      });

      expect(link.vendor).toBe('linear');
    });

    it('rejects invalid vendor', async () => {
      await expect(
        service.createLink({
          workspace_id: 'ws-1',
          assignment_id: 'asgn-1',
          vendor: 'github' as TaskVendor,
          external_task_id: 'EXT-1',
          external_project_id: 'PROJ-1',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects invalid field_map keys', async () => {
      await expect(
        service.createLink({
          workspace_id: 'ws-1',
          assignment_id: 'asgn-1',
          vendor: 'jira',
          external_task_id: 'EXT-1',
          external_project_id: 'PROJ-1',
          field_map: { unknown_field: 'x' },
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  // -----------------------------------------------------------------------
  // Service: listLinks
  // -----------------------------------------------------------------------

  describe('listLinks', () => {
    let store: InMemoryTaskLinkStore;
    let service: TaskManagerService;

    beforeEach(() => {
      store = new InMemoryTaskLinkStore();
      service = new TaskManagerService({ store, now: () => fixedDate });
    });

    it('returns links for a workspace', async () => {
      await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });
      await service.createLink({
        workspace_id: 'ws-2',
        assignment_id: 'asgn-2',
        vendor: 'linear',
        external_task_id: 'EXT-2',
        external_project_id: 'PROJ-2',
      });

      const links = await service.listLinks('ws-1');
      expect(links).toHaveLength(1);
      expect(links[0]!.vendor).toBe('jira');
    });

    it('returns empty for unknown workspace', async () => {
      const links = await service.listLinks('ws-unknown');
      expect(links).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Service: updateLink
  // -----------------------------------------------------------------------

  describe('updateLink', () => {
    let store: InMemoryTaskLinkStore;
    let service: TaskManagerService;

    beforeEach(() => {
      store = new InMemoryTaskLinkStore();
      service = new TaskManagerService({ store, now: () => fixedDate });
    });

    it('updates field_map', async () => {
      const created = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      const updated = await service.updateLink(created.id, { field_map: { status: 'state' } }, 'user-1');
      expect(updated.field_map).toEqual({ status: 'state' });
    });

    it('updates sync_mode', async () => {
      const created = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      const updated = await service.updateLink(created.id, { sync_mode: 'domio_wins' }, 'user-1');
      expect(updated.sync_mode).toBe('domio_wins');
    });

    it('rejects invalid field_map on update', async () => {
      const created = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      await expect(
        service.updateLink(created.id, { field_map: { bad_key: 'x' } }, 'user-1'),
      ).rejects.toThrow(ValidationError);
    });

    it('throws for non-existent link', async () => {
      await expect(
        service.updateLink('non-existent', { sync_mode: 'task_wins' }, 'user-1'),
      ).rejects.toThrow(TaskLinkNotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // Service: deleteLink
  // -----------------------------------------------------------------------

  describe('deleteLink', () => {
    let store: InMemoryTaskLinkStore;
    let service: TaskManagerService;

    beforeEach(() => {
      store = new InMemoryTaskLinkStore();
      service = new TaskManagerService({ store, now: () => fixedDate });
    });

    it('deletes an existing link', async () => {
      const created = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      await service.deleteLink(created.id);
      const links = await service.listLinks('ws-1');
      expect(links).toHaveLength(0);
    });

    it('throws for non-existent link', async () => {
      await expect(service.deleteLink('non-existent')).rejects.toThrow(TaskLinkNotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // Service: syncLink
  // -----------------------------------------------------------------------

  describe('syncLink', () => {
    let store: InMemoryTaskLinkStore;
    let emitter: ReturnType<typeof makeEventEmitter>;
    let provider: ReturnType<typeof makeTaskProvider>;
    let service: TaskManagerService;

    beforeEach(() => {
      store = new InMemoryTaskLinkStore();
      emitter = makeEventEmitter();
      provider = makeTaskProvider();
      service = new TaskManagerService({
        store,
        eventEmitter: emitter,
        taskProvider: provider,
        now: () => fixedDate,
      });
    });

    it('emits sync_requested then sync_completed (skipped) when no remote state', async () => {
      const link = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      const result = await service.syncLink(link.id, 'domio_to_task');
      expect(result.outcome).toBe('skipped');

      // Events: sync_requested, sync_completed
      // Note: emitter.events[i].payload is the full event envelope;
      // the inner payload is at .payload.payload
      expect(emitter.events).toHaveLength(2);
      expect(emitter.events[0]!.subject).toBe('task.sync_requested');
      const reqEnvelope = emitter.events[0]!.payload as Record<string, unknown>;
      const reqPayload = reqEnvelope.payload as Record<string, unknown>;
      expect(reqPayload.task_link_id).toBe(link.id);
      expect(reqPayload.direction).toBe('domio_to_task');
      expect(emitter.events[1]!.subject).toBe('task.sync_completed');
      const cmpEnvelope = emitter.events[1]!.payload as Record<string, unknown>;
      const cmpPayload = cmpEnvelope.payload as Record<string, unknown>;
      expect(cmpPayload.status).toBe('skipped');
    });

    it('emits sync_completed (synced) when no conflict', async () => {
      provider = makeTaskProvider(makeTaskState({ status: 'active', priority: 'high' }));
      service = new TaskManagerService({
        store,
        eventEmitter: emitter,
        taskProvider: provider,
        now: () => fixedDate,
      });

      const link = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
        field_map: { status: 'status' },
      });

      const result = await service.syncLink(link.id, 'domio_to_task');
      expect(result.outcome).toBe('synced');

      expect(emitter.events[1]!.subject).toBe('task.sync_completed');
      const syncEnvelope = emitter.events[1]!.payload as Record<string, unknown>;
      const syncPayload = syncEnvelope.payload as Record<string, unknown>;
      expect(syncPayload.status).toBe('synced');

      // Verify last_synced_at updated
      const updated = await store.getLink(link.id);
      expect(updated!.last_synced_at).toEqual(fixedDate);
    });

    it('emits sync_completed (conflict) when fields differ', async () => {
      provider = makeTaskProvider(makeTaskState({ status: 'done', priority: 'low' }));
      service = new TaskManagerService({
        store,
        eventEmitter: emitter,
        taskProvider: provider,
        now: () => fixedDate,
      });

      const link = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
        field_map: { status: 'status' },
        sync_mode: 'last_write_wins',
      });

      const result = await service.syncLink(link.id, 'domio_to_task');
      expect(result.outcome).toBe('conflict');
      expect(result.conflict_resolution).toBe('last_write_wins');

      expect(emitter.events[1]!.subject).toBe('task.sync_completed');
      const conflictEnvelope = emitter.events[1]!.payload as Record<string, unknown>;
      const conflictPayload = conflictEnvelope.payload as Record<string, unknown>;
      expect(conflictPayload.status).toBe('conflict');
      expect(conflictPayload.conflict_resolution).toBe('last_write_wins');
    });

    it('throws for non-existent link', async () => {
      await expect(service.syncLink('non-existent', 'domio_to_task')).rejects.toThrow(TaskLinkNotFoundError);
    });

    it('pushes state when direction is domio_to_task and no conflict', async () => {
      provider = makeTaskProvider(makeTaskState({ status: 'active', priority: 'high' }));
      service = new TaskManagerService({
        store,
        eventEmitter: emitter,
        taskProvider: provider,
        now: () => fixedDate,
      });

      const link = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      await service.syncLink(link.id, 'domio_to_task');
      expect(provider.pushed).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Service: syncLinks (bulk)
  // -----------------------------------------------------------------------

  describe('syncLinks', () => {
    let store: InMemoryTaskLinkStore;
    let emitter: ReturnType<typeof makeEventEmitter>;
    let provider: ReturnType<typeof makeTaskProvider>;
    let service: TaskManagerService;

    beforeEach(() => {
      store = new InMemoryTaskLinkStore();
      emitter = makeEventEmitter();
      provider = makeTaskProvider();
      service = new TaskManagerService({
        store,
        eventEmitter: emitter,
        taskProvider: provider,
        now: () => fixedDate,
      });
    });

    it('processes multiple links and reports summary', async () => {
      const link1 = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });
      const link2 = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-2',
        vendor: 'linear',
        external_task_id: 'EXT-2',
        external_project_id: 'PROJ-2',
      });

      const summary = await service.syncLinks([link1.id, link2.id]);
      expect(summary.processed).toBe(2);
      expect(summary.conflicts).toBe(0);
    });

    it('counts conflicts in bulk summary', async () => {
      provider = makeTaskProvider(makeTaskState({ status: 'done' }));
      service = new TaskManagerService({
        store,
        eventEmitter: emitter,
        taskProvider: provider,
        now: () => fixedDate,
      });

      const link1 = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
        field_map: { status: 'status' },
      });

      const summary = await service.syncLinks([link1.id]);
      expect(summary.processed).toBe(1);
      expect(summary.conflicts).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  describe('handlers', () => {
    let store: InMemoryTaskLinkStore;
    let service: TaskManagerService;
    let ctx: TaskManagerHandlerContext;

    beforeEach(() => {
      store = new InMemoryTaskLinkStore();
      service = new TaskManagerService({ store, now: () => fixedDate });
      ctx = { service };
    });

    it('createTaskLink creates and returns 201', async () => {
      const req = makeReq({}, {
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira' as TaskVendor,
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      const res = await handlers.createTaskLink(req, ctx);
      expect(res.status).toBe(201);
      expect((res.body as { link: TaskLink }).link.vendor).toBe('jira');
    });

    it('listTaskLinks returns 200 with links', async () => {
      await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      const req = makeListReq({ workspace_id: 'ws-1' });
      const res = await handlers.listTaskLinks(req, ctx);
      expect(res.status).toBe(200);
      expect((res.body as { links: TaskLink[] }).links).toHaveLength(1);
    });

    it('updateTaskLink returns 200 with updated link', async () => {
      const created = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      const req = makeReq({ id: created.id }, { sync_mode: 'domio_wins' as SyncMode });
      const res = await handlers.updateTaskLink(req, ctx);
      expect(res.status).toBe(200);
      expect((res.body as { link: TaskLink }).link.sync_mode).toBe('domio_wins');
    });

    it('deleteTaskLink returns 204', async () => {
      const created = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      const req = makeReq({ id: created.id }, {});
      const res = await handlers.deleteTaskLink(req, ctx);
      expect(res.status).toBe(204);
    });

    it('syncTaskLink returns 200', async () => {
      const created = await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      const req = makeReq({ id: created.id }, { direction: 'domio_to_task' as const });
      const res = await handlers.syncTaskLink(req, ctx);
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent link', async () => {
      const req = makeReq({ id: 'non-existent' }, {});
      const res = await handlers.deleteTaskLink(req, ctx);
      expect(res.status).toBe(404);
    });

    it('returns 503 when feature disabled', async () => {
      process.env.FEATURE_COLLAB_INTEGRATIONS_TASKS_DISABLED = 'true';
      try {
        const req = makeListReq({ workspace_id: 'ws-1' });
        const res = await handlers.listTaskLinks(req, ctx);
        expect(res.status).toBe(503);
      } finally {
        delete process.env.FEATURE_COLLAB_INTEGRATIONS_TASKS_DISABLED;
      }
    });

    it('returns 409 for duplicate link', async () => {
      await service.createLink({
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira',
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });

      const req = makeReq({}, {
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'jira' as TaskVendor,
        external_task_id: 'EXT-2',
        external_project_id: 'PROJ-2',
      });
      const res = await handlers.createTaskLink(req, ctx);
      expect(res.status).toBe(409);
    });

    it('returns 400 for invalid vendor', async () => {
      const req = makeReq({}, {
        workspace_id: 'ws-1',
        assignment_id: 'asgn-1',
        vendor: 'invalid' as TaskVendor,
        external_task_id: 'EXT-1',
        external_project_id: 'PROJ-1',
      });
      const res = await handlers.createTaskLink(req, ctx);
      expect(res.status).toBe(400);
    });
  });
});
