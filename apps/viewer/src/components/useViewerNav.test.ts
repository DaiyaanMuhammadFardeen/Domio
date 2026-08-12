/**
 * useViewerNav — keyboard navigation hook tests.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewerNav } from './useViewerNav';

describe('useViewerNav', () => {
  it('starts at initialIdx', () => {
    const { result } = renderHook(() => useViewerNav({ slideCount: 5, initialIdx: 2 }));
    expect(result.current.currentIdx).toBe(2);
  });

  it('clamps initialIdx to slide range', () => {
    const { result } = renderHook(() => useViewerNav({ slideCount: 5, initialIdx: 99 }));
    expect(result.current.currentIdx).toBe(4);
  });

  it('exposes next/prev/goto/first/last', () => {
    const { result } = renderHook(() => useViewerNav({ slideCount: 5, initialIdx: 1 }));
    act(() => result.current.next());
    expect(result.current.currentIdx).toBe(2);
    act(() => result.current.prev());
    expect(result.current.currentIdx).toBe(1);
    act(() => result.current.goto(4));
    expect(result.current.currentIdx).toBe(4);
    act(() => result.current.first());
    expect(result.current.currentIdx).toBe(0);
    act(() => result.current.last());
    expect(result.current.currentIdx).toBe(4);
  });

  it('clamps at boundaries when not looping', () => {
    const { result } = renderHook(() => useViewerNav({ slideCount: 3, initialIdx: 0 }));
    act(() => result.current.prev());
    expect(result.current.currentIdx).toBe(0);
    act(() => result.current.last());
    act(() => result.current.next());
    expect(result.current.currentIdx).toBe(2);
  });

  it('loops when loop=true', () => {
    const { result } = renderHook(() => useViewerNav({ slideCount: 3, initialIdx: 0, loop: true }));
    act(() => result.current.prev());
    expect(result.current.currentIdx).toBe(2);
    act(() => result.current.next());
    expect(result.current.currentIdx).toBe(0);
  });

  it('toggles help / overview', () => {
    const { result } = renderHook(() => useViewerNav({ slideCount: 3 }));
    expect(result.current.isHelpOpen).toBe(false);
    act(() => result.current.toggleHelp());
    expect(result.current.isHelpOpen).toBe(true);
    act(() => result.current.toggleOverview());
    expect(result.current.isOverviewOpen).toBe(true);
  });

  it('responds to right arrow key', () => {
    const { result } = renderHook(() => useViewerNav({ slideCount: 5, initialIdx: 0 }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(result.current.currentIdx).toBe(1);
  });

  it('responds to left arrow key', () => {
    const { result } = renderHook(() => useViewerNav({ slideCount: 5, initialIdx: 2 }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(result.current.currentIdx).toBe(1);
  });

  it('responds to h and l (vim-style)', () => {
    const { result } = renderHook(() => useViewerNav({ slideCount: 5, initialIdx: 0 }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
    });
    expect(result.current.currentIdx).toBe(1);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    });
    expect(result.current.currentIdx).toBe(0);
  });

  it('responds to Home / End', () => {
    const { result } = renderHook(() => useViewerNav({ slideCount: 5, initialIdx: 2 }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });
    expect(result.current.currentIdx).toBe(0);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(result.current.currentIdx).toBe(4);
  });

  it('fires toggleHelp on `?`', () => {
    const { result } = renderHook(() => useViewerNav({ slideCount: 3 }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    });
    expect(result.current.isHelpOpen).toBe(true);
  });

  it('does not respond to keys when focus is in an input', () => {
    const { result } = renderHook(() => useViewerNav({ slideCount: 5, initialIdx: 0 }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(result.current.currentIdx).toBe(0);
    document.body.removeChild(input);
  });

  it('gg triggers first', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useViewerNav({ slideCount: 5, initialIdx: 4 }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    });
    expect(result.current.currentIdx).toBe(0);
    vi.useRealTimers();
  });
});