import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { ErrorBoundary, ErrorCard } from './ErrorBoundary.js';

function Boom(): never {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>ok</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('renders ErrorCard on thrown error', () => {
    // Suppress React's console.error noise from the expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/kaboom/i);
    spy.mockRestore();
  });

  it('Retry resets and re-renders children', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let shouldThrow = true;
    function MaybeBoom(): React.ReactElement {
      if (shouldThrow) throw new Error('again');
      return <div>recovered</div>;
    }
    render(
      <ErrorBoundary>
        <MaybeBoom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe('ErrorCard', () => {
  it('renders error message and a retry button when provided', () => {
    const onRetry = vi.fn();
    render(<ErrorCard error={new Error('something bad')} onRetry={onRetry} traceId="abc123" />);
    expect(screen.getByText(/something bad/i)).toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
