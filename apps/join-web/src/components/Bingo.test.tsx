/**
 * Bingo tests — S5.11.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Bingo } from './Bingo';

describe('Bingo', () => {
  it('marks a tile filled when a submitted word contains its letter pair', () => {
    render(<Bingo prompt="Animals" submittedWords={['cat']} onSubmitWord={() => undefined} />);

    const ca = screen.getByTestId('bingo-tile-CA');
    const ab = screen.getByTestId('bingo-tile-AB');
    expect(ca).toHaveAttribute('data-filled', 'true');
    expect(ab).toHaveAttribute('data-filled', 'false');
  });

  it('marks multiple tiles filled for longer words', () => {
    // Grid rows/cols are A-E only, so we pick a longer word whose
    // 2-letter substrings all land on valid pairs.
    // 'badger' contains 'ba' and 'ad' which are valid pairs.
    render(
      <Bingo
        prompt="Animals"
        submittedWords={['badger']}
        onSubmitWord={() => undefined}
      />,
    );

    expect(screen.getByTestId('bingo-tile-BA')).toHaveAttribute('data-filled', 'true');
    expect(screen.getByTestId('bingo-tile-AD')).toHaveAttribute('data-filled', 'true');
    expect(screen.getByTestId('bingo-tile-AB')).toHaveAttribute('data-filled', 'false');
  });

  it('calls onSubmitWord when the form is submitted with a non-empty word', () => {
    const onSubmit = vi.fn();
    render(<Bingo prompt="Animals" submittedWords={[]} onSubmitWord={onSubmit} />);

    fireEvent.change(screen.getByTestId('bingo-input'), { target: { value: 'dog' } });
    fireEvent.click(screen.getByTestId('bingo-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('dog');
  });

  it('does not submit when the word is empty', () => {
    const onSubmit = vi.fn();
    render(<Bingo prompt="Animals" submittedWords={[]} onSubmitWord={onSubmit} />);

    fireEvent.click(screen.getByTestId('bingo-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the prompt and the filled count', () => {
    render(<Bingo prompt="Animals" submittedWords={['cat']} onSubmitWord={() => undefined} />);

    expect(screen.getByTestId('bingo-prompt').textContent).toBe('Animals');
    expect(screen.getByTestId('bingo-filled-count').textContent).toBe('1 / 25');
  });
});