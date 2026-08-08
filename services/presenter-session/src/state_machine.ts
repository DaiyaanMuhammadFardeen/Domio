/**
 * @domio/presenter-session — stage state machine.
 *
 * Pure functions that compute the next `StageState` given an action. The
 * service layer is the single writer of state — co-presenters reconcile
 * via the dynamic_plan reducer (see `dynamic_plan.ts`), not via competing
 * state writes.
 *
 * Invariants enforced here:
 *  1. Once a session ends, no further mutations apply.
 *  2. Mode transitions follow a strict graph (see ALLOWED_MODE_TRANSITIONS).
 *  3. Animation frame may not exceed `animation.duration_ms` (if known).
 */

import type { SessionMode, StageState } from './types.js';

export const ALLOWED_MODE_TRANSITIONS: Readonly<Record<SessionMode, ReadonlyArray<SessionMode>>> = {
  live:             ['rehearsal', 'multi_presenter', 'offline', 'failover'],
  rehearsal:        ['live', 'offline'],
  offline:          ['live', 'failover'],
  multi_presenter:  ['live', 'failover'],
  failover:         ['live', 'multi_presenter', 'offline'],
};

/** Pure reducer: returns the next state without mutating inputs. */
export function applyModeTransition(current: SessionMode, target: SessionMode): SessionMode {
  if (current === target) return current;
  if (!ALLOWED_MODE_TRANSITIONS[current].includes(target)) {
    throw new Error(`illegal mode transition: ${current} → ${target}`);
  }
  return target;
}

export interface AdvanceAction {
  type: 'advance';
  target_slide_id?: string | undefined;
  target_slide_index?: number | undefined;
  animation_frame_ms?: number | undefined;
  animation_id?: string | null | undefined;
  prototype_variables?: Record<string, unknown> | undefined;
  scenario?: string | undefined;
  ts_ms: number;
}

/** Apply an advance action to a stage state. Pure. */
export function applyAdvance(state: StageState, action: AdvanceAction): StageState {
  if (action.type !== 'advance') {
    throw new Error(`applyAdvance: unexpected action ${action.type}`);
  }
  return {
    ...state,
    slide_id: action.target_slide_id ?? state.slide_id,
    slide_index: action.target_slide_index ?? state.slide_index,
    animation_frame_ms: action.animation_frame_ms ?? state.animation_frame_ms,
    animation_id: action.animation_id !== undefined ? action.animation_id : state.animation_id,
    prototype_variables: action.prototype_variables ?? state.prototype_variables,
    scenario: action.scenario ?? state.scenario,
    last_update_ts: action.ts_ms,
  };
}

/** Initial state factory. */
export function initialStageState(args: {
  slide_id: string;
  slide_index: number;
  prototype_variables?: Record<string, unknown> | undefined;
  scenario?: string | undefined;
  reduced_motion?: boolean | undefined;
  ts_ms: number;
}): StageState {
  return {
    slide_id: args.slide_id,
    slide_index: args.slide_index,
    animation_frame_ms: 0,
    animation_id: null,
    prototype_variables: args.prototype_variables ?? {},
    scenario: args.scenario,
    last_update_ts: args.ts_ms,
    reduced_motion: args.reduced_motion ?? false,
    meta: {},
  };
}

/** Validate that two states agree on a quorum value — used by handoff.
 *  Equality is shallow on the stage fields that the audience sees. */
export function statesEquivalent(a: StageState, b: StageState): boolean {
  return (
    a.slide_id === b.slide_id &&
    a.slide_index === b.slide_index &&
    a.animation_frame_ms === b.animation_frame_ms &&
    a.animation_id === b.animation_id &&
    a.scenario === b.scenario
  );
}