/**
 * @domio/presenter-session — public types and errors.
 *
 * Phase 15 W1. The presenter-session service is the source of truth for a
 * live presenter session. Every state mutation (advance, annotate, plan,
 * handover, failover, agenda timer tick, parking lot pin, whisper) routes
 * through this service with optimistic concurrency (If-Match: etag) and
 * idempotency keys.
 *
 * Mode taxonomy:
 *   - 'live'              : ordinary live session.
 *   - 'rehearsal'         : dry-run; analytics plane excludes this row.
 *   - 'offline'           : offline cache + snapshot fallback only.
 *   - 'multi_presenter'   : ≥2 co-presenters; CRDT-merged dynamic plan.
 *   - 'failover'          : handoff/recovery in flight.
 */

export type SessionMode = 'live' | 'rehearsal' | 'offline' | 'multi_presenter' | 'failover';

/** Canonical stage state — slide index, animation frame, prototype variables,
 *  hidden overlay. Held as JSONB in the `state` column.
 *  This is the single source of truth that W2 presenter view reads from. */
export interface StageState {
  /** Slide index in the canonical deck order. May be remapped via dynamic_plan. */
  slide_index: number;
  /** Slide id (string). Allows stable IDs across reorders. */
  slide_id: string;
  /** Animation timeline position (ms within the slide's local timeline). */
  animation_frame_ms: number;
  /** Animation id being played, or null when no animation is running. */
  animation_id: string | null;
  /** P10 prototype variables snapshot. */
  prototype_variables: Record<string, unknown>;
  /** Current scenario state if scenario_manager is bound. */
  scenario?: string | undefined;
  /** Last update timestamp (ms since epoch). */
  last_update_ts: number;
  /** Reduced-motion flag — honored by all UI surfaces. */
  reduced_motion: boolean;
  /** Free-form metadata bag (key feature flags, etc.). */
  meta: Record<string, unknown>;
}

/** Agenda timer row schema (mirrors `agenda_timer` table). */
export interface AgendaTimer {
  id: string;
  label: string;
  timer_kind: 'agenda' | 'hard_stop' | 'soft_stop';
  starts_at: string; // ISO
  duration_ms: number;
  remaining_ms: number;
  paused_ms: number;
  visible_to: 'presenter' | 'audience' | 'both';
  status: 'idle' | 'running' | 'paused' | 'done' | 'cancelled';
  brand_var_overrides: Record<string, string>;
  event_log: AgendaTimerEvent[];
}

export interface AgendaTimerEvent {
  ts_ms: number;
  kind: 'start' | 'pause' | 'resume' | 'tick' | 'done' | 'cancel' | 'adjust';
  by?: string;
  remaining_ms_after?: number;
}

/** Parking lot digest (mirrored from `parking_lot_item` for fast reads). */
export interface ParkingLotDigest {
  pinned_count: number;
  open_count: number;
  pinned_ids: string[];
}

/** PiP config (mirrors `pip_config` table). */
export interface PipConfig {
  position: 'corner' | 'banner' | 'hidden';
  shape: 'rect' | 'circle' | 'rounded';
  width_px: number;
  height_px: number;
  virtual_background: 'none' | 'blur' | 'image' | 'video';
  virtual_background_asset_id?: string;
  border_color?: string;
  shadow: boolean;
  consent_id?: string;
  segmentation_model: 'mediapipe_selfie' | 'webgl2_threshold';
}

/** Display profile mirror (active profile + mirror mode). */
export interface DisplayProfileSnapshot {
  name: string;
  width: number;
  height: number;
  refresh_hz: number;
  color_profile: 'srgb' | 'display_p3' | 'rec2020';
  hdr: boolean;
  bandwidth_estimate_mbps: number;
  mirror_mode: 'clone' | 'extend' | 'audience_only';
}

/** Snapshot returned to the presenter runtime on GET. */
export interface PresenterSession {
  id: string;
  workspace_id: string;
  deck_id: string;
  presenter_id: string;
  state: StageState;
  agenda_timers: AgendaTimer[];
  parking_lot: ParkingLotDigest;
  display_profile: DisplayProfileSnapshot;
  pip_config: PipConfig;
  mode: SessionMode;
  /** BIGINT — monotonic optimistic-CC version. */
  version: number;
  started_at: string;
  ended_at: string | null;
  last_heartbeat_at: string | null;
}

/** Inputs to create a new session. */
export interface CreateSessionInput {
  workspace_id: string;
  deck_id: string;
  presenter_id: string;
  initial_slide_id: string;
  initial_slide_index: number;
  prototype_variables?: Record<string, unknown> | undefined;
  mode?: SessionMode | undefined;
  display_profile?: DisplayProfileSnapshot | undefined;
  pip_config?: PipConfig | undefined;
  idempotency_key?: string | undefined;
}

/** Advance: move the stage. */
export interface AdvanceInput {
  target_slide_id?: string | undefined;
  target_slide_index?: number | undefined;
  animation_frame_ms?: number | undefined;
  animation_id?: string | null | undefined;
  prototype_variables?: Record<string, unknown> | undefined;
  scenario?: string | undefined;
  expected_version: number;
  idempotency_key?: string | undefined;
}

export interface AnnotationCommitInput {
  slide_id: string;
  layer_id?: string | undefined;
  kind: 'pen' | 'highlighter' | 'spotlight' | 'zoom' | 'blur';
  geometry: Record<string, unknown>;
  style?: Record<string, unknown> | undefined;
  color?: string | undefined;
  stroke_width?: number | undefined;
  ephemeral?: boolean | undefined;
  drawn_by: string;
  drawn_by_display_name?: string | undefined;
  expected_version: number;
  idempotency_key?: string | undefined;
}

export interface PlanPatchInput {
  order?: string[] | undefined;
  hidden?: string[] | undefined;
  expected_version: number;
  idempotency_key?: string | undefined;
}

export interface HandoverInput {
  to_presenter_id: string;
  state_snapshot: StageState;
  transfer_token: string;
  expected_version: number;
  idempotency_key?: string;
}

export interface FailoverInput {
  primary_device_id: string;
  paired_device_id?: string;
  replicated_state: StageState;
  recovery_result?: 'success' | 'failure' | 'cancelled';
  expected_version: number;
  idempotency_key?: string;
}

export interface RecapSummaryInput {
  per_slide_ms: Record<string, number>;
  slides_shown: string[];
  slides_skipped: string[];
  saved_annotations: string[];
  parking_lot_open: string[];
  parking_lot_pinned: string[];
  audience_summary?: Record<string, unknown>;
  presenter_notes?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PresenterSessionValidationError extends Error {
  readonly code = 'PRESENTER_SESSION_VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PresenterSessionValidationError';
  }
}

export class PresenterSessionNotFoundError extends Error {
  readonly code = 'PRESENTER_SESSION_NOT_FOUND' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PresenterSessionNotFoundError';
  }
}

export class PresenterSessionConflictError extends Error {
  readonly code = 'PRESENTER_SESSION_CONFLICT' as const;
  /** The current state, returned to the loser so they can re-issue with a new etag. */
  readonly current: PresenterSession;
  constructor(message: string, current: PresenterSession) {
    super(message);
    this.name = 'PresenterSessionConflictError';
    this.current = current;
  }
}

export class PresenterSessionEndedError extends Error {
  readonly code = 'PRESENTER_SESSION_ENDED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PresenterSessionEndedError';
  }
}

export function validateCreateSessionInput(input: CreateSessionInput): void {
  if (!input.workspace_id || typeof input.workspace_id !== 'string') {
    throw new PresenterSessionValidationError('workspace_id is required');
  }
  if (!input.deck_id || typeof input.deck_id !== 'string') {
    throw new PresenterSessionValidationError('deck_id is required');
  }
  if (!input.presenter_id || typeof input.presenter_id !== 'string') {
    throw new PresenterSessionValidationError('presenter_id is required');
  }
  if (!input.initial_slide_id) {
    throw new PresenterSessionValidationError('initial_slide_id is required');
  }
  if (!Number.isInteger(input.initial_slide_index) || input.initial_slide_index < 0) {
    throw new PresenterSessionValidationError('initial_slide_index must be >= 0');
  }
  if (
    input.mode &&
    !['live', 'rehearsal', 'offline', 'multi_presenter', 'failover'].includes(input.mode)
  ) {
    throw new PresenterSessionValidationError(`invalid mode: ${input.mode}`);
  }
}

export function validateAdvanceInput(input: AdvanceInput): void {
  if (
    input.target_slide_id === undefined &&
    input.target_slide_index === undefined &&
    input.animation_frame_ms === undefined &&
    input.animation_id === undefined &&
    input.prototype_variables === undefined &&
    input.scenario === undefined
  ) {
    throw new PresenterSessionValidationError('advance must change at least one field');
  }
  if (
    input.target_slide_index !== undefined &&
    (!Number.isInteger(input.target_slide_index) || input.target_slide_index < 0)
  ) {
    throw new PresenterSessionValidationError('target_slide_index must be a non-negative integer');
  }
  if (
    input.animation_frame_ms !== undefined &&
    (!Number.isFinite(input.animation_frame_ms) || input.animation_frame_ms < 0)
  ) {
    throw new PresenterSessionValidationError('animation_frame_ms must be >= 0');
  }
  if (!Number.isInteger(input.expected_version) || input.expected_version < 1) {
    throw new PresenterSessionValidationError('expected_version must be a positive integer');
  }
}
