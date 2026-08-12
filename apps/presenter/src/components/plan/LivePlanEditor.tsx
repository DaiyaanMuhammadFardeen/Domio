'use client';

/**
 * LivePlanEditor — focused on-the-fly slide reorder + hide control.
 *
 * Per Wave 4 §S4.4 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Differs from DynamicPlanPanel: DynamicPlanPanel owns the full
 * presenter-side dynamic-plan lifecycle (drag + save + status). This
 * component is a pure presentation primitive — it renders the running
 * order with up/down controls + a hide toggle per row, and emits a
 * diff via `onChange` whenever the presenter mutates the order. The
 * parent decides when to persist.
 */

import { useCallback, useState, type ReactElement, type CSSProperties } from 'react';
import type { SlideSnapshot } from '../../runtime/types';

export interface PlanDiff {
  readonly order: readonly string[];
  readonly hidden: readonly string[];
}

export interface LivePlanEditorProps {
  readonly slides: readonly SlideSnapshot[];
  readonly initialOrder: readonly string[];
  readonly initialHidden: readonly string[];
  readonly disabled?: boolean;
  readonly dataTestId?: string;
  readonly onChange?: (diff: PlanDiff) => void;
}

export function LivePlanEditor({
  slides,
  initialOrder,
  initialHidden,
  disabled = false,
  dataTestId = 'live-plan-editor',
  onChange,
}: LivePlanEditorProps): ReactElement {
  const [order, setOrder] = useState<string[]>([...initialOrder]);
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden));

  const emit = useCallback(
    (nextOrder: string[], nextHidden: Set<string>) => {
      onChange?.({ order: nextOrder, hidden: [...nextHidden] });
    },
    [onChange],
  );

  const move = useCallback(
    (index: number, delta: -1 | 1) => {
      const next = [...order];
      const target = index + delta;
      if (target < 0 || target >= next.length) return;
      const a = next[index]!;
      const b = next[target]!;
      next[index] = b;
      next[target] = a;
      setOrder(next);
      emit(next, hidden);
    },
    [order, hidden, emit],
  );

  const toggleHidden = useCallback(
    (id: string) => {
      const next = new Set(hidden);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setHidden(next);
      emit(order, next);
    },
    [order, hidden, emit],
  );

  return (
    <ul
      data-testid={dataTestId}
      role="list"
      style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      {order.map((id, index) => {
        const slide = slides.find((s) => s.slide_id === id);
        const isHidden = hidden.has(id);
        return (
          <li
            key={id}
            data-testid={`${dataTestId}-row-${id}`}
            data-hidden={isHidden}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 8px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              background: isHidden ? 'var(--surface-base)' : 'var(--surface-raised)',
              opacity: isHidden ? 0.55 : 1,
              textDecoration: isHidden ? 'line-through' : 'none',
            }}
          >
            <span
              data-testid={`${dataTestId}-index-${id}`}
              style={{ fontSize: 11, color: 'var(--content-muted)', minWidth: 24 }}
            >
              {index + 1}.
            </span>
            <span
              data-testid={`${dataTestId}-title-${id}`}
              style={{ flex: 1, fontSize: 12 }}
            >
              {slide?.title ?? id}
            </span>
            <button
              type="button"
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
              aria-label="Move slide up"
              data-testid={`${dataTestId}-up-${id}`}
              style={iconBtnStyle(disabled || index === 0)}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={disabled || index === order.length - 1}
              onClick={() => move(index, 1)}
              aria-label="Move slide down"
              data-testid={`${dataTestId}-down-${id}`}
              style={iconBtnStyle(disabled || index === order.length - 1)}
            >
              ↓
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => toggleHidden(id)}
              aria-pressed={isHidden}
              aria-label={isHidden ? 'Show slide' : 'Hide slide'}
              data-testid={`${dataTestId}-hide-${id}`}
              style={{
                ...iconBtnStyle(disabled),
                background: isHidden ? 'var(--surface-raised)' : 'var(--surface-base)',
              }}
            >
              {isHidden ? '👁' : '🚫'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function iconBtnStyle(disabled: boolean): CSSProperties {
  return {
    padding: '2px 6px',
    border: '1px solid var(--border-subtle)',
    background: 'var(--surface-base)',
    borderRadius: 4,
    fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}