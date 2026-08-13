'use client';

/**
 * PiPPanel — presenter-side Document Picture-in-Picture window.
 *
 * When the user clicks the PiP button (or hits the keyboard shortcut):
 *   1. Detect support.
 *   2. Open a PiP window and copy the runtime chrome (timer, current slide,
 *      next slide, notes head) into it.
 *   3. When the user closes the PiP window, the source page remains live;
 *      the runtime just stops mirroring.
 *
 * On non-Chromium browsers we render a fixed-position mini chrome on the
 * main document as a fallback.
 */

import { useEffect, useRef } from 'react';
import { usePipController } from '../../runtime/pip/pip-window';
import type { SlideSnapshot } from '../../runtime/types';

export interface PipPanelProps {
  activeSlide: SlideSnapshot | null;
  nextSlide: SlideSnapshot | null;
  startedAtMs: number;
  budgetMs: number;
}

export function PipPanel({ activeSlide, nextSlide, startedAtMs, budgetMs }: PipPanelProps) {
  const { supported, window: pipWindow, toggle } = usePipController();
  const fallbackRef = useRef<HTMLDivElement | null>(null);

  // Mirror content into the PiP document when opened.
  useEffect(() => {
    if (!pipWindow) return;
    const doc = pipWindow.document;
    doc.body.innerHTML = '';
    const root = doc.createElement('div');
    root.className = 'pip-mirror';
    root.innerHTML = renderMirror(activeSlide, nextSlide, startedAtMs, budgetMs);
    doc.body.appendChild(root);
    const style = doc.createElement('style');
    style.textContent = MIRROR_CSS;
    doc.head.appendChild(style);

    const tick = window.setInterval(() => {
      const live = root.querySelector('.pip-mirror__elapsed');
      if (live) live.textContent = formatElapsed(Date.now() - startedAtMs);
    }, 1000);

    return () => {
      window.clearInterval(tick);
    };
  }, [pipWindow, activeSlide, nextSlide, startedAtMs, budgetMs]);

  if (!supported) {
    // Fallback: render a small floating widget on the main page.
    return (
      <div className="pip-fallback" ref={fallbackRef} aria-label="PiP preview (fallback)">
        <div className="pip-fallback__label">PiP preview</div>
        <div className="pip-fallback__slide">{activeSlide?.title ?? '—'}</div>
        <div className="pip-fallback__elapsed">{formatElapsed(Date.now() - startedAtMs)}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="pip-toggle"
      onClick={() => toggle()}
      aria-label={pipWindow ? 'Close Picture-in-Picture window' : 'Open Picture-in-Picture window'}
    >
      {pipWindow ? '✕ PiP' : '🪟 PiP'}
    </button>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${m}:${String(remS).padStart(2, '0')}`;
}

function renderMirror(
  active: SlideSnapshot | null,
  next: SlideSnapshot | null,
  startedAt: number,
  budgetMs: number,
): string {
  const elapsed = formatElapsed(Date.now() - startedAt);
  const remaining = formatElapsed(Math.max(0, budgetMs - (Date.now() - startedAt)));
  return `
    <div class="pip-mirror__row">
      <span class="pip-mirror__label">Now</span>
      <span class="pip-mirror__title">${escapeHtml(active?.title ?? '—')}</span>
    </div>
    <div class="pip-mirror__row">
      <span class="pip-mirror__label">Next</span>
      <span class="pip-mirror__title">${escapeHtml(next?.title ?? '—')}</span>
    </div>
    <div class="pip-mirror__row">
      <span class="pip-mirror__label">Elapsed</span>
      <span class="pip-mirror__elapsed">${elapsed}</span>
    </div>
    <div class="pip-mirror__row">
      <span class="pip-mirror__label">Remaining</span>
      <span class="pip-mirror__remaining">${remaining}</span>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

const MIRROR_CSS = `
body { margin: 0; background: #0a0e14; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 12px; }
.pip-mirror__row { display: flex; gap: 8px; padding: 4px 0; font-size: 14px; }
.pip-mirror__label { color: #7d8590; min-width: 70px; }
.pip-mirror__title { color: #e6edf3; flex: 1; overflow: hidden; text-overflow: ellipsis; }
.pip-mirror__elapsed, .pip-mirror__remaining { color: #58a6ff; font-family: ui-monospace, monospace; }
`;
