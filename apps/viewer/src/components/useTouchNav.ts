/**
 * useTouchNav — touch navigation helpers for the viewer.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Wraps pointer events for swipe (advance) + pinch (overview). Pinch is
 * gesture-detected via distance delta; swipe is detected via horizontal
 * velocity over a minimum distance threshold.
 */

'use client';

import { useEffect, useRef } from 'react';

export interface UseTouchNavOptions {
  readonly onSwipeLeft?: () => void;
  readonly onSwipeRight?: () => void;
  readonly onPinchIn?: () => void;
  readonly onPinchOut?: () => void;
  readonly minSwipeDistance?: number;
  readonly enabled?: boolean;
}

export function useTouchNav({
  onSwipeLeft,
  onSwipeRight,
  onPinchIn,
  onPinchOut,
  minSwipeDistance = 60,
  enabled = true,
}: UseTouchNavOptions): void {
  const start = useRef<{ x: number; y: number; t: number; pinchDist: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) return;

    const distance = (a: Touch, b: Touch): number => {
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onStart = (e: TouchEvent): void => {
      if (e.touches.length === 1) {
        const t = e.touches[0]!;
        start.current = { x: t.clientX, y: t.clientY, t: Date.now(), pinchDist: 0 };
      } else if (e.touches.length === 2) {
        start.current = { x: 0, y: 0, t: Date.now(), pinchDist: distance(e.touches[0]!, e.touches[1]!) };
      }
    };

    const onEnd = (e: TouchEvent): void => {
      if (!start.current) return;
      const t = e.changedTouches[0]!;

      if (e.touches.length === 0 && start.current.pinchDist === 0) {
        // Swipe
        const dx = t.clientX - start.current.x;
        const dt = Math.max(1, Date.now() - start.current.t);
        const velocity = Math.abs(dx) / dt;
        if (Math.abs(dx) >= minSwipeDistance && velocity > 0.1) {
          if (dx < 0) onSwipeLeft?.();
          else onSwipeRight?.();
        }
      }

      start.current = null;
    };

    const onMove = (e: TouchEvent): void => {
      if (!start.current || e.touches.length !== 2) return;
      const dist = distance(e.touches[0]!, e.touches[1]!);
      const delta = dist - start.current.pinchDist;
      if (Math.abs(delta) > 40) {
        if (delta < 0) onPinchIn?.();
        else onPinchOut?.();
        start.current.pinchDist = dist;
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchmove', onMove);
    };
  }, [enabled, onSwipeLeft, onSwipeRight, onPinchIn, onPinchOut, minSwipeDistance]);
}