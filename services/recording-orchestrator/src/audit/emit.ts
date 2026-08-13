/**
 * @domio/recording-orchestrator — audit emission.
 *
 * Records every mutation into the hash-chained audit log via
 * @domio/audit-ts. Each event is keyed on (workspace_id,
 * recording_session_id, sequence) and includes the relevant
 * before/after snapshot.
 */

import type { JsonObject } from '@domio/audit-ts';
import { computeEventHash } from '@domio/audit-ts';

export interface AuditEmitter {
  emit(event: RecordingAuditEvent): Promise<void>;
}

export interface RecordingAuditEvent {
  readonly workspace_id: string;
  readonly recording_session_id: string;
  readonly sequence: number;
  readonly kind: RecordingAuditKind;
  readonly payload: JsonObject;
  readonly occurred_at_ms: number;
  readonly hash?: string;
  readonly prev_hash?: string;
}

export type RecordingAuditKind =
  | 'recording.started'
  | 'recording.paused'
  | 'recording.resumed'
  | 'recording.stopped'
  | 'recording.finalizing'
  | 'recording.ready'
  | 'recording.failed'
  | 'recording.expired'
  | 'recording.revoked'
  | 'recording.chunk_committed'
  | 'recording.chunk_released'
  | 'recording.track_upserted';

/** Re-export the hash helper for callers that want to verify the chain. */
export const hashRecordingEvent = (
  keyHex: string,
  payload: JsonObject,
  seq: number,
  prevHash: string,
): Promise<string> => computeEventHash(keyHex, payload, seq, prevHash);
