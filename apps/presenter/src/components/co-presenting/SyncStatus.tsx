'use client';

/**
 * SyncStatus — top-bar pill showing who is presenting and which slide
 * is currently active for the audience.
 *
 * Per Wave 11 §S11.9 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Behaviour:
 *   - On mount / session change, fetches the active presenter.
 *   - Polls every 4s so that a handoff from another presenter (e.g.
 *     Bob → Carla) is reflected in the pill.
 *   - When the active presenter id changes, the pill animates: a short
 *     fade-out + scale-down on the old name, then fade-in + scale-up
 *     on the new name. Animation is implemented with a CSS keyframe
 *     driven by the `data-changing` attribute so we don't need a
 *     separate animation library.
 *
 * The component is intentionally presentational: it owns no app state.
 * Pass `slideIndex` from the parent (the same source that drives
 * AudienceMirror) so the pill stays consistent with the rendered slide.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { getActivePresenter, type Presenter } from '../../lib/co-presenting-service';

export interface SyncStatusProps {
  /** Session whose active presenter we want to show. */
  sessionId: string;
  /** Index of the slide currently being advanced to (1-based for display). */
  slideIndex: number;
  /** Optional override for the polling cadence (ms). Default 4000. */
  pollMs?: number;
  /**
   * Localized strings. Defaults match the en.json keys for Wave 11 §S11.9.
   */
  readonly labels?: Partial<{
    /** "Alice is presenting" — {name} substitution. */
    activePresenter: string;
    /** "Slide 5" — {n} substitution. */
    slide: string;
  }>;
  readonly dataTestId?: string;
}

const DEFAULT_LABELS: Required<NonNullable<SyncStatusProps['labels']>> = {
  activePresenter: '{name} is presenting',
  slide: 'Slide {n}',
};

function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`,
  );
}

export function SyncStatus({
  sessionId,
  slideIndex,
  pollMs = 4000,
  labels,
  dataTestId = 'sync-status',
}: SyncStatusProps): ReactElement {
  const t = { ...DEFAULT_LABELS, ...(labels ?? {}) };
  const [active, setActive] = useState<Presenter | null>(null);
  const [changing, setChanging] = useState(false);
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchActive = useCallback(async () => {
    const next = await getActivePresenter(sessionId);
    setActive((prev) => {
      const nextId = next?.id ?? null;
      if (prev?.id !== nextId) {
        // Trigger the swap animation. We give the old name ~180ms to
        // fade out before the new name paints in.
        setChanging(true);
        if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
        changeTimerRef.current = setTimeout(() => setChanging(false), 360);
      }
      return next;
    });
  }, [sessionId]);

  useEffect(() => {
    void fetchActive();
    const id = setInterval(() => {
      void fetchActive();
    }, pollMs);
    return () => {
      clearInterval(id);
      if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
    };
  }, [fetchActive, pollMs]);

  const slideLabel = format(t.slide, { n: Math.max(1, slideIndex) });
  const presenterLabel = active ? format(t.activePresenter, { name: active.name }) : '—';

  return (
    <div
      className="sync-status"
      data-testid={dataTestId}
      data-changing={changing ? 'true' : 'false'}
      role="status"
      aria-live="polite"
    >
      <span
        className="sync-status__presenter"
        data-testid={`${dataTestId}-presenter`}
        key={active?.id ?? 'none'}
      >
        {presenterLabel}
      </span>
      <span className="sync-status__sep" aria-hidden="true">
        ·
      </span>
      <span className="sync-status__slide" data-testid={`${dataTestId}-slide`}>
        {slideLabel}
      </span>
    </div>
  );
}
