/**
 * AutoReset hook tests — S5.8.
 *
 * The hook is React-only, so we mount it inside a small wrapper
 * component and capture the returned `lastActivity` + `reset` API to
 * drive the test forward through the fake timers.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useAutoReset } from './AutoReset';

interface HarnessApi {
  reset: () => void;
}

function Harness({
  timeoutMs,
  onIdle,
  onReady,
}: {
  timeoutMs: number;
  onIdle: () => void;
  onReady: (api: HarnessApi) => void;
}) {
  const { reset } = useAutoReset(timeoutMs, onIdle);
  onReady({ reset });
  return null;
}

describe('useAutoReset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onIdle after timeoutMs with no activity', () => {
    const onIdle = vi.fn();
    render(<Harness timeoutMs={1000} onIdle={onIdle} onReady={() => {}} />);
    expect(onIdle).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('does not fire onIdle when pointer activity resets the timer', () => {
    const onIdle = vi.fn();
    render(<Harness timeoutMs={1000} onIdle={onIdle} onReady={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
      vi.advanceTimersByTime(500);
    });
    expect(onIdle).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('reset() extends the timer from the moment it is called', () => {
    const onIdle = vi.fn();
    let api: HarnessApi | null = null;
    render(
      <Harness
        timeoutMs={1000}
        onIdle={onIdle}
        onReady={(a) => {
          api = a;
        }}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(900);
    });
    act(() => {
      api?.reset();
      vi.advanceTimersByTime(900);
    });
    expect(onIdle).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});