/**
 * Task-manager service — shared types and errors (Phase 18 #191).
 *
 * Domain model for external task tracker integrations
 * (Asana / Jira / Linear).
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type TaskVendor = 'asana' | 'jira' | 'linear';
export type SyncMode = 'domio_wins' | 'task_wins' | 'last_write_wins';
export type SyncDirection = 'domio_to_task' | 'task_to_domio';
export type SyncOutcome = 'synced' | 'skipped' | 'conflict';

export interface FieldMapValue {
  readonly from: string;
  readonly to: string;
}

export type FieldMap = Record<string, string | FieldMapValue>;

export interface TaskLink {
  readonly id: string;
  readonly workspace_id: string;
  readonly assignment_id: string;
  readonly vendor: TaskVendor;
  readonly external_task_id: string;
  readonly external_project_id: string;
  readonly field_map: FieldMap;
  readonly sync_mode: SyncMode;
  readonly last_synced_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

// ---------------------------------------------------------------------------
// Task state (mirror of external task for conflict resolution)
// ---------------------------------------------------------------------------

export interface TaskState {
  readonly status: string;
  readonly priority: string;
  readonly assignee: string;
  readonly due_date: string;
  readonly title: string;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Conflict resolution result
// ---------------------------------------------------------------------------

export interface ConflictResolution {
  readonly winner: 'domio' | 'task';
  readonly merged: TaskState;
  readonly resolution: 'domio_wins' | 'task_wins' | 'last_write_wins';
}

// ---------------------------------------------------------------------------
// TaskProvider (injected; real Asana/Jira/Linear adapters later wave)
// ---------------------------------------------------------------------------

export interface TaskProvider {
  pushTask(link: TaskLink, state: TaskState): Promise<void>;
  pullTask(link: TaskLink): Promise<TaskState | null>;
}

/**
 * Default in-memory round-trip provider. pushTask is a no-op,
 * pullTask returns null (no external state).
 */
export const noopTaskProvider: TaskProvider = {
  async pushTask(): Promise<void> {
    /* no-op */
  },
  async pullTask(): Promise<null> {
    return null;
  },
};

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

export interface TaskManagerEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly ts_ms: number;
  readonly workspace_id: string;
  readonly actor_id: string;
  readonly actor_type: string;
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// EventEmitter interface (injected dependency)
// ---------------------------------------------------------------------------

export interface TaskManagerEventEmitter {
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

export const noopEmitter: TaskManagerEventEmitter = {
  async publish(): Promise<void> {
    /* drop */
  },
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class FeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED' as const;
  constructor(public readonly flag: string) {
    super(`Feature disabled: ${flag}`);
    this.name = 'FeatureDisabledError';
  }
}

export class TaskLinkNotFoundError extends Error {
  readonly code = 'TASK_LINK_NOT_FOUND' as const;
  constructor(public readonly taskLinkId: string) {
    super(`Task link not found: ${taskLinkId}`);
    this.name = 'TaskLinkNotFoundError';
  }
}

export class DuplicateTaskLinkError extends Error {
  readonly code = 'DUPLICATE_TASK_LINK' as const;
  constructor(
    public readonly assignmentId: string,
    public readonly vendor: string,
  ) {
    super(`Duplicate task link for assignment ${assignmentId} + vendor ${vendor}`);
    this.name = 'DuplicateTaskLinkError';
  }
}

export class SyncConflictError extends Error {
  readonly code = 'SYNC_CONFLICT' as const;
  constructor(public readonly taskLinkId: string) {
    super(`Sync conflict for task link ${taskLinkId}`);
    this.name = 'SyncConflictError';
  }
}

export class ValidationError extends Error {
  readonly code: string;
  constructor(message: string, code: string = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}
