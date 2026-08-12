'use client';

/**
 * RehearsalRecorder — heatmap of time-per-slide after a rehearsal run.
 *
 * Per Wave 4 §S4.5 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Reads a `RehearsalRunSummary` and visualizes each slide's actual
 * elapsed time as a colored cell on a green→yellow→red scale (target
 * hit = green, ±20% = yellow, >20% over = red). Shows the summary
 * next to the plan editor so the presenter can review pacing before
 * going live.
 */

import type { ReactElement } from 'react';

export interface RehearsalSlideStat {
  readonly slide_id: string;
  readonly title: string;
  readonly actual_ms: number;
  readonly target_ms: number;
}

export interface RehearsalRecorderProps {
  readonly stats: readonly RehearsalSlideStat[];
  readonly dataTestId?: string;
}

function ratio(actual_ms: number, target_ms: number): number {
  if (target_ms <= 0) return 0;
  return actual_ms / target_ms;
}

function colorForRatio(r: number): string {
  if (r <= 1.0) return 'var(--success)';
  if (r <= 1.2) return 'var(--warning)';
  return 'var(--danger)';
}

export function RehearsalRecorder({
  stats,
  dataTestId = 'rehearsal-recorder',
}: RehearsalRecorderProps): ReactElement {
  if (stats.length === 0) {
    return (
      <p
        data-testid={`${dataTestId}-empty`}
        style={{ fontSize: 11, color: 'var(--content-muted)', margin: 0 }}
      >
        No rehearsal data yet. Run a rehearsal to see the heatmap.
      </p>
    );
  }

  return (
    <ul
      data-testid={dataTestId}
      role="list"
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {stats.map((s) => {
        const r = ratio(s.actual_ms, s.target_ms);
        const pct = Math.round(r * 100);
        return (
          <li
            key={s.slide_id}
            data-testid={`${dataTestId}-row-${s.slide_id}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              gap: 8,
              padding: '4px 8px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              background: 'var(--surface-base)',
              fontSize: 12,
            }}
          >
            <span>{s.title ?? s.slide_id}</span>
            <span
              data-testid={`${dataTestId}-badge-${s.slide_id}`}
              style={{
                padding: '1px 6px',
                borderRadius: 4,
                background: colorForRatio(r),
                color: 'var(--content-inverse)',
                fontSize: 10,
                fontWeight: 600,
                minWidth: 36,
                textAlign: 'center',
              }}
            >
              {pct}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}