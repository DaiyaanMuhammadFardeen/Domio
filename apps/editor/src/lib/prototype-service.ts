/**
 * Prototype service — runs a slide in the interactive prototype player.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns a placeholder prototype session descriptor. The
 * prototype-runtime client will replace this in a later wave.
 */

export interface PrototypeRun {
  readonly id: string;
  readonly deckId: string;
  readonly url: string;
  readonly startedAtMs: number;
}

export const BOOTSTRAP_PROTOTYPE_RUNS: ReadonlyArray<PrototypeRun> = [];

export async function startPrototypeRun(deckId: string): Promise<PrototypeRun> {
  return {
    id: `proto-${deckId}-${Date.now()}`,
    deckId,
    url: `https://prototype.domio.test/p/${deckId}`,
    startedAtMs: Date.now(),
  };
}

export async function listPrototypeRuns(_deckId: string): Promise<ReadonlyArray<PrototypeRun>> {
  return BOOTSTRAP_PROTOTYPE_RUNS;
}