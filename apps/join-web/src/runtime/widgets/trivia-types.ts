/**
 * @domio/join-web — Trivia widget types.
 *
 * S5.7 surfaces. A `TriviaRound` is one quiz question; `TriviaScore`
 * is the rolling score state for a single participant. The 1.5×
 * multiplier is awarded whenever the participant has answered at
 * least three questions in a row correctly — see TriviaRunner.
 */

export interface TriviaRound {
  readonly id: string;
  readonly question: string;
  /** Ordered options shown to the participant; correct_index points at the winner. */
  readonly options: ReadonlyArray<string>;
  readonly correct_index: number;
  /** Per-round time budget in milliseconds. */
  readonly time_ms: number;
  /** Bonus rounds are worth extra points; the renderer surfaces a "Bonus" badge. */
  readonly is_bonus: boolean;
}

export interface TriviaScore {
  /** Per-round points awarded. */
  readonly roundScores: ReadonlyArray<number>;
  /** Number of consecutive correct answers (resets on wrong answer). */
  readonly streak: number;
  /** Multiplier applied to a correct answer: 1 when streak < 3, 1.5 when ≥ 3. */
  readonly multiplier: number;
  /** Convenience: roundScores multiplied and summed. */
  readonly total: number;
}

/** Compute the multiplier implied by a streak. Pure, exported for tests. */
export function multiplierForStreak(streak: number): number {
  return streak >= 3 ? 1.5 : 1;
}

/** Sum round scores applying the active multiplier (the same multiplier for the round earned). */
export function computeTotal(roundScores: ReadonlyArray<number>, multiplier: number): number {
  let total = 0;
  for (const s of roundScores) {
    total += s * multiplier;
  }
  return total;
}

/** Compute the score for a single answered round. */
export function scoreRound(opts: {
  readonly correct: boolean;
  readonly timeRemainingMs: number;
  readonly roundMs: number;
  readonly isBonus: boolean;
  readonly multiplier: number;
}): number {
  if (!opts.correct) return 0;
  // Base 100 + up to 100 speed bonus, doubled if it's a bonus round.
  const ratio = Math.max(0, Math.min(1, opts.timeRemainingMs / Math.max(1, opts.roundMs)));
  const speed = Math.round(100 * ratio);
  const base = 100 + speed;
  return Math.round(base * opts.multiplier * (opts.isBonus ? 2 : 1));
}

export interface Team {
  readonly id: string;
  readonly name: string;
  readonly color: string; // Tailwind-safe token e.g. "blue", "emerald"
}

export interface TeamLeaderboardEntry {
  readonly teamId: string;
  readonly score: number;
}
