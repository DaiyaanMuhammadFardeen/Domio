/**
 * useViewerNav — keyboard / touch navigation for the viewer.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Binds a window keydown listener with the platform-aware chords:
 *   ArrowLeft / h   → previous slide
 *   ArrowRight / l  → next slide
 *   f               → toggle fullscreen
 *   o               → open overview grid
 *   ?               → toggle help
 *   Home / g g      → first slide
 *   End / G         → last slide
 *
 * Also accepts programmatic `next()`, `prev()`, `goto(i)` calls.
 *
 * Touch handler is exposed via `useTouchNav` (S3.1 bounds: swipe + pinch).
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

export interface ViewerNavApi {
  readonly currentIdx: number;
  readonly slideCount: number;
  readonly next: () => void;
  readonly prev: () => void;
  readonly goto: (idx: number) => void;
  readonly first: () => void;
  readonly last: () => void;
  readonly toggleFullscreen: () => void;
  readonly toggleHelp: () => void;
  readonly toggleOverview: () => void;
  readonly isHelpOpen: boolean;
  readonly isOverviewOpen: boolean;
  readonly isFullscreen: boolean;
}

export interface UseViewerNavOptions {
  readonly slideCount: number;
  readonly loop?: boolean;
  readonly initialIdx?: number;
}

export function useViewerNav({ slideCount, loop = false, initialIdx = 0 }: UseViewerNavOptions): ViewerNavApi {
  const [currentIdx, setCurrentIdx] = useState(() => Math.max(0, Math.min(initialIdx, slideCount - 1)));
  const [isHelpOpen, setHelpOpen] = useState(false);
  const [isOverviewOpen, setOverviewOpen] = useState(false);
  const [isFullscreen, setFullscreen] = useState(false);
  const gPressCount = useRef<{ count: number; timer: ReturnType<typeof setTimeout> | null }>({ count: 0, timer: null });

  const clamp = useCallback(
    (idx: number): number => {
      if (slideCount === 0) return 0;
      if (loop) {
        return ((idx % slideCount) + slideCount) % slideCount;
      }
      return Math.max(0, Math.min(idx, slideCount - 1));
    },
    [slideCount, loop],
  );

  const next = useCallback(() => setCurrentIdx((i) => clamp(i + 1)), [clamp]);
  const prev = useCallback(() => setCurrentIdx((i) => clamp(i - 1)), [clamp]);
  const goto = useCallback((idx: number) => setCurrentIdx(clamp(idx)), [clamp]);
  const first = useCallback(() => setCurrentIdx(0), []);
  const last = useCallback(() => setCurrentIdx(slideCount - 1), [slideCount]);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const toggleHelp = useCallback(() => setHelpOpen((v) => !v), []);
  const toggleOverview = useCallback(() => setOverviewOpen((v) => !v), []);

  // Track fullscreen state from the DOM in case the user presses Esc.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = (): void => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      // Skip when typing in an input / textarea / contenteditable.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      if (e.key === 'ArrowLeft' || e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        prev();
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        next();
      } else if (e.key === 'Home') {
        e.preventDefault();
        first();
      } else if (e.key === 'End') {
        e.preventDefault();
        last();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        toggleOverview();
      } else if (e.key === '?') {
        e.preventDefault();
        toggleHelp();
      } else if (e.key === 'g' || e.key === 'G') {
        // gg → first, G → last
        if (e.shiftKey) {
          e.preventDefault();
          last();
        } else {
          const state = gPressCount.current;
          state.count += 1;
          if (state.timer) clearTimeout(state.timer);
          state.timer = setTimeout(() => {
            state.count = 0;
          }, 400);
          if (state.count >= 2) {
            e.preventDefault();
            first();
            state.count = 0;
          }
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, first, last, toggleFullscreen, toggleOverview, toggleHelp]);

  return {
    currentIdx,
    slideCount,
    next,
    prev,
    goto,
    first,
    last,
    toggleFullscreen,
    toggleHelp,
    toggleOverview,
    isHelpOpen,
    isOverviewOpen,
    isFullscreen,
  };
}