/**
 * @domio/participant-session — orchestration service.
 *
 * Phase 16 W1. Source-of-truth for the audience side of a live
 * session. Mirrors the surface of `@domio/presenter-session` but
 * operates per-participant:
 *
 *   - participant:join      — POST /v1/audience/join
 *   - participant:heartbeat — POST /v1/audience/sessions/{id}/heartbeat
 *   - participant:leave     — POST /v1/audience/sessions/{id}/leave
 *   - participant:list      — GET  /v1/audience/sessions (active)
 *
 * Capabilities are transport-agnostic. The store + audit + idempotency
 * dependencies are pluggable so the same service runs in dev
 * (in-memory), in tests, and in production (Postgres).
 */

import { createHash, randomUUID } from 'crypto';
import { parseSessionCode } from '@domio/session-code';
import type { SessionCode } from '@domio/audience-service';
import { AudienceSessionNotFoundError, type AudienceSnapshot } from './presenter-lookup.js';
import type {
  HeartbeatInput,
  JoinInput,
  JoinResult,
  LeaveInput,
  ListActiveInput,
  ListActiveResult,
  ParticipantSession,
  RateBucket,
} from './types.js';
import {
  ParticipantAlreadyJoinedError,
  ParticipantNotFoundError,
  ParticipantValidationError,
  validateJoinInput,
} from './types.js';
import { type ParticipantSessionStore, isStore, defaultRateBucket } from './store/store.js';
import { asStoreError } from './store/mem_store.js';
void asStoreError; // reserved for future optimistic-concurrency error mapping
import type { AudienceAuditEmitter, ParticipantAuditEvent } from './audit/emit.js';
import type { IdempotencyStore } from './idempotency/index.js';
import { NullIdempotencyStore } from './idempotency/index.js';
import { type ParticipantMetrics, nullParticipantMetrics } from './observability/metrics.js';

export interface ParticipantSessionServiceOptions {
  readonly store: ParticipantSessionStore;
  readonly audit: AudienceAuditEmitter;
  readonly idempotency?: IdempotencyStore | undefined;
  /** Resolver for the canonical AudienceSnapshot for a session code.
   *  Production wires this to the presenter-session service; the
   *  default throws `AudienceSessionNotFoundError`. */
  readonly presenterLookup?: PresenterLookup | undefined;
  readonly clock?: (() => number) | undefined;
  readonly idGenerator?: (() => string) | undefined;
  readonly idempotencyTtlMs?: number | undefined;
  readonly metrics?: ParticipantMetrics | undefined;
}

export type PresenterLookup = (input: {
  session_code: SessionCode;
  workspace_id: string;
}) => Promise<AudienceSnapshot>;

export interface ParticipantSessionServiceDeps {
  readonly store: ParticipantSessionStore;
  readonly audit: AudienceAuditEmitter;
  readonly presenterLookup?: PresenterLookup;
  readonly idempotency: IdempotencyStore;
  readonly metrics: ParticipantMetrics;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export class ParticipantSessionService {
  private readonly store: ParticipantSessionStore;
  private readonly audit: AudienceAuditEmitter;
  private readonly idempotency: IdempotencyStore;
  private readonly metrics: ParticipantMetrics;
  private readonly presenterLookup: PresenterLookup;
  private readonly clock: () => number;
  private readonly idGen: () => string;
  private readonly idempotencyTtlMs: number;

  constructor(opts: ParticipantSessionServiceOptions) {
    if (!isStore(opts.store)) {
      throw new Error('ParticipantSessionService: store is required');
    }
    if (!opts.audit) {
      throw new Error('ParticipantSessionService: audit emitter is required');
    }
    this.store = opts.store;
    this.audit = opts.audit;
    this.idempotency = opts.idempotency ?? new NullIdempotencyStore();
    this.metrics = opts.metrics ?? nullParticipantMetrics();
    this.presenterLookup = opts.presenterLookup ?? defaultPresenterLookup;
    this.clock = opts.clock ?? (() => Date.now());
    this.idGen = opts.idGenerator ?? (() => randomUUID());
    this.idempotencyTtlMs = opts.idempotencyTtlMs ?? DEFAULT_TTL_MS;
  }

  // -------------------------------------------------------------------------
  // Capability: participant:join
  // -------------------------------------------------------------------------
  async join(input: JoinInput): Promise<JoinResult> {
    const startedAt = this.clock();
    validateJoinInput(input);

    // Idempotency replay.
    if (input.idempotency_key) {
      const prior = await this.idempotency.get(
        input.idempotency_key,
        input.workspace_id,
        input.session_code,
      );
      if (prior && prior.response && (prior.response as ParticipantSession).id) {
        const bundle = await this.snapshotFor(input.session_code, input.workspace_id);
        this.metrics.joinMs.record(this.clock() - startedAt, {
          workspace_id: input.workspace_id,
          phase: 'replay',
        });
        return {
          session: prior.response as ParticipantSession,
          bundle,
          idempotent_replay: prior.response as ParticipantSession,
        };
      }
      const reservation = await this.idempotency.reserve({
        key: input.idempotency_key,
        workspace_id: input.workspace_id,
        session_id: input.session_code,
        recorded_at_ms: this.clock(),
        ttl_ms: this.idempotencyTtlMs,
      });
      if (
        reservation.exists &&
        reservation.prior &&
        reservation.prior.response &&
        (reservation.prior.response as ParticipantSession).id
      ) {
        const bundle = await this.snapshotFor(input.session_code, input.workspace_id);
        return {
          session: reservation.prior.response as ParticipantSession,
          bundle,
          idempotent_replay: reservation.prior.response as ParticipantSession,
        };
      }
    }

    const snapshot = await this.presenterLookup({
      session_code: input.session_code,
      workspace_id: input.workspace_id,
    });

    const parsed = parseSessionCode(input.session_code as unknown as string);
    const shard = parsed.shardIndex;

    // Reject duplicate joins — participants with the same participant_id
    // are routed to the same row.
    const existing = await this.store.getBySessionCodeAndParticipant(
      input.session_code as unknown as string,
      input.participant_id as unknown as string,
    );
    if (existing) {
      if (existing.state === 'left' || existing.state === 'reaped' || existing.state === 'kicked') {
        // Allow re-join: transition the row back to 'active' and bump version.
        const next: ParticipantSession = {
          ...existing,
          state: 'active',
          display_name: input.display_name,
          locale: input.locale,
          ...(input.fingerprint_hash !== undefined
            ? { fingerprint_hash: input.fingerprint_hash }
            : {}),
          version: existing.version + 1,
          joined_at: new Date(this.clock()).toISOString(),
          last_seen_at: new Date(this.clock()).toISOString(),
          left_at: null,
        };
        const updated = await this.store.transition({ expected_version: existing.version, next });
        await this.emit({
          actor_id: input.participant_id as unknown as string,
          session_id: snapshot.session_id,
          workspace_id: input.workspace_id,
          action: 'participant.join',
          ts: this.clock(),
          after: { session_id: updated.id, state: updated.state },
        });
        this.metrics.activeGaugeAdd(1, { workspace_id: input.workspace_id });
        this.metrics.joinMs.record(this.clock() - startedAt, {
          workspace_id: input.workspace_id,
          phase: 'rejoin',
        });
        return { session: updated, bundle: snapshot, idempotent_replay: null };
      }
      throw new ParticipantAlreadyJoinedError(existing.id);
    }

    const now = this.clock();
    const rateBucket: RateBucket = defaultRateBucket(now);
    const session: ParticipantSession = {
      id: this.idGen(),
      session_id: snapshot.session_id,
      session_code: input.session_code,
      workspace_id: input.workspace_id,
      participant_id: input.participant_id,
      state: 'active',
      display_name: input.display_name,
      locale: input.locale,
      fingerprint_hash: input.fingerprint_hash ?? null,
      shard_index: shard,
      version: 1,
      joined_at: new Date(now).toISOString(),
      last_seen_at: new Date(now).toISOString(),
      left_at: null,
      kick_count: 0,
      rate_bucket: rateBucket,
    };

    const created = await this.store.create({ session });
    await this.emit({
      actor_id: input.participant_id as unknown as string,
      session_id: created.session_id,
      workspace_id: created.workspace_id,
      action: 'participant.join',
      ts: this.clock(),
      after: {
        session_id: created.id,
        shard_index: created.shard_index,
        locale: created.locale,
      },
    });

    if (input.idempotency_key) {
      await this.idempotency.commit({
        key: input.idempotency_key,
        workspace_id: input.workspace_id,
        session_id: input.session_code as unknown as string,
        response: created,
        recorded_at_ms: this.clock(),
        ttl_ms: this.idempotencyTtlMs,
      });
    }

    this.metrics.activeGaugeAdd(1, { workspace_id: input.workspace_id });
    this.metrics.joinMs.record(this.clock() - startedAt, {
      workspace_id: input.workspace_id,
      phase: 'fresh',
    });

    return { session: created, bundle: snapshot, idempotent_replay: null };
  }

  // -------------------------------------------------------------------------
  // Capability: participant:heartbeat
  // -------------------------------------------------------------------------
  async heartbeat(input: HeartbeatInput): Promise<ParticipantSession> {
    const startedAt = this.clock();
    const row = await this.store.getById(input.session_id);
    if (!row) throw new ParticipantNotFoundError(input.session_id);
    if (row.participant_id !== input.participant_id) {
      throw new ParticipantValidationError('participant_id mismatch');
    }
    if (row.state === 'left' || row.state === 'reaped' || row.state === 'kicked') {
      throw new ParticipantAlreadyJoinedError(row.id);
    }
    const next: ParticipantSession = {
      ...row,
      state: 'active',
      version: row.version + 1,
      last_seen_at: new Date(this.clock()).toISOString(),
      rate_bucket: refillBucket(row.rate_bucket, this.clock()),
    };
    const updated = await this.store.transition({ expected_version: row.version, next });
    this.metrics.heartbeatMs.record(this.clock() - startedAt, { workspace_id: row.workspace_id });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Capability: participant:leave
  // -------------------------------------------------------------------------
  async leave(input: LeaveInput): Promise<ParticipantSession> {
    const startedAt = this.clock();
    const row = await this.store.getById(input.session_id);
    if (!row) throw new ParticipantNotFoundError(input.session_id);
    if (row.participant_id !== input.participant_id) {
      throw new ParticipantValidationError('participant_id mismatch');
    }
    if (row.state === 'left' || row.state === 'reaped' || row.state === 'kicked') {
      return row; // idempotent no-op
    }
    const next: ParticipantSession = {
      ...row,
      state: input.reason === 'moderator_kick' ? 'kicked' : 'left',
      version: row.version + 1,
      left_at: new Date(this.clock()).toISOString(),
      kick_count: input.reason === 'moderator_kick' ? row.kick_count + 1 : row.kick_count,
    };
    const updated = await this.store.transition({ expected_version: row.version, next });
    await this.emit({
      actor_id: input.participant_id as unknown as string,
      session_id: updated.session_id,
      workspace_id: updated.workspace_id,
      action: input.reason === 'moderator_kick' ? 'participant.kick' : 'participant.leave',
      ts: this.clock(),
      after: { reason: input.reason, session_id: updated.id },
    });
    this.metrics.activeGaugeAdd(-1, { workspace_id: row.workspace_id });
    this.metrics.leaveMs.record(this.clock() - startedAt, { workspace_id: row.workspace_id });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Capability: participant:list
  // -------------------------------------------------------------------------
  async listActive(input: ListActiveInput): Promise<ListActiveResult> {
    return this.store.listActive(input);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private async snapshotFor(code: SessionCode, workspace_id: string): Promise<AudienceSnapshot> {
    return this.presenterLookup({ session_code: code, workspace_id });
  }

  private async emit(event: ParticipantAuditEvent): Promise<void> {
    await this.audit.emit(event);
  }
}

function refillBucket(bucket: RateBucket, nowMs: number): RateBucket {
  const elapsedS = Math.max(0, (nowMs - bucket.last_refill_ms) / 1000);
  const refill = Math.floor(elapsedS * bucket.refill_per_s);
  if (refill <= 0) return bucket;
  const tokens = Math.min(bucket.capacity, bucket.tokens + refill);
  return { ...bucket, tokens, last_refill_ms: nowMs };
}

async function defaultPresenterLookup(): Promise<AudienceSnapshot> {
  throw new AudienceSessionNotFoundError('unknown');
}

/** Convenience helper for tests — hash a fingerprint the same way the
 *  service does in production. */
export function hashFingerprint(value: string): string {
  return createHash('sha256').update(`domio/audience/v1:${value}`).digest('hex');
}
