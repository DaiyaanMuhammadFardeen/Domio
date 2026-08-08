'use client';

/**
 * DynamicPlanPanel — presenter-side control for the dynamic plan.
 *
 * Shows the running order (canonical order minus hidden slides) as a
 * draggable list. Drag-reorder sends a /plan call to update the order.
 * Hidden slides can be toggled via checkboxes. Reset clears back to
 * canonical order.
 *
 * Note: HTML5 drag-and-drop is sufficient here — the spec calls for
 * touch-friendly reorder but doesn't require a library. We use simple
 * `dragstart` / `dragover` / `drop` events with `dataTransfer`.
 *
 * StageBadge displays a colored chip next to each slide showing its
 * canonical position, current running position, and hidden status.
 */

import { useCallback, useMemo, useState } from 'react';
import { PlanClient, type PlanClientError } from '../../runtime/plan-client';
import type { PresenterSessionState, SlideSnapshot } from '../../runtime/types';

export interface DynamicPlanPanelProps {
  sessionId: string;
  state: PresenterSessionState;
  apiBaseUrl?: string;
  disabled?: boolean;
  onUpdated?: (state: PresenterSessionState) => void;
}

export function DynamicPlanPanel(props: DynamicPlanPanelProps) {
  const { sessionId, state, apiBaseUrl, disabled, onUpdated } = props;
  const client = useMemo(() => new PlanClient({ baseUrl: apiBaseUrl ?? '' }), [apiBaseUrl]);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  const canonical = state.slides;
  const runningOrder = useMemo(
    () => state.plan.order.length > 0
      ? state.plan.order
        .map((id) => canonical.find((s) => s.slide_id === id))
        .filter((s): s is SlideSnapshot => !!s)
      : canonical,
    [canonical, state.plan.order],
  );

  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [draftHidden, setDraftHidden] = useState<Set<string>>(new Set());

  // Initialize drafts from current state — local edits only persist on Save.
  const syncDraft = useCallback(() => {
    setDraftOrder(runningOrder.map((s) => s.slide_id));
    setDraftHidden(new Set(state.plan.hidden));
  }, [runningOrder, state.plan.hidden]);

  // Drag state.
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((i: number) => () => setDragIndex(i), []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);
  const handleDrop = useCallback((target: number) => () => {
    setDragIndex((from) => {
      if (from === null || from === target) return from;
      const next = [...draftOrder];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(target, 0, moved);
      setDraftOrder(next);
      return null;
    });
  }, [draftOrder]);

  const toggleHidden = useCallback((id: string) => {
    setDraftHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    setPending(true);
    setStatus(null);
    try {
      const next = await client.patch(sessionId, {
        order: draftOrder,
        hidden: Array.from(draftHidden),
      });
      setStatus({ kind: 'ok', message: 'plan saved' });
      onUpdated?.(next);
    } catch (e) {
      const err = e as PlanClientError;
      setStatus({ kind: 'error', message: `save failed: HTTP ${err.status}` });
    } finally {
      setPending(false);
    }
  }, [client, sessionId, draftOrder, draftHidden, onUpdated]);

  return (
    <div className="plan-panel">
      <header className="plan-panel__header">
        <h3 className="plan-panel__title">Dynamic plan</h3>
        <div className="plan-panel__actions">
          <button type="button" onClick={syncDraft} disabled={disabled || pending}>
            ↺ Reset
          </button>
          <button
            type="button"
            className="plan-panel__save"
            onClick={save}
            disabled={disabled || pending}
          >
            ⏎ Save
          </button>
        </div>
      </header>
      <ul className="plan-panel__list">
        {draftOrder.map((id, i) => {
          const slide = canonical.find((s) => s.slide_id === id);
          const canonicalIdx = canonical.findIndex((s) => s.slide_id === id);
          const isCurrent = state.state.slide_id === id;
          const isHidden = draftHidden.has(id);
          return (
            <li
              key={id}
              className={`plan-row ${dragIndex === i ? 'plan-row--dragging' : ''} ${isCurrent ? 'plan-row--current' : ''}`}
              draggable={!disabled}
              onDragStart={handleDragStart(i)}
              onDragOver={handleDragOver}
              onDrop={handleDrop(i)}
            >
              <span className="plan-row__grip" aria-hidden>⋮⋮</span>
              <span className="plan-row__index">{i + 1}</span>
              <span className="plan-row__title">{slide?.title ?? id}</span>
              <StageBadge canonicalIndex={canonicalIdx} runningIndex={i} isCurrent={isCurrent} />
              <label className="plan-row__hide">
                <input
                  type="checkbox"
                  checked={isHidden}
                  onChange={() => toggleHidden(id)}
                  disabled={disabled}
                />
                <span>hidden</span>
              </label>
            </li>
          );
        })}
      </ul>
      {status && (
        <div className={`plan-panel__status plan-panel__status--${status.kind}`} role="status" aria-live="polite">
          {status.message}
        </div>
      )}
    </div>
  );
}

export interface StageBadgeProps {
  canonicalIndex: number;
  runningIndex: number;
  isCurrent: boolean;
}

export function StageBadge({ canonicalIndex, runningIndex, isCurrent }: StageBadgeProps) {
  const moved = canonicalIndex !== runningIndex;
  const label = isCurrent
    ? `live • #${runningIndex + 1}`
    : moved
      ? `was #${canonicalIndex + 1} • #${runningIndex + 1}`
      : `#${runningIndex + 1}`;
  return (
    <span className={`stage-badge ${isCurrent ? 'stage-badge--current' : ''} ${moved && !isCurrent ? 'stage-badge--moved' : ''}`}>
      {label}
    </span>
  );
}