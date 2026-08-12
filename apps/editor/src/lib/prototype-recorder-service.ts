/**
 * Prototype recorder service — captures a click-through recording.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns a placeholder recording descriptor. The recorder-svc
 * client will replace this in a later wave.
 */

export interface PrototypeRecording {
  readonly id: string;
  readonly deckId: string;
  readonly url: string;
  readonly durationMs: number;
  readonly createdAtMs: number;
}

export const BOOTSTRAP_PROTOTYPE_RECORDINGS: ReadonlyArray<PrototypeRecording> = [];

export async function listPrototypeRecordings(
  _deckId: string,
): Promise<ReadonlyArray<PrototypeRecording>> {
  return BOOTSTRAP_PROTOTYPE_RECORDINGS;
}