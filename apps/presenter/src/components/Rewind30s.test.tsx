/**
 * Rewind30s tests — S4.13.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Rewind30s } from './Rewind30s';

describe('Rewind30s', () => {
  it('renders the rewind button with default 30s label', () => {
    render(<Rewind30s onRewind={() => {}} />);
    const btn = screen.getByTestId('rewind-30s');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/Rewind 30s/);
    expect(btn).toHaveAttribute('data-lookback-ms', '30000');
  });

  it('fires onRewind with the configured lookback on click', () => {
    const onRewind = vi.fn();
    render(<Rewind30s lookbackMs={10_000} onRewind={onRewind} />);
    fireEvent.click(screen.getByTestId('rewind-30s'));
    expect(onRewind).toHaveBeenCalledWith(10_000);
  });

  it('registers a Cmd/Ctrl+[ keydown that triggers rewind', () => {
    const onRewind = vi.fn();
    render(<Rewind30s onRewind={onRewind} />);
    fireEvent.keyDown(window, { key: '[', ctrlKey: true });
    expect(onRewind).toHaveBeenCalledWith(30_000);
  });
});
