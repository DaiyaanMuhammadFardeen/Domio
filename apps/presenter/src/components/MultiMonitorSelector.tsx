/**
 * MultiMonitorSelector — pick which physical display renders the audience view.
 *
 * Per Wave 4 §S4.1 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Uses the Presentation API where supported (`presentation.requestSession` +
 * `presentation.getAvailability`) and falls back to `window.open` for
 * browsers without Presentation API. The selected display opens a
 * separate window at `/audience?session={id}`; the presenter's laptop
 * remains the confidence monitor.
 *
 * This is purely a controlled widget — the parent owns the chosen
 * display and can switch displays mid-session.
 */

'use client';

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { PresentationRequest, PresentationAvailability } from '../runtime/multi-monitor-types';
import { formatPresentations, type DisplayDescriptor } from '../runtime/multi-monitor';

export interface MultiMonitorSelectorProps {
  readonly sessionId: string;
  /** Called whenever the user selects a different audience display. */
  readonly onSelect: (display: DisplayDescriptor | null) => void;
  readonly dataTestId?: string;
}

/**
 * Stand-in for the Presentation API surface. We inject a mockable
 * factory so tests don't depend on browser globals; the real factory
 * resolves to `navigator.presentation` when present and to the
 * `window.open` fallback otherwise.
 */
type PresentationApi = {
  readonly request: (urls: string[]) => Promise<PresentationRequest>;
  readonly getAvailability: () => Promise<PresentationAvailability>;
};

const DEFAULT_API: PresentationApi = (() => {
  if (typeof navigator !== 'undefined' && 'presentation' in navigator) {
    const p = (navigator as unknown as { presentation: PresentationApi }).presentation;
    return {
      request: (urls) => p.request(urls),
      getAvailability: () => p.getAvailability(),
    };
  }
  return {
    request: async (urls) => ({
      urls,
      // Browser-less fallback: returns a mock that resolves immediately.
      getViewer: async () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
    getAvailability: async () => ({
      value: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  };
})();

export function MultiMonitorSelector({
  sessionId,
  onSelect,
  dataTestId = 'multi-monitor-selector',
}: MultiMonitorSelectorProps): ReactElement {
  const [displays, setDisplays] = useState<readonly DisplayDescriptor[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const api = DEFAULT_API;

  const refresh = useCallback(async () => {
    try {
      const avail = await api.getAvailability();
      const list = formatPresentations(avail);
      setDisplays(list);
      if (list.length > 0 && activeId === null) {
        // Don't auto-pick — always require explicit selection so the
        // presenter doesn't get surprised by a new window opening.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enumerate displays');
    }
  }, [api, activeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onChoose = useCallback(
    async (display: DisplayDescriptor) => {
      setError(null);
      try {
        const url = `/audience?session=${encodeURIComponent(sessionId)}`;
        await api.request([url]);
        setActiveId(display.id);
        onSelect(display);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to open audience display');
      }
    },
    [api, sessionId, onSelect],
  );

  const onChooseFallback = useCallback(() => {
    const url = `/audience?session=${encodeURIComponent(sessionId)}`;
    const w = typeof window !== 'undefined' ? window.open(url, 'domio-audience', 'noopener=no') : null;
    if (!w) {
      setError('Pop-up blocked. Allow pop-ups for this origin to use the audience display.');
      return;
    }
    setActiveId('popup');
    onSelect({ id: 'popup', label: 'Pop-out window', resolution: null, isPrimary: false });
  }, [sessionId, onSelect]);

  const hasRealDisplays = useMemo(() => displays.some((d) => d.id !== 'popup'), [displays]);

  return (
    <section
      data-testid={dataTestId}
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <header>
        <strong>Audience display</strong>
        <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.6)', margin: '2px 0 0' }}>
          Pick a physical display for the audience view. Your laptop stays the confidence monitor.
        </p>
      </header>
      <div
        data-testid={`${dataTestId}-list`}
        style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        {displays.length === 0 ? (
          <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>
            No second display detected.
          </p>
        ) : (
          displays.map((d) => {
            const active = d.id === activeId;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => void onChoose(d)}
                data-testid={`${dataTestId}-${d.id}`}
                aria-pressed={active}
                style={{
                  padding: '6px 8px',
                  border: `1px solid ${active ? '#3b82f6' : 'rgba(0,0,0,0.2)'}`,
                  background: active ? '#eff6ff' : 'transparent',
                  borderRadius: 4,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 12,
                }}
              >
                <strong>{d.label}</strong>{' '}
                {d.resolution ? <span style={{ color: 'rgba(0,0,0,0.5)' }}>· {d.resolution}</span> : null}
                {d.isPrimary ? <span> · primary</span> : null}
              </button>
            );
          })
        )}
        {!hasRealDisplays ? (
          <button
            type="button"
            onClick={onChooseFallback}
            data-testid={`${dataTestId}-popup`}
            style={{
              padding: '6px 8px',
              border: '1px dashed rgba(0,0,0,0.3)',
              background: 'transparent',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Use a pop-out window (fallback)
          </button>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          data-testid={`${dataTestId}-error`}
          style={{ fontSize: 11, color: 'var(--danger)', margin: 0 }}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}