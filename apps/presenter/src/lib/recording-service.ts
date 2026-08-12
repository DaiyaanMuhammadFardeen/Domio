/**
 * Recording service — captures a live session for replay.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns a placeholder recording descriptor. The recording-svc
 * client will replace this in a later wave.
 */

export interface RecordingDescriptor {
  readonly id: string;
  readonly sessionId: string;
  readonly status: 'idle' | 'recording' | 'paused' | 'finalized';
  readonly startedAtMs: number;
  readonly durationMs: number;
}

export const BOOTSTRAP_RECORDINGS: ReadonlyArray<RecordingDescriptor> = [];

export async function listRecordings(
  _sessionId: string,
): Promise<ReadonlyArray<RecordingDescriptor>> {
  return BOOTSTRAP_RECORDINGS;
}