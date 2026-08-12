/**
 * Scenario service — defines parameterized deck scenarios.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns an empty list. The scenario-svc client will replace
 * this in a later wave.
 */

export interface ScenarioDescriptor {
  readonly id: string;
  readonly name: string;
  readonly deckId: string;
  readonly params: Readonly<Record<string, string>>;
}

export const BOOTSTRAP_SCENARIOS: ReadonlyArray<ScenarioDescriptor> = [];

export async function listScenarios(_deckId: string): Promise<ReadonlyArray<ScenarioDescriptor>> {
  return BOOTSTRAP_SCENARIOS;
}