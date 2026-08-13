/**
 * TriviaRunner tests — S5.7.
 */

import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TriviaRunner } from './TriviaRunner';
import type { TriviaRound } from '../runtime/widgets/trivia-types';

const ROUNDS: ReadonlyArray<TriviaRound> = [
  {
    id: 'r1',
    question: 'What is 2+2?',
    options: ['3', '4', '5', '6'],
    correct_index: 1,
    time_ms: 20_000,
    is_bonus: false,
  },
  {
    id: 'r2',
    question: 'Capital of France?',
    options: ['Berlin', 'Paris', 'Rome'],
    correct_index: 1,
    time_ms: 15_000,
    is_bonus: true,
  },
];

describe('TriviaRunner', () => {
  it('renders the current round and shows 1.5x multiplier when streak >= 3', () => {
    render(
      <TriviaRunner
        rounds={ROUNDS}
        currentRoundIndex={0}
        timeRemainingMs={10_000}
        score={42}
        streak={3}
        onSubmitAnswer={() => undefined}
      />,
    );

    expect(screen.getByTestId('trivia-runner')).toBeInTheDocument();
    expect(screen.getByTestId('trivia-question').textContent).toBe('What is 2+2?');
    expect(screen.getByTestId('trivia-score').textContent).toBe('42');
    expect(screen.getByTestId('trivia-streak')).toHaveAttribute('data-multiplier', '1.5');
    expect(screen.getByTestId('trivia-multiplier').textContent).toBe('1.5×');
  });

  it('shows the bonus badge on bonus rounds', () => {
    render(
      <TriviaRunner
        rounds={ROUNDS}
        currentRoundIndex={1}
        timeRemainingMs={5_000}
        score={0}
        streak={0}
        onSubmitAnswer={() => undefined}
      />,
    );
    expect(screen.getByTestId('trivia-bonus-badge')).toBeInTheDocument();
    expect(screen.getByTestId('trivia-question').textContent).toBe('Capital of France?');
  });

  it('calls onSubmitAnswer when an option is clicked', () => {
    const onSubmit = vi.fn();
    render(
      <TriviaRunner
        rounds={ROUNDS}
        currentRoundIndex={0}
        timeRemainingMs={10_000}
        score={0}
        streak={0}
        onSubmitAnswer={onSubmit}
      />,
    );

    fireEvent.click(screen.getByTestId('trivia-option-B'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ roundId: 'r1', optionIndex: 1 });
  });

  it('does not show the multiplier when streak < 3', () => {
    render(
      <TriviaRunner
        rounds={ROUNDS}
        currentRoundIndex={0}
        timeRemainingMs={10_000}
        score={0}
        streak={2}
        onSubmitAnswer={() => undefined}
      />,
    );

    expect(screen.getByTestId('trivia-streak')).toHaveAttribute('data-multiplier', '1');
    expect(screen.queryByTestId('trivia-multiplier')).toBeNull();
  });

  it('decrements the displayed time when the timeRemainingMs prop advances', () => {
    const { rerender } = render(
      <TriviaRunner
        rounds={ROUNDS}
        currentRoundIndex={0}
        timeRemainingMs={10_000}
        score={0}
        streak={0}
        onSubmitAnswer={() => undefined}
      />,
    );
    expect(screen.getByTestId('trivia-timer').textContent).toBe('10s');
    expect(screen.getByTestId('trivia-timer')).toHaveAttribute('data-time-ms', '10000');

    act(() => {
      rerender(
        <TriviaRunner
          rounds={ROUNDS}
          currentRoundIndex={0}
          timeRemainingMs={7_500}
          score={0}
          streak={0}
          onSubmitAnswer={() => undefined}
        />,
      );
    });
    expect(screen.getByTestId('trivia-timer').textContent).toBe('8s');
    expect(screen.getByTestId('trivia-timer')).toHaveAttribute('data-time-ms', '7500');

    act(() => {
      rerender(
        <TriviaRunner
          rounds={ROUNDS}
          currentRoundIndex={0}
          timeRemainingMs={0}
          score={0}
          streak={0}
          onSubmitAnswer={() => undefined}
        />,
      );
    });
    expect(screen.getByTestId('trivia-timer').textContent).toBe('0s');
  });

  it('calls onUsePowerUp when the power-up button is clicked', () => {
    const onPowerUp = vi.fn();
    render(
      <TriviaRunner
        rounds={ROUNDS}
        currentRoundIndex={0}
        timeRemainingMs={10_000}
        score={0}
        streak={0}
        onSubmitAnswer={() => undefined}
        onUsePowerUp={onPowerUp}
      />,
    );
    fireEvent.click(screen.getByTestId('trivia-power-up'));
    expect(onPowerUp).toHaveBeenCalledTimes(1);
  });
});
