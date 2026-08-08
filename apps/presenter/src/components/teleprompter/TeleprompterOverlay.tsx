'use client';

/**
 * TeleprompterOverlay — presenter-side teleprompter.
 *
 * Shows the current slide's notes as a scroller, with adjustable font
 * size, mirror mode, and a follow-cursor that scrolls as the presenter
 * speaks. Renders as a fullscreen overlay when enabled.
 *
 * Audience display mode: disabled — the teleprompter is presenter-only
 * (controlled by display profile settings; P15 W14 adds the gating).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SlideSnapshot } from '../../runtime/types';

export interface TeleprompterOverlayProps {
  slide: SlideSnapshot | null;
  enabled: boolean;
  onClose: () => void;
  fontPx?: number;
  mirror?: boolean;
}

const DEFAULT_FONT_PX = 36;

export function TeleprompterOverlay({ slide, enabled, onClose, fontPx = DEFAULT_FONT_PX, mirror = false }: TeleprompterOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrolling, setScrolling] = useState(true);
  const [speedPx, setSpeedPx] = useState(40); // px/sec
  const [internalFontPx, setInternalFontPx] = useState(fontPx);

  // Smooth auto-scroll while enabled.
  useEffect(() => {
    if (!enabled || !scrolling || !containerRef.current) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const el = containerRef.current;
      if (el) {
        el.scrollTop += speedPx * dt;
        // Stop at the bottom.
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) setScrolling(false);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled, scrolling, speedPx]);

  // Reset scroll when slide changes.
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrolling(true);
    }
  }, [slide?.slide_id]);

  // Keyboard controls.
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        setScrolling((s) => !s);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (containerRef.current) containerRef.current.scrollTop -= 50;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (containerRef.current) containerRef.current.scrollTop += 50;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '+') {
        setInternalFontPx((s) => Math.min(96, s + 2));
      } else if (e.key === '-') {
        setInternalFontPx((s) => Math.max(12, s - 2));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onClose]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    // Manual scroll always works — pausing auto-scroll temporarily.
    if (scrolling && Math.abs(e.deltaY) > 4) setScrolling(false);
  }, [scrolling]);

  if (!enabled) return null;
  const text = slide?.notes ?? '(no notes for this slide)';

  return (
    <div className={`teleprompter-overlay ${mirror ? 'teleprompter-overlay--mirror' : ''}`} role="dialog" aria-label="Teleprompter">
      <div className="teleprompter-overlay__chrome">
        <button type="button" className="teleprompter-overlay__btn" onClick={() => setScrolling((s) => !s)}>
          {scrolling ? '⏸ Pause' : '▶ Resume'}
        </button>
        <label className="teleprompter-overlay__speed">
          Speed
          <input type="range" min={10} max={120} value={speedPx} onChange={(e) => setSpeedPx(Number(e.target.value))} />
          <span>{speedPx}px/s</span>
        </label>
        <label className="teleprompter-overlay__size">
          Size
          <input type="range" min={16} max={72} value={internalFontPx} onChange={(e) => setInternalFontPx(Number(e.target.value))} />
          <span>{internalFontPx}px</span>
        </label>
        <button type="button" className="teleprompter-overlay__btn teleprompter-overlay__btn--close" onClick={onClose}>
          ✕ Close (Esc)
        </button>
      </div>
      <div
        ref={containerRef}
        className="teleprompter-overlay__scroll"
        onWheel={onWheel}
      >
        <div className="teleprompter-overlay__text" style={{ fontSize: `${internalFontPx}px` }}>
          {text}
        </div>
      </div>
    </div>
  );
}