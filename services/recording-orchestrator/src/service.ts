/**
 * @domio/recording-orchestrator — service.
 *
 * Transport-agnostic orchestration of a recording session. Owns the
 * state machine, idempotent transitions, lease-based chunk commits,
 * hash-chained audit, and Prometheus metrics.
 *
 * Pattern: mirror of services/presenter-session/src/service.ts.
 */

import { randomUUID } from 'node:crypto';
import type { TrackKind } from '@domio/object-store';
import type {
  CommitChunkInput,
  FinalizeInput,
  RecordingSession,
  StartRecordingInput,
  TransitionInput,
  RecordingStatus,
} from './types.js';
import {
  RecordingConflictError,
  RecordingInvalidTransitionError,
  RecordingNotFoundError,
  validateCommitChunkInput,
  validateStartInput,
} from './types.js';
import type { RecordingStore } from './store/store.js';
import type { AuditEmitter, RecordingAuditEvent } from './audit/emit.js';
import type { IdempotencyStore } from './idempotency/index.js';
import { NullIdempotencyStore } from './idempotency/index.js';
import type { MetricsEmitter } from './observability/metrics.js';
import {
  METRIC_CHUNK_COMMITTED,
  METRIC_CHUNK_CONFLICT,
  METRIC_FAILED,
  METRIC_FINALIZED,
  METRIC_PAUSED,
  METRIC_RESUMED,
  METRIC_STARTED,
  METRIC_STOPPED,
  NoopMetricsEmitter,
} from './observability/metrics.js';

export interface RecordingOrchestratorOptions {
  readonly store: RecordingStore;
  readonly audit: AuditEmitter;
  readonly idempotency?: IdempotencyStore;
  readonly metrics?: MetricsEmitter;
  readonly now?: () => Date;
}

const VALID_TRANSITIONS: Readonly<Record<RecordingStatus, readonly RecordingStatus[]>> = {
  pending: ['recording', 'failed'],
  recording: ['paused', 'stopping', 'finalizing', 'failed'],
  paused: ['recording', 'failed'],
  stopping: ['finalizing', 'failed'],
  finalizing: ['ready', 'failed'],
  ready: ['expired', 'revoked'],
  failed: [],
  expired: [],
  revoked: [],
};

// Allowed forward transitions for typed transition calls.
const ALLOWED_PAUSE: readonly RecordingStatus[] = ['recording'];
const ALLOWED_RESUME: readonly RecordingStatus[] = ['paused'];
const ALLOWED_STOP: readonly RecordingStatus[] = ['recording', 'paused'];
const ALLOWED_FINALIZE: readonly RecordingStatus[] = ['finalizing', 'stopping', 'recording'];

export class RecordingOrchestrator {
  private readonly store: RecordingStore;
  private readonly audit: AuditEmitter;
  private readonly idempotency: IdempotencyStore;
  private readonly metrics: MetricsEmitter;
  private readonly now: () => Date;

  constructor(opts: RecordingOrchestratorOptions) {
    this.store = opts.store;
    this.audit = opts.audit;
    this.idempotency = opts.idempotency ?? new NullIdempotencyStore();
    this.metrics = opts.metrics ?? new NoopMetricsEmitter();
    this.now = opts.now ?? (() => new Date());
  }

  async start(input: StartRecordingInput): Promise<RecordingSession> {
    validateStartInput(input);
    const id = randomUUID();
    const now = this.now();
    const session: RecordingSession = {
      id,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      presenter_user_id: input.presenter_user_id,
      status: 'pending',
      started_at: now.toISOString(),
      paused_at: null,
      stopped_at: null,
      finalized_at: null,
      expires_at: input.expires_at ?? null,
      storage_prefix: input.storage_prefix,
      title: input.title ?? null,
      description: input.description ?? null,
      language: input.language ?? 'en',
      error: null,
      version: 1,
    };
    await this.store.insertSession(session);
    await this.transitionStatusInternal(session.id, session.version, 'recording', {
      kind: 'recording.started',
    });
    this.metrics.inc(METRIC_STARTED, { workspace_id: input.workspace_id });
    const after = await this.store.get(session.id);
    if (!after) throw new RecordingNotFoundError(session.id);
    return after;
  }

  async pause(input: TransitionInput): Promise<RecordingSession> {
    return this.applyTransition(
      input,
      'paused',
      { kind: 'recording.paused' },
      ALLOWED_PAUSE,
      METRIC_PAUSED,
      {
        paused_at: this.now().toISOString(),
      },
    );
  }

  async resume(input: TransitionInput): Promise<RecordingSession> {
    return this.applyTransition(
      input,
      'recording',
      { kind: 'recording.resumed' },
      ALLOWED_RESUME,
      METRIC_RESUMED,
    );
  }

  async stop(input: TransitionInput): Promise<RecordingSession> {
    return this.applyTransition(
      input,
      'finalizing',
      { kind: 'recording.stopped' },
      ALLOWED_STOP,
      METRIC_STOPPED,
      {
        stopped_at: this.now().toISOString(),
      },
    );
  }

  async finalize(input: FinalizeInput): Promise<RecordingSession> {
    return this.applyTransition(
      input,
      'ready',
      { kind: 'recording.ready' },
      ALLOWED_FINALIZE,
      METRIC_FINALIZED,
      {
        finalized_at: this.now().toISOString(),
      },
    );
  }

  async fail(input: TransitionInput & { reason: string }): Promise<RecordingSession> {
    return this.applyTransition(
      input,
      'failed',
      { kind: 'recording.failed' },
      ['recording', 'paused', 'finalizing', 'pending'],
      METRIC_FAILED,
      {
        error: input.reason,
      },
    );
  }

  async commitChunk(
    input: CommitChunkInput,
  ): Promise<{
    workspace_id: string;
    recording_session_id: string;
    track_kind: TrackKind;
    sequence: number;
  }> {
    validateCommitChunkInput(input);
    const session = await this.store.get(input.recording_session_id);
    if (!session) throw new RecordingNotFoundError(input.recording_session_id);
    if (session.workspace_id !== input.workspace_id) {
      throw new RecordingNotFoundError(input.recording_session_id);
    }
    if (session.status !== 'recording' && session.status !== 'paused') {
      throw new RecordingInvalidTransitionError(session.status, 'recording');
    }
    const idemKey =
      input.idempotency_key ??
      `commit:${input.recording_session_id}:${input.track_kind}:${input.sequence}`;
    const claimed = await this.idempotency.claim(idemKey, 3600);
    if (!claimed) {
      // Already-committed sequence is a no-op (returns the existing key).
      return {
        workspace_id: input.workspace_id,
        recording_session_id: input.recording_session_id,
        track_kind: input.track_kind,
        sequence: input.sequence,
      };
    }
    try {
      await this.store.commitChunk({
        workspace_id: input.workspace_id,
        recording_session_id: input.recording_session_id,
        track_kind: input.track_kind,
        sequence: input.sequence,
        byte_size: input.byte_size,
        duration_ms: input.duration_ms,
        sha256: input.sha256,
        storage_key: input.storage_key,
        lease_id: input.lease_id,
        lease_expires_at: input.lease_expires_at,
        committed_at: this.now().toISOString(),
      });
      await this.emit(input.workspace_id, input.recording_session_id, 'recording.chunk_committed', {
        track_kind: input.track_kind,
        sequence: input.sequence,
        byte_size: input.byte_size,
        sha256: input.sha256,
      });
      this.metrics.inc(METRIC_CHUNK_COMMITTED, {
        workspace_id: input.workspace_id,
        track_kind: input.track_kind,
      });
    } catch (err) {
      this.metrics.inc(METRIC_CHUNK_CONFLICT, {
        workspace_id: input.workspace_id,
        track_kind: input.track_kind,
      });
      throw err;
    }
    return {
      workspace_id: input.workspace_id,
      recording_session_id: input.recording_session_id,
      track_kind: input.track_kind,
      sequence: input.sequence,
    };
  }

  async get(workspace_id: string, recording_session_id: string): Promise<RecordingSession> {
    const session = await this.store.get(recording_session_id);
    if (!session || session.workspace_id !== workspace_id) {
      throw new RecordingNotFoundError(recording_session_id);
    }
    return session;
  }

  async listChunks(
    workspace_id: string,
    recording_session_id: string,
  ): Promise<readonly { track_kind: TrackKind; sequence: number; byte_size: number }[]> {
    await this.get(workspace_id, recording_session_id);
    const chunks = await this.store.listChunks(recording_session_id);
    return chunks.map((c) => ({
      track_kind: c.track_kind,
      sequence: c.sequence,
      byte_size: c.byte_size,
    }));
  }

  // --- Internal ----------------------------------------------------------

  private async applyTransition(
    input: TransitionInput,
    next: RecordingStatus,
    auditMeta: { kind: string },
    allowedFrom: readonly RecordingStatus[],
    metricName: string,
    extras: { paused_at?: string; stopped_at?: string; finalized_at?: string; error?: string } = {},
  ): Promise<RecordingSession> {
    const idemKey =
      input.idempotency_key ??
      `transition:${input.recording_session_id}:${next}:${input.expected_version}`;
    const claimed = await this.idempotency.claim(idemKey, 3600);
    if (!claimed) {
      const cur = await this.store.get(input.recording_session_id);
      if (!cur || cur.workspace_id !== input.workspace_id) {
        throw new RecordingNotFoundError(input.recording_session_id);
      }
      return cur;
    }
    const session = await this.store.get(input.recording_session_id);
    if (!session || session.workspace_id !== input.workspace_id) {
      throw new RecordingNotFoundError(input.recording_session_id);
    }
    // Optimistic concurrency: surface version mismatch even when the
    // (current status, next) pair is otherwise legal.
    if (session.version !== input.expected_version) {
      throw new RecordingConflictError(session.id, input.expected_version, session.version);
    }
    if (!allowedFrom.includes(session.status)) {
      throw new RecordingInvalidTransitionError(session.status, next);
    }
    const updated = await this.transitionStatusInternal(
      input.recording_session_id,
      input.expected_version,
      next,
      auditMeta,
      extras,
    );
    this.metrics.inc(metricName, { workspace_id: input.workspace_id });
    return updated;
  }

  private async transitionStatusInternal(
    id: string,
    expected_version: number,
    next: RecordingStatus,
    auditMeta: { kind: string },
    extras: { paused_at?: string; stopped_at?: string; finalized_at?: string; error?: string } = {},
  ): Promise<RecordingSession> {
    const current = await this.store.get(id);
    if (!current) throw new RecordingNotFoundError(id);
    if (!VALID_TRANSITIONS[current.status].includes(next)) {
      throw new RecordingInvalidTransitionError(current.status, next);
    }
    const updated = await this.store.transitionStatus({
      id,
      expected_version,
      next_status: next,
      now_iso: this.now().toISOString(),
      ...(extras.paused_at !== undefined ? { paused_at: extras.paused_at } : {}),
      ...(extras.stopped_at !== undefined ? { stopped_at: extras.stopped_at } : {}),
      ...(extras.finalized_at !== undefined ? { finalized_at: extras.finalized_at } : {}),
      ...(extras.error !== undefined ? { error: extras.error } : {}),
    });
    await this.emit(
      updated.workspace_id,
      updated.id,
      auditMeta.kind as RecordingAuditEvent['kind'],
      {
        from: current.status,
        to: next,
        version: updated.version,
      },
    );
    return updated;
  }

  private async emit(
    workspace_id: string,
    recording_session_id: string,
    kind: RecordingAuditEvent['kind'],
    payload: RecordingAuditEvent['payload'],
  ): Promise<void> {
    await this.audit.emit({
      workspace_id,
      recording_session_id,
      sequence: Date.now(),
      kind,
      payload,
      occurred_at_ms: Date.now(),
    });
  }
}

export {
  RecordingConflictError,
  RecordingInvalidTransitionError,
  RecordingNotFoundError,
} from './types.js';
