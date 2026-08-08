/**
 * Pure conflict-resolution logic for task sync (Phase 18 #191).
 *
 * resolveSyncConflict: determines winner + merges per-field using LWW
 *   when sync_mode is last_write_wins.
 * detectConflict: returns true if any mapped-field differs between sides.
 */

import type { TaskState, ConflictResolution, SyncMode, FieldMap } from './types.js';
import { FIELD_MAP_KEYS } from './mapping.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readField(state: TaskState, key: string): string {
  switch (key) {
    case 'status': return state.status;
    case 'priority': return state.priority;
    case 'assignee': return state.assignee;
    case 'due_date': return state.due_date;
    case 'title': return state.title;
    default: return '';
  }
}

// ---------------------------------------------------------------------------
// detectConflict
// ---------------------------------------------------------------------------

/**
 * Return true if any mapped key differs between domioState and taskState.
 */
export function detectConflict(
  domioState: TaskState,
  taskState: TaskState,
  fieldMap: FieldMap,
): boolean {
  const keys = Object.keys(fieldMap);
  for (const key of keys) {
    if (!FIELD_MAP_KEYS.includes(key as typeof FIELD_MAP_KEYS[number])) continue;
    const domVal = readField(domioState, key);
    const taskVal = readField(taskState, key);
    if (domVal !== taskVal) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// resolveSyncConflict
// ---------------------------------------------------------------------------

/**
 * Resolve a conflict between domio and task state.
 * - domio_wins → domioState always wins.
 * - task_wins  → taskState always wins.
 * - last_write_wins → per-field merge: the side with the newer updatedAt
 *   wins for each conflicting field; non-conflicting fields are merged.
 */
export function resolveSyncConflict(opts: {
  readonly domioState: TaskState;
  readonly taskState: TaskState;
  readonly syncMode: SyncMode;
  readonly fieldMap: FieldMap;
}): ConflictResolution {
  const { domioState, taskState, syncMode, fieldMap } = opts;

  if (syncMode === 'domio_wins') {
    return { winner: 'domio', merged: domioState, resolution: 'domio_wins' };
  }

  if (syncMode === 'task_wins') {
    return { winner: 'task', merged: taskState, resolution: 'task_wins' };
  }

  // last_write_wins: per-field LWW
  const domioNewer = domioState.updatedAt >= taskState.updatedAt;
  const base: TaskState = domioNewer ? domioState : taskState;
  const winner = domioNewer ? 'domio' : 'task';

  const mappedKeys = Object.keys(fieldMap);
  const mergedStatus = mappedKeys.includes('status') && readField(domioState, 'status') !== readField(taskState, 'status')
    ? readField(domioNewer ? domioState : taskState, 'status')
    : base.status;
  const mergedPriority = mappedKeys.includes('priority') && readField(domioState, 'priority') !== readField(taskState, 'priority')
    ? readField(domioNewer ? domioState : taskState, 'priority')
    : base.priority;
  const mergedAssignee = mappedKeys.includes('assignee') && readField(domioState, 'assignee') !== readField(taskState, 'assignee')
    ? readField(domioNewer ? domioState : taskState, 'assignee')
    : base.assignee;
  const mergedDueDate = mappedKeys.includes('due_date') && readField(domioState, 'due_date') !== readField(taskState, 'due_date')
    ? readField(domioNewer ? domioState : taskState, 'due_date')
    : base.due_date;
  const mergedTitle = mappedKeys.includes('title') && readField(domioState, 'title') !== readField(taskState, 'title')
    ? readField(domioNewer ? domioState : taskState, 'title')
    : base.title;

  const merged: TaskState = {
    status: mergedStatus,
    priority: mergedPriority,
    assignee: mergedAssignee,
    due_date: mergedDueDate,
    title: mergedTitle,
    updatedAt: base.updatedAt,
  };

  return { winner, merged, resolution: 'last_write_wins' };
}
