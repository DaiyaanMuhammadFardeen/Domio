/**
 * JoinForm tests — Wave 5 §S5.1.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { JoinForm } from './JoinForm';

describe('JoinForm', () => {
  it('renders a 6-digit code input, display name, and optional email', () => {
    render(<JoinForm onSubmit={vi.fn()} forceLocale={false} />);
    expect(screen.getByTestId('join-code')).toBeInTheDocument();
    expect(screen.getByTestId('join-display-name')).toBeInTheDocument();
    expect(screen.getByTestId('join-email')).toBeInTheDocument();
  });

  it('rejects a non-6-digit code and never calls onSubmit', () => {
    const onSubmit = vi.fn();
    render(<JoinForm onSubmit={onSubmit} forceLocale={false} />);
    fireEvent.change(screen.getByTestId('join-code'), { target: { value: 'ABCDEF' } });
    fireEvent.change(screen.getByTestId('join-display-name'), { target: { value: 'Pat' } });
    fireEvent.click(screen.getByTestId('join-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a 5-digit code and never calls onSubmit', () => {
    const onSubmit = vi.fn();
    render(<JoinForm onSubmit={onSubmit} forceLocale={false} />);
    fireEvent.change(screen.getByTestId('join-code'), { target: { value: '12345' } });
    fireEvent.change(screen.getByTestId('join-display-name'), { target: { value: 'Pat' } });
    fireEvent.click(screen.getByTestId('join-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the locale picker when ?locale=1 is in the query string', () => {
    // jsdom defaults to window.location.search === ''; patch it for this test.
    const originalSearch = window.location.search;
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?locale=1' },
      writable: true,
      configurable: true,
    });
    try {
      render(<JoinForm onSubmit={vi.fn()} forceLocale={false} />);
      expect(screen.getByTestId('join-locale')).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: originalSearch },
        writable: true,
        configurable: true,
      });
    }
  });

  it('calls onSubmit with a 6-digit code, name, and locale when the form is valid', () => {
    const onSubmit = vi.fn();
    render(<JoinForm onSubmit={onSubmit} forceLocale={true} initialLocale="es" />);
    fireEvent.change(screen.getByTestId('join-code'), { target: { value: '123456' } });
    fireEvent.change(screen.getByTestId('join-display-name'), { target: { value: 'Pat' } });
    fireEvent.click(screen.getByTestId('join-submit'));
    expect(onSubmit).toHaveBeenCalledWith(
      '123456',
      'Pat',
      expect.objectContaining({ locale: 'es' }),
    );
  });
});
