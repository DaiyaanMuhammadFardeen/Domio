/**
 * FillerWordCounter tests — Wave 6 §S6.7.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FillerWordCounter } from './FillerWordCounter';

describe('FillerWordCounter', () => {
  it('renders zero total when no fillers exist', () => {
    render(<FillerWordCounter counts={[]} elapsedMs={60_000} />);
    expect(screen.getByTestId('filler-counter-total').textContent).toBe('0');
    expect(screen.getByTestId('filler-counter-empty')).toBeInTheDocument();
  });

  it('renders per-phrase counts with a per-minute rate', () => {
    render(
      <FillerWordCounter
        counts={[
          { phrase: 'um', count: 6 },
          { phrase: 'uh', count: 2 },
          { phrase: 'like', count: 1 },
        ]}
        elapsedMs={60_000}
      />,
    );
    expect(screen.getByTestId('filler-counter-total').textContent).toBe('9');
    expect(screen.getByTestId('filler-counter-row-um')).toBeInTheDocument();
    expect(screen.getByTestId('filler-counter-row-uh').textContent).toContain('2');
    expect(screen.getByTestId('filler-counter-row-like').textContent).toContain('1');
  });

  it('sorts phrases by count descending', () => {
    render(
      <FillerWordCounter
        counts={[
          { phrase: 'like', count: 1 },
          { phrase: 'um', count: 5 },
          { phrase: 'uh', count: 3 },
        ]}
        elapsedMs={60_000}
      />,
    );
    const list = screen.getByTestId('filler-counter-list');
    const items = Array.from(list.querySelectorAll('li')).map((li) =>
      li.getAttribute('data-testid'),
    );
    expect(items).toEqual([
      'filler-counter-row-um',
      'filler-counter-row-uh',
      'filler-counter-row-like',
    ]);
  });

  it('flags High band when rate is above 5/min', () => {
    render(<FillerWordCounter counts={[{ phrase: 'um', count: 12 }]} elapsedMs={60_000} />);
    expect(screen.getByTestId('filler-counter-band').textContent).toBe('High');
  });
});
