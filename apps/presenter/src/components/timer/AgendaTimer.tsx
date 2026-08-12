'use client';

/**
 * AgendaTimer — per-segment agenda timer with soft/hard alert states.
 *
 * Per Wave 4 §S4.11 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Renders one bar per AgendaTimer in `agenda_timers`:
 *   - Green   :   0–80% consumed
 *   - Yellow  :  80–100%  (soft alert)
 *   - Red     : 100%+     (hard alert)
 *
 * Tap-to-pin: clicking a row marks it as the "primary" timer shown to
 * the audience if `visible_to === 'both'` or `'audience'`. The presenter
 * can also toggle visibility per row.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { AgendaTimer as AgendaTimerData } from '../../runtime/types';

export type AlertLevel = 'safe' | 'soft' | 'hard';

export function computeAlertLevel(remainingMs: number, durationMs: number): AlertLevel {
  if (durationMs <= 0) return 'safe';
  const consumed = durationMs - remainingMs;
  if (consumed < 0) return 'safe';
  const pct = consumed / durationMs;
  if (pct >= 1) return 'hard';
  if (pct >= 0.8) return 'soft';
  return 'safe';
}

export function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface AgendaTimerProps {
  readonly agendaTimers: readonly AgendaTimerData[];
  readonly primaryId?: string;
  readonly onPrimaryChange?: (id: string) => void;
  readonly onVisibilityToggle?: (id: string, next: AgendaTimerData['visible_to']) => void;
  readonly dataTestId?: string;
}

export function AgendaTimer({
  agendaTimers,
  primaryId,
  onPrimaryChange,
  onVisibilityToggle,
  dataTestId = 'agenda-timer',
}: AgendaTimerProps): ReactElement {
  const [tick, setTick] = useState(0);

  // 1Hz tick — re-renders every second so the countdown visibly decrements.
  useEffect(() => {
    const handle = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(handle);
  }, []);

  const handlePick = useCallback(
    (id: string) => {
      onPrimaryChange?.(id);
    },
    [onPrimaryChange],
  );

  const handleVisibility = useCallback(
    (id: string, current: AgendaTimerData['visible_to']) => {
      const next: AgendaTimerData['visible_to'] =
        current === 'presenter'
          ? 'audience'
          : current === 'audience'
            ? 'both'
            : 'presenter';
      onVisibilityToggle?.(id, next);
    },
    [onVisibilityToggle],
  );

  return (
    <section
      data-testid={dataTestId}
      data-tick={tick}
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: 8,
        background: 'var(--surface-base)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 12 }}>Agenda</strong>
        <span style={{ fontSize: 10, color: 'var(--content-secondary)' }}>{agendaTimers.length} segments</span>
      </header>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {agendaTimers.map((t) => {
          const alert = computeAlertLevel(t.remaining_ms, t.duration_ms);
          const pct = t.duration_ms > 0
            ? Math.min(100, Math.max(0, ((t.duration_ms - t.remaining_ms) / t.duration_ms) * 100))
            : 0;
          const isPrimary = primaryId === t.id || (primaryId === undefined && t.status === 'running');
          const barColor =
            alert === 'hard' ? 'var(--danger)' : alert === 'soft' ? 'var(--warning)' : 'var(--success)';
          return (
            <li
              key={t.id}
              data-testid={`${dataTestId}-${t.id}`}
              data-alert={alert}
              data-primary={isPrimary}
              data-visible={t.visible_to}
              style={{
                border: `1px solid ${isPrimary ? 'var(--info)' : 'var(--border-subtle)'}`,
                borderRadius: 6,
                padding: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <button
                  type="button"
                  onClick={() => handlePick(t.id)}
                  data-testid={`${dataTestId}-${t.id}-pick`}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--content-primary)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: 0,
                  }}
                >
                  {t.label}
                </button>
                <span
                  data-testid={`${dataTestId}-${t.id}-time`}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: alert === 'hard' ? 'var(--danger)' : alert === 'soft' ? 'var(--warning)' : 'var(--content-secondary)',
                  }}
                >
                  {formatMmSs(t.remaining_ms)}
                </span>
              </div>
              <div
                aria-hidden
                style={{
                  height: 4,
                  background: 'var(--surface-raised)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  data-testid={`${dataTestId}-${t.id}-bar`}
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: barColor,
                    transition: 'width 200ms linear',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--content-secondary)' }}>
                <span>{t.status}</span>
                <button
                  type="button"
                  onClick={() => handleVisibility(t.id, t.visible_to)}
                  data-testid={`${dataTestId}-${t.id}-visibility`}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--info)',
                    cursor: 'pointer',
                    fontSize: 10,
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  to: {t.visible_to}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}