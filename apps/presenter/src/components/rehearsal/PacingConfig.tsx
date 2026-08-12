'use client';

/**
 * PacingConfig — per-slide target time setter.
 *
 * Per Wave 4 §S4.5 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Differs from RehearsalPanel: the panel runs the rehearsal engine
 * and shows live drift. This component is the **before-rehearsal**
 * configurator — it shows every slide with a target-time input
 * (defaulted to 60 s) and emits a `targets` array via onChange.
 */

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import type { SlideSnapshot } from '../../runtime/types';

export interface PacingTarget {
  readonly slide_id: string;
  readonly target_ms: number;
}

export interface PacingConfigProps {
  readonly slides: readonly SlideSnapshot[];
  readonly initialTargets?: readonly PacingTarget[];
  readonly defaultTargetMs?: number;
  readonly disabled?: boolean;
  readonly onChange?: (targets: readonly PacingTarget[]) => void;
  readonly dataTestId?: string;
}

const DEFAULT_TARGET_MS = 60_000;

function formatMs(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PacingConfig({
  slides,
  initialTargets = [],
  defaultTargetMs = DEFAULT_TARGET_MS,
  disabled = false,
  onChange,
  dataTestId = 'pacing-config',
}: PacingConfigProps): ReactElement {
  const seed = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of initialTargets) map.set(t.slide_id, t.target_ms);
    return map;
  }, [initialTargets]);

  const [targets, setTargets] = useState<Map<string, number>>(
    () => new Map(slides.map((s) => [s.slide_id, seed.get(s.slide_id) ?? defaultTargetMs])),
  );

  const emit = useCallback(
    (next: Map<string, number>) => {
      onChange?.(
        slides.map((s) => ({
          slide_id: s.slide_id,
          target_ms: next.get(s.slide_id) ?? defaultTargetMs,
        })),
      );
    },
    [slides, defaultTargetMs, onChange],
  );

  const setTarget = useCallback(
    (slideId: string, ms: number) => {
      const next = new Map(targets);
      next.set(slideId, ms);
      setTargets(next);
      emit(next);
    },
    [targets, emit],
  );

  return (
    <ul
      data-testid={dataTestId}
      role="list"
      style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      {slides.map((s) => {
        const current = targets.get(s.slide_id) ?? defaultTargetMs;
        return (
          <li
            key={s.slide_id}
            data-testid={`${dataTestId}-row-${s.slide_id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              background: 'var(--surface-base)',
              fontSize: 12,
            }}
          >
            <span style={{ flex: 1 }}>{s.title ?? s.slide_id}</span>
            <label
              htmlFor={`${dataTestId}-input-${s.slide_id}`}
              style={{ fontSize: 10, color: 'var(--content-muted)' }}
            >
              target
            </label>
            <input
              id={`${dataTestId}-input-${s.slide_id}`}
              type="number"
              min={1}
              step={1}
              value={Math.round(current / 1000)}
              onChange={(e) => {
                const seconds = Number(e.target.value);
                if (!Number.isFinite(seconds) || seconds < 1) return;
                setTarget(s.slide_id, seconds * 1000);
              }}
              disabled={disabled}
              data-testid={`${dataTestId}-input-${s.slide_id}`}
              style={{
                width: 60,
                padding: '2px 4px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                fontSize: 11,
                background: 'var(--surface-base)',
                color: 'var(--content-primary)',
              }}
            />
            <span style={{ fontSize: 10, color: 'var(--content-muted)' }}>sec</span>
            <span
              data-testid={`${dataTestId}-preview-${s.slide_id}`}
              style={{ fontSize: 10, color: 'var(--content-muted)', minWidth: 36 }}
            >
              {formatMs(current)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}