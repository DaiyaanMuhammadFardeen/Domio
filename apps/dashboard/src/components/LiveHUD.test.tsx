/**
 * LiveHUD — tests.
 *
 * Verifies WS-driven metric updates + overlay toggle + status indicator.
 */

import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { LiveHUD } from './LiveHUD';
import type { LiveEvent, LiveSubscription } from '../lib/live-analytics-service';

interface MockState {
  events: Array<(event: LiveEvent) => void>;
  statuses: Array<(state: { status: 'connecting' | 'open' | 'closed' | 'error' }) => void>;
  closed: boolean;
}

function createMockSubscribe() {
  const state: MockState = { events: [], statuses: [], closed: false };
  const sub: LiveSubscription = {
    push(event) {
      for (const fn of state.events) fn(event);
    },
    setStatus(status) {
      for (const fn of state.statuses) fn({ status });
    },
    close() {
      state.closed = true;
    },
  };
  const subscribe = vi.fn(
    (listeners: {
      onEvent: (event: LiveEvent) => void;
      onStatus: (state: { status: 'connecting' | 'open' | 'closed' | 'error' }) => void;
    }): LiveSubscription => {
      state.events.push(listeners.onEvent);
      state.statuses.push(listeners.onStatus);
      // Fire the initial connecting status.
      listeners.onStatus({ status: 'connecting' });
      return sub;
    },
  );
  return { subscribe, state };
}

describe('LiveHUD', () => {
  it('renders with a connecting status on mount', () => {
    const { subscribe } = createMockSubscribe();
    render(<LiveHUD sessionId="session-1" subscribe={subscribe} />);
    expect(screen.getByTestId('live-hud')).toBeInTheDocument();
    expect(screen.getByTestId('live-status').textContent).toMatch(/connecting/);
  });

  it('updates metrics when an attendance event is pushed', () => {
    const { subscribe } = createMockSubscribe();
    render(<LiveHUD sessionId="session-1" subscribe={subscribe} />);

    act(() => {
      const onEvent = (subscribe.mock.calls[0]?.[0]?.onEvent ?? (() => {})) as (
        event: LiveEvent,
      ) => void;
      onEvent({
        type: 'attendance',
        data: {
          current: 240,
          peak: 300,
          joinedLast30s: 10,
          leftLast30s: 2,
        },
      });
    });

    expect(screen.getByTestId('live-attendance').textContent).toMatch(/240/);
  });

  it('updates the current slide when a slide event is pushed', () => {
    const { subscribe } = createMockSubscribe();
    render(<LiveHUD sessionId="session-1" subscribe={subscribe} />);

    act(() => {
      const onEvent = (subscribe.mock.calls[0]?.[0]?.onEvent ?? (() => {})) as (
        event: LiveEvent,
      ) => void;
      onEvent({
        type: 'slide',
        data: {
          slideId: 'slide-7',
          slideIndex: 6,
          totalSlides: 20,
          timeInSlideMs: 95_000,
          attentionScore: 0.81,
        },
      });
    });

    expect(screen.getByTestId('live-slide-view').textContent).toMatch(/Slide 7/);
    expect(screen.getByTestId('live-attention').textContent).toMatch(/81%/);
  });

  it('flips the overlay flag when the toggle is clicked', () => {
    const { subscribe } = createMockSubscribe();
    render(<LiveHUD sessionId="session-1" subscribe={subscribe} />);

    expect(screen.getByTestId('live-hud').getAttribute('data-overlay')).toBe('false');
    fireEvent.click(screen.getByTestId('live-overlay-toggle'));
    expect(screen.getByTestId('live-hud').getAttribute('data-overlay')).toBe('true');
  });

  it('shows the error banner when status flips to error', () => {
    const { subscribe } = createMockSubscribe();
    render(<LiveHUD sessionId="session-1" subscribe={subscribe} />);

    act(() => {
      const onStatus = (subscribe.mock.calls[0]?.[0]?.onStatus ?? (() => {})) as (state: {
        status: 'connecting' | 'open' | 'closed' | 'error';
      }) => void;
      onStatus({ status: 'error' });
    });

    expect(screen.getByTestId('live-error')).toBeInTheDocument();
  });

  it('closes the subscription on unmount', () => {
    const { subscribe, state } = createMockSubscribe();
    const { unmount } = render(<LiveHUD sessionId="session-1" subscribe={subscribe} />);
    unmount();
    expect(state.closed).toBe(true);
  });
});
