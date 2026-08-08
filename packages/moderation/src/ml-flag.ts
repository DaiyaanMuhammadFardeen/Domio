/**
 * @domio/moderation — ML-flag stub.
 *
 * Phase 16 W5. Real implementations wire into `MlScorer.score(...)`.
 * The default `NullMlScorer` returns `{ score: 0, categories: [] }`
 * so callers can rely on the interface without an HTTP round-trip.
 *
 * Pluggable scorers (Detoxify, custom BERT) set the `MlScorer`
 * singleton via {@link setMlScorer}.
 */

export interface MlScore {
  /** Confidence in [0, 1]. Higher = more likely toxic. */
  readonly score: number;
  /** Optional category breakdown (e.g. ['hate', 'threat']). */
  readonly categories: ReadonlyArray<string>;
}

export interface MlScorer {
  score(input: string): Promise<MlScore>;
}

class NullMlScorer implements MlScorer {
  async score(_input: string): Promise<MlScore> {
    return { score: 0, categories: [] };
  }
}

let activeScorer: MlScorer = new NullMlScorer();

export function setMlScorer(scorer: MlScorer): void {
  activeScorer = scorer;
}

export function resetMlScorer(): void {
  activeScorer = new NullMlScorer();
}

export async function flagWithMl(
  input: string,
  threshold = 0.85,
): Promise<{ flagged: boolean; score: MlScore }> {
  const score = await activeScorer.score(input);
  return { flagged: score.score >= threshold, score };
}