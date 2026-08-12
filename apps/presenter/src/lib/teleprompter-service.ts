/**
 * Teleprompter service — streams the presenter's notes on the local
 * display during a session.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns an empty script list. The teleprompter-svc client
 * will replace this in a later wave.
 */

export interface TeleprompterScript {
  readonly id: string;
  readonly sessionId: string;
  readonly slideId: string;
  readonly body: string;
  readonly updatedAtMs: number;
}

export const BOOTSTRAP_TELEPROMPTER: ReadonlyArray<TeleprompterScript> = [];

export async function listTeleprompterScripts(
  _sessionId: string,
): Promise<ReadonlyArray<TeleprompterScript>> {
  return BOOTSTRAP_TELEPROMPTER;
}