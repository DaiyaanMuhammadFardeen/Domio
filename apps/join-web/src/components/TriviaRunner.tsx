/**
 * TriviaRunner — multi-round quiz UI for join-web (S5.7).
 *
 * Pure presentation: the parent owns the score / streak state and
 * feeds them back in via props. Submissions flow out through
 * `onSubmitAnswer`; the parent is responsible for advancing rounds
 * and updating the score / streak.
 */

'use client';

import type { TriviaRound } from '../runtime/widgets/trivia-types';

export interface TriviaRunnerProps {
  readonly rounds: ReadonlyArray<TriviaRound>;
  readonly currentRoundIndex: number;
  readonly timeRemainingMs: number;
  readonly score: number;
  readonly streak: number;
  readonly onSubmitAnswer: (answer: {
    readonly roundId: string;
    readonly optionIndex: number;
  }) => void;
  readonly onUsePowerUp?: (() => void) | undefined;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export function TriviaRunner(props: TriviaRunnerProps) {
  const round = props.rounds[props.currentRoundIndex];
  const hasMultiplier = props.streak >= 3;
  const multiplier = hasMultiplier ? 1.5 : 1;
  const totalRounds = props.rounds.length;

  if (!round) {
    return (
      <section
        className="bg-white rounded-lg shadow p-4"
        data-testid="trivia-runner-empty"
        aria-live="polite"
      >
        <p className="text-sm text-slate-600">No active round.</p>
      </section>
    );
  }

  const seconds = Math.max(0, Math.ceil(props.timeRemainingMs / 1000));

  return (
    <section
      className="bg-white rounded-lg shadow p-4 flex flex-col gap-4"
      data-testid="trivia-runner"
      aria-label={`Round ${props.currentRoundIndex + 1} of ${totalRounds}`}
    >
      <header className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          Round {props.currentRoundIndex + 1} / {totalRounds}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ' +
              (hasMultiplier ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700')
            }
            data-testid="trivia-streak"
            data-multiplier={multiplier}
          >
            Streak {props.streak}
            {hasMultiplier ? (
              <span className="ml-1" data-testid="trivia-multiplier">
                {multiplier}×
              </span>
            ) : null}
          </span>
          <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-semibold">
            <span data-testid="trivia-score">{props.score}</span> pts
          </span>
        </div>
      </header>

      {round.is_bonus ? (
        <div
          className="self-start inline-flex items-center rounded-md bg-purple-100 text-purple-800 px-2 py-1 text-xs font-bold uppercase tracking-wide"
          data-testid="trivia-bonus-badge"
        >
          Bonus · 2×
        </div>
      ) : null}

      <h2 className="text-lg font-semibold text-slate-900" data-testid="trivia-question">
        {round.question}
      </h2>

      <div
        className="text-2xl font-mono tabular-nums"
        data-testid="trivia-timer"
        data-time-ms={props.timeRemainingMs}
        aria-live="off"
      >
        {seconds}s
      </div>

      <ul className="grid grid-cols-2 gap-2" data-testid="trivia-options">
        {round.options.map((opt, idx) => (
          <li key={`${round.id}-${idx}`}>
            <button
              type="button"
              className="w-full text-left p-3 rounded border border-slate-200 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={() => props.onSubmitAnswer({ roundId: round.id, optionIndex: idx })}
              data-testid={`trivia-option-${LETTERS[idx] ?? idx}`}
            >
              <span className="font-semibold mr-2 text-slate-500">
                {LETTERS[idx] ?? String(idx + 1)}.
              </span>
              {opt}
            </button>
          </li>
        ))}
      </ul>

      {props.onUsePowerUp ? (
        <button
          type="button"
          onClick={props.onUsePowerUp}
          className="self-end text-sm font-semibold text-amber-700 hover:text-amber-900 disabled:opacity-50"
          data-testid="trivia-power-up"
        >
          Use power-up
        </button>
      ) : null}
    </section>
  );
}
