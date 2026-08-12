/**
 * QuietMode tests — S4.14.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuietMode, QuietModeBadge } from './QuietMode';

describe('QuietMode', () => {
  it('renders a switch button with the off label by default', () => {
    render(<QuietMode quiet={false} />);
    const btn = screen.getByTestId('quiet-mode');
    expect(btn).toHaveAttribute('role', 'switch');
    expect(btn).toHaveAttribute('aria-checked', 'false');
    expect(btn).toHaveAttribute('data-quiet', 'false');
    expect(btn).toHaveTextContent(/Quiet mode/);
  });

  it('renders the on label when quiet=true', () => {
    render(<QuietMode quiet={true} />);
    expect(screen.getByTestId('quiet-mode')).toHaveTextContent(/Quiet/);
  });

  it('fires onChange with the negated value on click', () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuietMode quiet={false} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('quiet-mode'));
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<QuietMode quiet={true} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('quiet-mode'));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('QuietModeBadge', () => {
  it('renders nothing when quiet is false', () => {
    const { container } = render(<QuietModeBadge quiet={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the badge when quiet is true', () => {
    render(<QuietModeBadge quiet={true} />);
    const badge = screen.getByTestId('quiet-mode-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(/Quiet/);
  });
});
