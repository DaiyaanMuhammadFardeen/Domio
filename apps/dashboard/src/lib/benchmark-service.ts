/**
 * Benchmark service — compares workspace decks to anonymized peers.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns an empty peer set. The benchmark-svc client will
 * replace this in a later wave.
 */

export interface BenchmarkRow {
  readonly metric: 'completionRate' | 'avgDwellMs' | 'bounceRate';
  readonly workspaceValue: number;
  readonly peerMedian: number;
  readonly peerP25: number;
  readonly peerP75: number;
}

export const BOOTSTRAP_BENCHMARKS: ReadonlyArray<BenchmarkRow> = [];

export async function listBenchmarks(_workspaceId: string): Promise<ReadonlyArray<BenchmarkRow>> {
  return BOOTSTRAP_BENCHMARKS;
}