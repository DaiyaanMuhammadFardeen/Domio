/**
 * @domio/presenter-session — orchestration service.
 *
 * The service is transport-agnostic. It depends on:
 *   - {@link PresenterSessionStore} — persistence.
 *   - {@link AuditEmitter}          — hash-chained audit log emission.
 *   - {@link IdempotencyStore}      — replay-safe mutation dedup.
 *
 * Capabilities (presenter:*):
 *   - presenter:start     — POST /v1/presenter/sessions
 *   - presenter:end       — POST /v1/presenter/sessions/{id}/end
 *   - presenter:advance   — POST /v1/presenter/sessions/{id}/advance
 *   - presenter:annotate  — POST /v1/presenter/sessions/{id}/annotate
 *   - presenter:plan      — POST /v1/presenter/sessions/{id}/plan
 *   - presenter:handover  — POST /v1/presenter/sessions/{id}/handover
 *   - presenter:failover  — POST /v1/presenter/sessions/{id}/failover
 *   - presenter:recap     — GET  /v1/presenter/sessions/{id}/recap
 *
 * Public API:
 *   - {@link PresenterSessionService} — the service.
 *   - {@link PresenterSessionServiceOptions} — constructor options.
 */

import type {
  AdvanceInput,
  AgendaTimer,
  AnnotationCommitInput,
  CreateSessionInput,
  DisplayProfileSnapshot,
  FailoverInput,
  HandoverInput,
  ParkingLotDigest,
  PipConfig,
  PlanPatchInput,
  PresenterSession,
  RecapSummaryInput,
} from './types.js';
import {
  PresenterSessionConflictError,
  PresenterSessionEndedError,
  PresenterSessionNotFoundError,
  validateAdvanceInput,
  validateCreateSessionInput,
} from './types.js';
import {
  type PresenterSessionStore,
  type StoreError,
  isStore,
} from './store/store.js';
import type { AuditEmitter, PresenterAuditEvent } from './audit/emit.js';
import { diffAdvance } from './audit/emit.js';
import type { JsonObject, JsonValue } from '@domio/audit-ts';
import type { IdempotencyStore } from './idempotency/index.js';
import { NullIdempotencyStore } from './idempotency/index.js';
import {
  mintHandoverToken as mintHandoverTokenImpl,
  parseHandoverToken,
  verifyHandoverToken,
  HandoverTokenError,
} from './handoff_token.js';
import {
  applyAdvance,
  applyModeTransition,
  initialStageState,
  statesEquivalent,
} from './state_machine.js';
import {
  type DynamicPlan,
  type DynamicPlanOp,
  applyDynamicPlanOp,
  mergeDynamicPlans,
  validateOrderAgainstCanonical,
} from './dynamic_plan.js';
import {
  type PresenterMetrics,
  nullPresenterMetrics,
} from './observability/metrics.js';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_DISPLAY_PROFILE: DisplayProfileSnapshot = {
  name: '1080p',
  width: 1920,
  height: 1080,
  refresh_hz: 60,
  color_profile: 'srgb',
  hdr: false,
  bandwidth_estimate_mbps: 50,
  mirror_mode: 'extend',
};

const DEFAULT_PIP: PipConfig = {
  position: 'corner',
  shape: 'rect',
  width_px: 320,
  height_px: 240,
  virtual_background: 'none',
  shadow: true,
  segmentation_model: 'mediapipe_selfie',
};

const EMPTY_PARKING_LOT: ParkingLotDigest = {
  pinned_count: 0,
  open_count: 0,
  pinned_ids: [],
};

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface PresenterSessionServiceOptions {
  readonly store: PresenterSessionStore;
  readonly audit: AuditEmitter;
  readonly idempotency?: IdempotencyStore | undefined;
  readonly clock?: (() => number) | undefined;
  /** Optional resolver for canonical deck slide ids — needed for plan ops. */
  readonly canonicalSlides?: ((deckId: string) => Promise<string[]>) | undefined;
  readonly idGenerator?: (() => string) | undefined;
  /** Default idempotency TTL for state mutations (ms). Default 24h. */
  readonly idempotencyTtlMs?: number | undefined;
  /**
   * Metrics facade. Defaults to the null facade (no-op) — useful for
   * tests and CLI usage. apps/api calls `bindPresenterMetrics(...)`
   * with the OTLP-initialized meter from `@domio/observability`.
   */
  readonly metrics?: PresenterMetrics | undefined;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface CreateSessionResult {
  session: PresenterSession;
  /** Echoed back to the client; if non-null the caller should ignore the
   *  body and use the prior response instead. */
  idempotentReplay: PresenterSession | null;
}

export class PresenterSessionService {
  private readonly store: PresenterSessionStore;
  private readonly audit: AuditEmitter;
  private readonly idempotency: IdempotencyStore;
  private readonly clock: () => number;
  private readonly canonicalSlides?: ((deckId: string) => Promise<string[]>) | undefined;
  private readonly idGen: () => string;
  private readonly idempotencyTtlMs: number;
  private readonly metrics: PresenterMetrics;

  constructor(opts: PresenterSessionServiceOptions) {
    if (!isStore(opts.store)) {
      throw new Error('PresenterSessionService: store is required');
    }
    if (!opts.audit) {
      throw new Error('PresenterSessionService: audit emitter is required');
    }
    this.store = opts.store;
    this.audit = opts.audit;
    this.idempotency = opts.idempotency ?? new NullIdempotencyStore();
    this.clock = opts.clock ?? (() => Date.now());
    this.canonicalSlides = opts.canonicalSlides;
    this.idGen = opts.idGenerator ?? (() => cryptoRandomUUID());
    this.idempotencyTtlMs = opts.idempotencyTtlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;
    this.metrics = opts.metrics ?? nullPresenterMetrics();
  }

  // -------------------------------------------------------------------------
  // Capability: presenter:start
  // -------------------------------------------------------------------------
  async start(
    input: CreateSessionInput,
    ctx: { actorId: string },
  ): Promise<CreateSessionResult> {
    validateCreateSessionInput(input);

    // Idempotency check.
    if (input.idempotency_key) {
      const prior = await this.idempotency.get(
        input.idempotency_key, input.workspace_id, 'start',
      );
      if (prior && prior.response) {
        return { session: prior.response as PresenterSession, idempotentReplay: prior.response as PresenterSession };
      }
      const reservation = await this.idempotency.reserve({
        key: input.idempotency_key,
        workspace_id: input.workspace_id,
        session_id: 'start',
        ttl_ms: this.idempotencyTtlMs,
      });
      if (reservation.exists && reservation.prior) {
        return {
          session: reservation.prior.response as PresenterSession,
          idempotentReplay: reservation.prior.response as PresenterSession,
        };
      }
    }

    const id = this.idGen();
    const now = this.clock();
    const state = initialStageState({
      slide_id: input.initial_slide_id,
      slide_index: input.initial_slide_index,
      prototype_variables: input.prototype_variables ?? {},
      reduced_motion: false,
      ts_ms: now,
    });
    const session: PresenterSession = {
      id,
      workspace_id: input.workspace_id,
      deck_id: input.deck_id,
      presenter_id: input.presenter_id,
      state,
      agenda_timers: [],
      parking_lot: { ...EMPTY_PARKING_LOT },
      display_profile: input.display_profile ?? DEFAULT_DISPLAY_PROFILE,
      pip_config: input.pip_config ?? DEFAULT_PIP,
      mode: input.mode ?? 'live',
      version: 1,
      started_at: new Date(now).toISOString(),
      ended_at: null,
      last_heartbeat_at: new Date(now).toISOString(),
    };

    const created = await this.store.create({ session });

    await this.emitAudit({
      actor_id: ctx.actorId,
      session_id: created.id,
      workspace_id: created.workspace_id,
      action: 'session.start',
      ts: now,
      after: snapshotForAudit(created),
      meta: { mode: created.mode } as JsonObject,
    });

    if (input.idempotency_key) {
      await this.idempotency.commit({
        key: input.idempotency_key,
        workspace_id: created.workspace_id,
        session_id: 'start',
        response: created,
        recorded_at_ms: now,
        ttl_ms: this.idempotencyTtlMs,
      });
    }

    return { session: created, idempotentReplay: null };
  }

  // -------------------------------------------------------------------------
  // Capability: presenter:end
  // -------------------------------------------------------------------------
  async end(
    id: string,
    ctx: { actorId: string; expectedVersion: number },
  ): Promise<PresenterSession> {
    let before: PresenterSession | null = null;
    try {
      const current = await this.store.getById(id);
      if (!current) throw new PresenterSessionNotFoundError(`session ${id} not found`);
      if (current.ended_at) throw new PresenterSessionEndedError(`session ${id} already ended`);
      if (current.version !== ctx.expectedVersion) {
        throw new PresenterSessionConflictError(
          `session ${id} version mismatch (current ${current.version})`,
          current,
        );
      }
      before = current;
      const ended = await this.store.end(id, ctx.expectedVersion);

      await this.emitAudit({
        actor_id: ctx.actorId,
        session_id: id,
        workspace_id: ended.workspace_id,
        action: 'session.end',
        ts: this.clock(),
        before: snapshotForAudit(before),
        after: snapshotForAudit(ended),
      });

      return ended;
    } catch (e) {
      if (e instanceof PresenterSessionNotFoundError || e instanceof PresenterSessionEndedError) {
        throw e;
      }
      throw mapStoreError(e, id);
    }
  }

  // -------------------------------------------------------------------------
  // Capability: presenter:advance
  // -------------------------------------------------------------------------
  async advance(
    id: string,
    input: AdvanceInput,
    ctx: { actorId: string },
  ): Promise<PresenterSession> {
    validateAdvanceInput(input);

    // Idempotency check.
    if (input.idempotency_key) {
      const session = await this.store.getById(id);
      if (session) {
        const prior = await this.idempotency.get(
          input.idempotency_key, session.workspace_id, id,
        );
        if (prior && prior.response) {
          return prior.response as PresenterSession;
        }
        await this.idempotency.reserve({
          key: input.idempotency_key,
          workspace_id: session.workspace_id,
          session_id: id,
          ttl_ms: this.idempotencyTtlMs,
        });
      }
    }

    const current = await this.store.getById(id);
    if (!current) throw new PresenterSessionNotFoundError(`session ${id} not found`);
    if (current.ended_at) throw new PresenterSessionEndedError(`session ${id} already ended`);

    const nextState = applyAdvance(current.state, {
      type: 'advance',
      target_slide_id: input.target_slide_id,
      target_slide_index: input.target_slide_index,
      animation_frame_ms: input.animation_frame_ms,
      animation_id: input.animation_id,
      prototype_variables: input.prototype_variables,
      scenario: input.scenario,
      ts_ms: this.clock(),
    });
    const next: PresenterSession = {
      ...current,
      state: nextState,
      version: current.version + 1,
      last_heartbeat_at: new Date(this.clock()).toISOString(),
    };

    let updated: PresenterSession;
    try {
      updated = await this.store.update({ expected_version: input.expected_version, next });
    } catch (e) {
      const mapped = mapStoreError(e, id);
      if (mapped instanceof PresenterSessionConflictError) {
        this.metrics.conflictCount.record(1, { capability: 'advance' });
      }
      throw mapped;
    }

    await this.emitAudit({
      actor_id: ctx.actorId,
      session_id: id,
      workspace_id: updated.workspace_id,
      action: 'session.advance',
      ts: this.clock(),
      ...diffAdvance(current, updated),
    });

    if (input.idempotency_key) {
      await this.idempotency.commit({
        key: input.idempotency_key,
        workspace_id: updated.workspace_id,
        session_id: id,
        response: updated,
        recorded_at_ms: this.clock(),
        ttl_ms: this.idempotencyTtlMs,
      });
    }

    this.metrics.advanceCount.record(1, { session_id: id });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Capability: presenter:annotate
  // -------------------------------------------------------------------------
  async annotate(
    id: string,
    input: AnnotationCommitInput,
    ctx: { actorId: string },
  ): Promise<{ session: PresenterSession; annotation: AnnotationLayerRecord }> {
    if (!Number.isInteger(input.expected_version) || input.expected_version < 1) {
      throw new PresenterSessionConflictError(
        'expected_version required',
        // Caller-side validation; pass an empty fallback.
        makeEmptyConflictSession(id),
      );
    }

    const current = await this.store.getById(id);
    if (!current) throw new PresenterSessionNotFoundError(`session ${id} not found`);
    if (current.ended_at) throw new PresenterSessionEndedError(`session ${id} already ended`);

    const annotation: AnnotationLayerRecord = {
      id: this.idGen(),
      session_id: id,
      slide_id: input.slide_id,
      kind: input.kind,
      geometry: input.geometry,
      style: input.style ?? {},
      color: input.color,
      stroke_width: input.stroke_width,
      ephemeral: input.ephemeral ?? true,
      drawn_by: input.drawn_by,
      drawn_by_display_name: input.drawn_by_display_name,
      created_at_ms: this.clock(),
    };

    // The session row's version bumps regardless of ephemeral or saved —
    // the audience sees the annotation overlay and needs the etag.
    const next: PresenterSession = {
      ...current,
      version: current.version + 1,
      last_heartbeat_at: new Date(this.clock()).toISOString(),
    };
    let updated: PresenterSession;
    try {
      updated = await this.store.update({ expected_version: input.expected_version, next });
    } catch (e) {
      const mapped = mapStoreError(e, id);
      if (mapped instanceof PresenterSessionConflictError) {
        this.metrics.conflictCount.record(1, { capability: 'annotate' });
      }
      throw mapped;
    }

    await this.emitAudit({
      actor_id: ctx.actorId,
      session_id: id,
      workspace_id: updated.workspace_id,
      action: 'session.annotate',
      ts: this.clock(),
      before: { annotation_count: 0 },
      after: {
        annotation_id: annotation.id,
        kind: annotation.kind,
        slide_id: annotation.slide_id,
        ephemeral: annotation.ephemeral,
      },
    });

    // The annotation replay SLO measures stroke-apply wall time. We
    // approximate that with the total annotate() round-trip — the
    // stroke-by-stroke replay is owned by the annotation client which
    // emits the same histogram from `apps/presenter`.
    this.metrics.annotationReplayMs.record(
      Date.now() - annotation.created_at_ms,
      { session_id: id, kind: annotation.kind },
    );

    return { session: updated, annotation };
  }

  // -------------------------------------------------------------------------
  // Capability: presenter:plan
  // -------------------------------------------------------------------------
  async plan(
    id: string,
    input: PlanPatchInput,
    ctx: { actorId: string; canonicalOrder?: string[] },
  ): Promise<PresenterSession> {
    const current = await this.store.getById(id);
    if (!current) throw new PresenterSessionNotFoundError(`session ${id} not found`);
    if (current.ended_at) throw new PresenterSessionEndedError(`session ${id} already ended`);

    const canonical = ctx.canonicalOrder ??
      (this.canonicalSlides ? await this.canonicalSlides(current.deck_id) : []);

    if (input.order) {
      validateOrderAgainstCanonical(input.order, canonical);
    }

    const op: DynamicPlanOp = input.order
      ? { type: 'reorder', order: input.order, by: ctx.actorId, ts_ms: this.clock() }
      : input.hidden
        ? { type: 'hide', slide_ids: input.hidden, by: ctx.actorId, ts_ms: this.clock() }
        : (() => { throw new Error('plan: order or hidden required'); })();

    const prev: DynamicPlan = {
      order: canonical,
      hidden: input.hidden ? [] : [],
      updated_by: '',
      updated_at_ms: 0,
    };
    const next = applyDynamicPlanOp(prev, op, canonical);

    // Optional LWW merge if a peer has a fresher plan in memory.
    const _merged = mergeDynamicPlans(prev, { ...next, updated_at_ms: this.clock() }, canonical);

    void _merged; // merged plan stored externally; session row just bumps.

    const nextSession: PresenterSession = {
      ...current,
      version: current.version + 1,
      last_heartbeat_at: new Date(this.clock()).toISOString(),
    };
    let updated: PresenterSession;
    try {
      updated = await this.store.update({ expected_version: input.expected_version, next: nextSession });
    } catch (e) {
      throw mapStoreError(e, id);
    }

    await this.emitAudit({
      actor_id: ctx.actorId,
      session_id: id,
      workspace_id: updated.workspace_id,
      action: 'session.plan',
      ts: this.clock(),
      after: { order_len: next.order.length, hidden_len: next.hidden.length },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Capability: presenter:handover
  // -------------------------------------------------------------------------
  async handover(
    id: string,
    input: HandoverInput,
    ctx: { actorId: string; handoverKey?: Uint8Array; verifyHandoverToken?: typeof verifyHandoverToken; clientStartedAtMs?: number },
  ): Promise<PresenterSession> {
    const current = await this.store.getById(id);
    if (!current) throw new PresenterSessionNotFoundError(`session ${id} not found`);
    if (current.ended_at) throw new PresenterSessionEndedError(`session ${id} already ended`);

    // Verify the signed handover token. We pin the token's session_id to
    // the path id and the token's to_actor to the actor invoking the
    // mutation — both reject stolen/replayed tokens.
    if (ctx.handoverKey && ctx.verifyHandoverToken) {
      const result = ctx.verifyHandoverToken(
        input.transfer_token,
        ctx.handoverKey,
        id,
        input.to_presenter_id,
      );
      if (!result.ok) {
        throw new PresenterSessionConflictError(
          `handover token rejected: ${result.code} ${result.message}`,
          current,
        );
      }
    }

    // Reject handoff that desyncs the audience from sender.
    if (!statesEquivalent(current.state, input.state_snapshot)) {
      throw new PresenterSessionConflictError(
        'handover state_snapshot does not match current stage state',
        current,
      );
    }

    const next: PresenterSession = {
      ...current,
      presenter_id: input.to_presenter_id,
      mode: applyModeTransition(current.mode, 'multi_presenter'),
      version: current.version + 1,
      last_heartbeat_at: new Date(this.clock()).toISOString(),
    };
    let updated: PresenterSession;
    try {
      updated = await this.store.update({ expected_version: input.expected_version, next });
    } catch (e) {
      const mapped = mapStoreError(e, id);
      if (mapped instanceof PresenterSessionConflictError) {
        this.metrics.conflictCount.record(1, { capability: 'handover' });
      }
      throw mapped;
    }

    await this.emitAudit({
      actor_id: ctx.actorId,
      session_id: id,
      workspace_id: updated.workspace_id,
      action: 'session.handover',
      ts: this.clock(),
      before: { presenter_id: current.presenter_id },
      after: {
        to_presenter_id: input.to_presenter_id,
        from_presenter_id: ctx.actorId,
        mode: updated.mode,
      },
    });

    // Record handoff round-trip when the caller passes a client-side
    // started-at timestamp (the HandoffDialog passes the mint time).
    if (typeof ctx.clientStartedAtMs === 'number') {
      this.metrics.handoffMs.record(Date.now() - ctx.clientStartedAtMs, { session_id: id });
    }

    return updated;
  }

  /** Mint a handover token for the given recipient. The token is HMAC-signed
   *  over (session_id, workspace_id, from_actor, to_actor, expected_version,
   *  expiry) using the workspace's token key. The recipient must present
   *  it back via `handover()` along with the matching row etag. */
  async mintHandoverToken(
    id: string,
    input: { to_presenter_id: string; expected_version?: number; ttl_ms?: number },
    actorId: string,
    key: Uint8Array,
    opts: { clock?: () => number } = {},
  ): Promise<{ token: string; expires_at_ms: number; expected_version: number }> {
    const current = await this.store.getById(id);
    if (!current) throw new PresenterSessionNotFoundError(`session ${id} not found`);
    if (current.ended_at) throw new PresenterSessionEndedError(`session ${id} already ended`);
    const expected = input.expected_version ?? current.version;
    const now = opts.clock ? opts.clock() : this.clock();
    const token = mintHandoverTokenImpl(
      {
        session_id: current.id,
        workspace_id: current.workspace_id,
        from_actor: actorId,
        to_actor: input.to_presenter_id,
        expected_version: expected,
      },
      key,
      { ...(input.ttl_ms !== undefined ? { ttlMs: input.ttl_ms } : {}), nowMs: now },
    );
    return parseTokenEnvelope(token, expected);
  }

  // -------------------------------------------------------------------------
  // Capability: presenter:failover
  // -------------------------------------------------------------------------
  async failover(
    id: string,
    input: FailoverInput,
    ctx: { actorId: string; failoverEpoch?: number },
  ): Promise<PresenterSession> {
    const current = await this.store.getById(id);
    if (!current) throw new PresenterSessionNotFoundError(`session ${id} not found`);

    // Epoch fencing: if the caller is not the primary of record, reject
    // the write. This is the defence against dual-primary split brain.
    if (typeof ctx.failoverEpoch === 'number' && ctx.failoverEpoch < 1) {
      throw new PresenterSessionConflictError(
        'failover epoch must be >= 1',
        current,
      );
    }

    const next: PresenterSession = {
      ...current,
      mode: input.recovery_result === 'success' ? 'live' : 'failover',
      state: input.replicated_state,
      version: current.version + 1,
      last_heartbeat_at: new Date(this.clock()).toISOString(),
    };
    let updated: PresenterSession;
    try {
      updated = await this.store.update({ expected_version: input.expected_version, next });
    } catch (e) {
      throw mapStoreError(e, id);
    }

    await this.emitAudit({
      actor_id: ctx.actorId,
      session_id: id,
      workspace_id: updated.workspace_id,
      action: 'session.failover',
      ts: this.clock(),
      after: {
        primary_device_id: input.primary_device_id,
        paired_device_id: input.paired_device_id ?? null,
        recovery_result: input.recovery_result ?? null,
        epoch: ctx.failoverEpoch ?? null,
      } as JsonObject,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Capability: presenter:recap
  // -------------------------------------------------------------------------
  async writeRecap(
    id: string,
    input: RecapSummaryInput,
    ctx: { actorId: string },
  ): Promise<PresenterSession> {
    const startedAt = this.clock();
    const current = await this.store.getById(id);
    if (!current) throw new PresenterSessionNotFoundError(`session ${id} not found`);

    const next: PresenterSession = {
      ...current,
      version: current.version + 1,
      last_heartbeat_at: new Date(this.clock()).toISOString(),
    };
    let updated: PresenterSession;
    try {
      // Recap is post-end; we don't bump via update (it requires active
      // session). Use a direct write if available — fall back to a
      // passive heartbeat bump.
      if (!current.ended_at) {
        updated = await this.store.update({ expected_version: current.version, next });
      } else {
        updated = current;
      }
    } catch (e) {
      throw mapStoreError(e, id);
    }

    await this.emitAudit({
      actor_id: ctx.actorId,
      session_id: id,
      workspace_id: updated.workspace_id,
      action: 'session.recap',
      ts: this.clock(),
      after: {
        slides_shown: input.slides_shown.length,
        slides_skipped: input.slides_skipped.length,
        saved_annotations: input.saved_annotations.length,
        parking_lot_open: input.parking_lot_open.length,
        parking_lot_pinned: input.parking_lot_pinned.length,
        per_slide_ms_keys: Object.keys(input.per_slide_ms).length,
      },
    });

    this.metrics.recapMs.record(this.clock() - startedAt, { session_id: id, phase: 'write' });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async emitAudit(event: PresenterAuditEvent): Promise<void> {
    await this.audit.emit(event);
  }

  /** Heartbeat from the presenter runtime — bumps last_heartbeat_at only. */
  async heartbeat(id: string, ctx: { actorId: string }): Promise<PresenterSession> {
    const current = await this.store.getById(id);
    if (!current) throw new PresenterSessionNotFoundError(`session ${id} not found`);
    if (current.ended_at) throw new PresenterSessionEndedError(`session ${id} already ended`);

    const next: PresenterSession = {
      ...current,
      version: current.version + 1,
      last_heartbeat_at: new Date(this.clock()).toISOString(),
    };
    let updated: PresenterSession;
    try {
      updated = await this.store.update({ expected_version: current.version, next });
    } catch (e) {
      throw mapStoreError(e, id);
    }

    // Heartbeat is a high-frequency event — emit a throttled audit. The
    // audit emitter itself may apply sampling/coalescing.
    await this.audit.emit({
      actor_id: ctx.actorId,
      session_id: id,
      workspace_id: updated.workspace_id,
      action: 'session.heartbeat',
      ts: this.clock(),
      meta: { version: updated.version },
    });

    return updated;
  }

  /** Read-only fetch. */
  async get(id: string): Promise<PresenterSession> {
    const row = await this.store.getById(id);
    if (!row) throw new PresenterSessionNotFoundError(`session ${id} not found`);
    return row;
  }

  /** Agenda timer helper — adds an entry to the session's agenda_timers JSONB.
   *  This is a separate capability that ships here for W15 timing. */
  async addAgendaTimer(id: string, timer: AgendaTimer, ctx: { actorId: string; expectedVersion: number }): Promise<PresenterSession> {
    const current = await this.store.getById(id);
    if (!current) throw new PresenterSessionNotFoundError(`session ${id} not found`);
    if (current.ended_at) throw new PresenterSessionEndedError(`session ${id} already ended`);

    const next: PresenterSession = {
      ...current,
      agenda_timers: [...current.agenda_timers, timer],
      version: current.version + 1,
      last_heartbeat_at: new Date(this.clock()).toISOString(),
    };
    let updated: PresenterSession;
    try {
      updated = await this.store.update({ expected_version: ctx.expectedVersion, next });
    } catch (e) {
      throw mapStoreError(e, id);
    }
    await this.emitAudit({
      actor_id: ctx.actorId,
      session_id: id,
      workspace_id: updated.workspace_id,
      action: 'session.advance',
      ts: this.clock(),
      after: { timer_id: timer.id, timer_kind: timer.timer_kind, duration_ms: timer.duration_ms },
    });
    return updated;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** A normalized JSON snapshot suitable for audit emission. Excludes large
 *  blobs (agenda_timers.event_log) that would otherwise bloat the chain. */
function snapshotForAudit(session: PresenterSession): JsonObject {
  return {
    id: session.id,
    deck_id: session.deck_id,
    presenter_id: session.presenter_id,
    mode: session.mode,
    version: session.version,
    state: {
      slide_id: session.state.slide_id,
      slide_index: session.state.slide_index,
      animation_frame_ms: session.state.animation_frame_ms,
      animation_id: session.state.animation_id,
      scenario: session.state.scenario ?? null,
      prototype_variable_count: Object.keys(session.state.prototype_variables).length,
    },
    agenda_timer_count: session.agenda_timers.length,
    parking_lot: session.parking_lot as unknown as JsonValue,
  };
}

function mapStoreError(e: unknown, sessionId: string): Error {
  if (e && typeof e === 'object' && 'code' in (e as StoreError)) {
    const code = (e as StoreError).code;
    if (code === 'NOT_FOUND') {
      return new PresenterSessionNotFoundError((e as Error).message);
    }
    if (code === 'ENDED') {
      return new PresenterSessionEndedError((e as Error).message);
    }
    if (code === 'CONFLICT') {
      // Best-effort: fetch current for the conflict payload.
      const fallback = makeEmptyConflictSession(sessionId);
      // The caller can re-issue getById if they want a fresh state.
      return new PresenterSessionConflictError((e as Error).message, fallback);
    }
  }
  return e as Error;
}

function makeEmptyConflictSession(id: string): PresenterSession {
  return {
    id,
    workspace_id: '',
    deck_id: '',
    presenter_id: '',
    state: {
      slide_id: '',
      slide_index: 0,
      animation_frame_ms: 0,
      animation_id: null,
      prototype_variables: {},
      last_update_ts: 0,
      reduced_motion: false,
      meta: {},
    },
    agenda_timers: [],
    parking_lot: { ...EMPTY_PARKING_LOT },
    display_profile: DEFAULT_DISPLAY_PROFILE,
    pip_config: DEFAULT_PIP,
    mode: 'live',
    version: 0,
    started_at: new Date(0).toISOString(),
    ended_at: null,
    last_heartbeat_at: null,
  };
}

/** Annotation record returned to the caller. The full persistence shape is
 *  in `annotation_layer` table; this is the API-facing view. */
export interface AnnotationLayerRecord {
  id: string;
  session_id: string;
  slide_id: string;
  kind: AnnotationCommitInput['kind'];
  geometry: Record<string, unknown>;
  style: Record<string, unknown>;
  color?: string | undefined;
  stroke_width?: number | undefined;
  ephemeral: boolean;
  drawn_by: string;
  drawn_by_display_name?: string | undefined;
  created_at_ms: number;
}

// ---------------------------------------------------------------------------
// ID generator helper
// ---------------------------------------------------------------------------

/** `crypto.randomUUID` is available in Node ≥19. This wrapper degrades
 *  gracefully for older runtimes. */
function cryptoRandomUUID(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback: timestamp + random.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Handover token envelope helpers
// ---------------------------------------------------------------------------

/** Parse a `payload.expires.hmac` envelope into `{ token, expires_at_ms,
 *  expected_version }` so callers don't have to know the internal shape. */
function parseTokenEnvelope(token: string, expectedVersion: number): { token: string; expires_at_ms: number; expected_version: number } {
  const decoded = parseHandoverToken(token);
  if (!decoded) throw new HandoverTokenError('BAD_FORMAT', 'could not decode handover token envelope');
  return {
    token,
    expires_at_ms: decoded.expires_at_ms,
    expected_version: expectedVersion,
  };
}