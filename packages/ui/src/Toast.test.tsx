import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { ToastProvider, useToast } from './Toast.js';

function PushToast({ message }: { message: string }): React.ReactElement {
  const push = useToast();
  return (
    <button type="button" onClick={() => push({ message })}>
      push
    </button>
  );
}

describe('ToastProvider + useToast', () => {
  it('renders a pushed toast', () => {
    render(
      <ToastProvider>
        <PushToast message="Saved." />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /push/i }));
    expect(screen.getByText(/saved\./i)).toBeInTheDocument();
  });

  it('dismisses a toast via the X button', () => {
    render(
      <ToastProvider>
        <PushToast message="Delete me" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /push/i }));
    const dismissBtn = screen.getByRole('button', {
      name: /dismiss notification/i,
    });
    fireEvent.click(dismissBtn);
    expect(screen.queryByText(/delete me/i)).not.toBeInTheDocument();
  });

  it('auto-dismisses after duration', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <PushToast message="auto" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /push/i }));
    expect(screen.getByText(/auto/i)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText(/auto/i)).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
