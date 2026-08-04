/**
 * SequenceInspectorPanel — author and inspect a presentation sequence
 * bound to the active deck.
 *
 * Phase 10 (M6.2).
 *
 * The panel exposes:
 * - Name, slide list (re-orderable via move up/down)
 * - Interval (ms), pause_on_event, loop, count
 * - Interruption policy: ignore | queue | abort
 * - Reduced-motion default-off toggle
 * - Pause-warn threshold (default 30 min)
 */

'use client';

import { useCallback } from 'react';
import type { ReactElement } from 'react';

export type InterruptionPolicy = 'ignore' | 'queue' | 'abort';

export interface PresentationSequenceRecord {
  id: string;
  tenantId: string;
  deckId: string;
  name: string;
  slides: string[];
  intervalMs: number;
  pauseOnEvent: boolean;
  loop: boolean;
  count: number;
  interruptionPolicy: InterruptionPolicy;
  reducedMotionDefaultOff: boolean;
  pauseWarnAtMs: number;
  version: number;
}

interface SequenceInspectorPanelProps {
  sequence: PresentationSequenceRecord;
  onPatch: (patch: Partial<PresentationSequenceRecord> & { version: number }) => void;
  onDelete?: () => void;
}

const POLICIES: Array<{ value: InterruptionPolicy; label: string; description: string }> = [
  { value: 'ignore', label: 'Ignore', description: 'Drop the click but keep playing.' },
  { value: 'queue', label: 'Queue', description: 'Buffer the click and replay after the slide.' },
  { value: 'abort', label: 'Abort', description: 'Halt the sequence on first click.' },
];

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}min`;
}

export function SequenceInspectorPanel({
  sequence,
  onPatch,
  onDelete,
}: SequenceInspectorPanelProps): ReactElement {
  const updateName = useCallback(
    (name: string) => onPatch({ version: sequence.version, name }),
    [sequence.version, onPatch],
  );

  const updateInterval = useCallback(
    (intervalMs: number) => onPatch({ version: sequence.version, intervalMs }),
    [sequence.version, onPatch],
  );

  const updatePolicy = useCallback(
    (interruptionPolicy: InterruptionPolicy) => onPatch({ version: sequence.version, interruptionPolicy }),
    [sequence.version, onPatch],
  );

  const updateLoop = useCallback(
    (loop: boolean) => onPatch({ version: sequence.version, loop }),
    [sequence.version, onPatch],
  );

  const updateCount = useCallback(
    (count: number) => onPatch({ version: sequence.version, count }),
    [sequence.version, onPatch],
  );

  const updateReducedMotion = useCallback(
    (reducedMotionDefaultOff: boolean) => onPatch({ version: sequence.version, reducedMotionDefaultOff }),
    [sequence.version, onPatch],
  );

  const updatePauseWarn = useCallback(
    (pauseWarnAtMs: number) => onPatch({ version: sequence.version, pauseWarnAtMs }),
    [sequence.version, onPatch],
  );

  const updatePauseOnEvent = useCallback(
    (pauseOnEvent: boolean) => onPatch({ version: sequence.version, pauseOnEvent }),
    [sequence.version, onPatch],
  );

  const moveSlide = useCallback(
    (idx: number, direction: -1 | 1) => {
      const next = [...sequence.slides];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return;
      const tmp = next[idx]!;
      next[idx] = next[target]!;
      next[target] = tmp;
      onPatch({ version: sequence.version, slides: next });
    },
    [sequence.version, sequence.slides, onPatch],
  );

  return (
    <div className="sequence-inspector" data-testid="m6-sequence-panel">
      <div className="props-panel__section-title">Sequence</div>
      <div className="prop-field">
        <label className="prop-field__label">Name</label>
        <input
          type="text"
          className="prop-field__input"
          value={sequence.name}
          onChange={(e) => updateName(e.target.value)}
          data-testid="m6-sequence-name"
        />
      </div>

      <div className="prop-field">
        <label className="prop-field__label">Interval (ms)</label>
        <input
          type="number"
          min={50}
          max={86_400_000}
          className="prop-field__input"
          value={sequence.intervalMs}
          onChange={(e) => updateInterval(Number(e.target.value))}
          data-testid="m6-sequence-interval"
        />
      </div>

      <div className="props-panel__section-title">Slides ({sequence.slides.length})</div>
      {sequence.slides.map((slideId, idx) => (
        <div key={slideId} className="sequence-row" data-testid={`m6-sequence-slide-${idx}`}>
          <span className="sequence-row__idx">{idx + 1}</span>
          <span className="sequence-row__id">{slideId}</span>
          <button
            type="button"
            aria-label="Move up"
            disabled={idx === 0}
            onClick={() => moveSlide(idx, -1)}
            data-testid={`m6-sequence-up-${idx}`}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={idx === sequence.slides.length - 1}
            onClick={() => moveSlide(idx, 1)}
            data-testid={`m6-sequence-down-${idx}`}
          >
            ↓
          </button>
        </div>
      ))}

      <div className="props-panel__section-title">Behavior</div>
      <div className="prop-field">
        <label className="prop-field__label">
          <input
            type="checkbox"
            checked={sequence.pauseOnEvent}
            onChange={(e) => updatePauseOnEvent(e.target.checked)}
            data-testid="m6-sequence-pause-on-event"
          />
          {' '}Pause on event
        </label>
      </div>
      <div className="prop-field">
        <label className="prop-field__label">
          <input
            type="checkbox"
            checked={sequence.loop}
            onChange={(e) => updateLoop(e.target.checked)}
            data-testid="m6-sequence-loop"
          />
          {' '}Loop
        </label>
      </div>
      <div className="prop-field">
        <label className="prop-field__label">Plays (count)</label>
        <input
          type="number"
          min={1}
          max={1024}
          className="prop-field__input"
          value={sequence.count}
          onChange={(e) => updateCount(Number(e.target.value))}
          data-testid="m6-sequence-count"
        />
      </div>
      <div className="prop-field">
        <label className="prop-field__label">Interruption policy</label>
        <select
          value={sequence.interruptionPolicy}
          onChange={(e) => updatePolicy(e.target.value as InterruptionPolicy)}
          data-testid="m6-sequence-policy"
        >
          {POLICIES.map((p) => (
            <option key={p.value} value={p.value} title={p.description}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="prop-field">
        <label className="prop-field__label">
          <input
            type="checkbox"
            checked={sequence.reducedMotionDefaultOff}
            onChange={(e) => updateReducedMotion(e.target.checked)}
            data-testid="m6-sequence-reduced-motion"
          />
          {' '}Default off when prefers-reduced-motion
        </label>
      </div>
      <div className="prop-field">
        <label className="prop-field__label">
          Pause warn at ({formatDuration(sequence.pauseWarnAtMs)})
        </label>
        <input
          type="number"
          min={1000}
          max={7_200_000}
          className="prop-field__input"
          value={sequence.pauseWarnAtMs}
          onChange={(e) => updatePauseWarn(Number(e.target.value))}
          data-testid="m6-sequence-pause-warn"
        />
      </div>

      {onDelete && (
        <button
          type="button"
          className="prop-control__remove"
          onClick={onDelete}
          data-testid="m6-sequence-delete"
        >
          Delete sequence
        </button>
      )}
    </div>
  );
}

export type { SequenceInspectorPanelProps };
