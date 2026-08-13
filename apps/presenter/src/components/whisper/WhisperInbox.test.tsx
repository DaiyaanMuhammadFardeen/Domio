/**
 * WhisperInbox tests — S4.2.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { WhisperInbox } from './WhisperInbox';
import { WhisperClient, type WhisperMessage } from '../../runtime/whisper/whisper-client';

function makeMsg(overrides: Partial<WhisperMessage> = {}): WhisperMessage {
  const ts = Date.now();
  return {
    id: `m-${Math.random()}`,
    session_id: 's1',
    author_id: 'a1',
    author_display_name: 'Alice',
    text: 'hello presenter',
    expires_at_ms: ts + 60_000,
    ts_ms: ts,
    ...overrides,
  };
}

describe('WhisperInbox', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when there are no whispers', () => {
    const client = new WhisperClient();
    render(<WhisperInbox client={client} />);
    expect(screen.queryByTestId('whisper-inbox')).toBeNull();
  });

  it('shows a toast when a whisper is published', () => {
    const client = new WhisperClient();
    render(<WhisperInbox client={client} />);

    act(() => {
      client.publish(makeMsg({ text: 'urgent question' }));
    });

    expect(screen.getByTestId('whisper-inbox')).toBeInTheDocument();
    expect(screen.getByTestId('whisper-inbox-toast')).toBeInTheDocument();
    expect(screen.getByText('urgent question')).toBeInTheDocument();
  });

  it('calls onWhisper for each new whisper', () => {
    const client = new WhisperClient();
    const spy = vi.fn();
    render(<WhisperInbox client={client} onWhisper={spy} />);

    act(() => {
      client.publish(makeMsg());
    });
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => {
      client.publish(makeMsg());
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('auto-dismisses toasts after the timeout', () => {
    const client = new WhisperClient();
    render(<WhisperInbox client={client} dismissAfterMs={1_000} />);

    act(() => {
      client.publish(makeMsg());
    });
    expect(screen.getByTestId('whisper-inbox')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(screen.queryByTestId('whisper-inbox')).toBeNull();
  });

  it('dismisses a toast when the X button is clicked', () => {
    const client = new WhisperClient();
    render(<WhisperInbox client={client} />);

    act(() => {
      client.publish(makeMsg());
      client.publish(makeMsg({ text: 'second' }));
    });
    expect(screen.getAllByTestId('whisper-inbox-toast')).toHaveLength(2);

    act(() => {
      screen.getAllByTestId('whisper-inbox-dismiss')[0]!.click();
    });
    expect(screen.getAllByTestId('whisper-inbox-toast')).toHaveLength(1);
  });
});
