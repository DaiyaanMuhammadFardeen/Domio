/**
 * WordRace tests — S5.11.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WordRace } from './WordRace';
import type { WordRaceSubmission } from './WordRace';

const SUBS: ReadonlyArray<WordRaceSubmission> = [
  { participantId: 'p1', word: 'alpha', ts: 100 },
  { participantId: 'p2', word: 'beta', ts: 200 },
  { participantId: 'p3', word: 'gamma', ts: 300 },
];

describe('WordRace', () => {
  it('marks the first winnerSlots submissions as winners with a checkmark', () => {
    render(
      <WordRace prompt="Words" winnerSlots={2} submissions={SUBS} onSubmit={() => undefined} />,
    );

    const winners = screen.getAllByTestId('word-race-winner-row');
    const runners = screen.getAllByTestId('word-race-runner-row');

    expect(winners).toHaveLength(2);
    expect(runners).toHaveLength(1);

    // First two by ts are winners: p1 then p2.
    expect(winners[0]!.textContent).toContain('alpha');
    expect(winners[0]!.dataset['rank']).toBe('1');
    expect(winners[1]!.textContent).toContain('beta');
    expect(winners[1]!.dataset['rank']).toBe('2');

    // Each winner has a checkmark.
    const checks = screen.getAllByTestId('word-race-winner-check');
    expect(checks.length).toBe(2);

    // Runner-up word.
    expect(runners[0]!.textContent).toContain('gamma');
    expect(runners[0]!.dataset['rank']).toBe('3');
  });

  it('calls onSubmit with the submitted word', () => {
    const onSubmit = vi.fn();
    render(<WordRace prompt="Words" winnerSlots={2} submissions={[]} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId('word-race-input'), { target: { value: 'go' } });
    fireEvent.click(screen.getByTestId('word-race-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('go');
  });

  it('does not submit when the word is empty', () => {
    const onSubmit = vi.fn();
    render(<WordRace prompt="Words" winnerSlots={2} submissions={[]} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('word-race-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the empty state when there are no submissions', () => {
    render(<WordRace prompt="Words" winnerSlots={2} submissions={[]} onSubmit={() => undefined} />);
    expect(screen.getByTestId('word-race-empty')).toBeInTheDocument();
  });

  it('orders winners by ts ascending', () => {
    const unsorted: ReadonlyArray<WordRaceSubmission> = [
      { participantId: 'p1', word: 'z', ts: 300 },
      { participantId: 'p2', word: 'a', ts: 100 },
      { participantId: 'p3', word: 'm', ts: 200 },
    ];
    render(
      <WordRace prompt="Words" winnerSlots={2} submissions={unsorted} onSubmit={() => undefined} />,
    );
    const winners = screen.getAllByTestId('word-race-winner-row');
    expect(winners[0]!.textContent).toContain('a');
    expect(winners[1]!.textContent).toContain('m');
  });
});
