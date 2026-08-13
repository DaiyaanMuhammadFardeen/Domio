/**
 * Whisper service — sends private notes from the audience to the
 * presenter without showing up publicly.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns an empty whisper list. The whisper-svc client will
 * replace this in a later wave.
 */

export interface WhisperMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly fromParticipantId: string;
  readonly body: string;
  readonly receivedAtMs: number;
  readonly read: boolean;
}

export const BOOTSTRAP_WHISPERS: ReadonlyArray<WhisperMessage> = [];

export async function listWhispers(_sessionId: string): Promise<ReadonlyArray<WhisperMessage>> {
  return BOOTSTRAP_WHISPERS;
}
