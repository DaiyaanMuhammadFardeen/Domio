'use client';

/**
 * GestureMapEditor — UI to remap gestures to slide actions.
 *
 * Per Wave 11 §S11.4 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Two columns:
 *   - Left: every supported gesture kind.
 *   - Right: the action it maps to (dropdown of all actions).
 *
 * Saves via the supplied `onSave` callback. The editor is purely a
 * local form — the parent owns the persistence call (typically
 * `saveGestureMap`).
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

import {
  ALL_GESTURE_ACTIONS,
  ALL_GESTURE_KINDS,
  DEFAULT_GESTURE_MAP,
  type GestureAction,
  type GestureKind,
  type GestureMap,
  defaultMappings,
} from '../../lib/gesture-service';

export interface GestureMapEditorProps {
  /** Initial map. If omitted the editor seeds itself with the defaults. */
  readonly initial?: Pick<GestureMap, 'mappings'> | undefined;
  /** Called when the presenter presses "Save map". */
  readonly onSave: (map: Pick<GestureMap, 'mappings'>) => void | Promise<void>;
  readonly dataTestId?: string;
}

const GESTURE_LABEL_KEYS: Record<GestureKind, string> = {
  open_palm: 'presenter.gesture.editor.openPalm',
  fist: 'presenter.gesture.editor.fist',
  swipe_left: 'presenter.gesture.editor.swipeLeft',
  swipe_right: 'presenter.gesture.editor.swipeRight',
  thumbs_up: 'presenter.gesture.editor.thumbsUp',
  peace_sign: 'presenter.gesture.editor.peaceSign',
};

const ACTION_LABEL_KEYS: Record<GestureAction, string> = {
  advance: 'advance',
  back: 'back',
  next_section: 'next_section',
  prev_section: 'prev_section',
  start_poll: 'start_poll',
  end_poll: 'end_poll',
  mute: 'mute',
  unmute: 'unmute',
};

export function GestureMapEditor({
  initial,
  onSave,
  dataTestId = 'gesture-map-editor',
}: GestureMapEditorProps): ReactElement {
  const [mappings, setMappings] = useState<Record<GestureKind, GestureAction>>(() => ({
    ...(initial?.mappings ?? defaultMappings()),
  }));
  const [savedTick, setSavedTick] = useState(0);

  // Re-seed when the initial prop changes (e.g. after async load).
  useEffect(() => {
    if (initial?.mappings) {
      setMappings({ ...DEFAULT_GESTURE_MAP, ...initial.mappings });
    }
  }, [initial]);

  const onChange = useCallback((gesture: GestureKind, action: GestureAction) => {
    setMappings((prev) => ({ ...prev, [gesture]: action }));
    setSavedTick(0);
  }, []);

  const onReset = useCallback(() => {
    setMappings({ ...defaultMappings() });
    setSavedTick(0);
  }, []);

  const onPressSave = useCallback(async () => {
    await onSave({ mappings });
    setSavedTick((tick) => tick + 1);
  }, [mappings, onSave]);

  const rows = useMemo(() => ALL_GESTURE_KINDS, []);

  return (
    <section
      data-testid={dataTestId}
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        padding: 12,
        background: 'var(--surface-base)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
          <FormattedMessage id="presenter.gesture.editor.heading" />
        </h3>
        <button
          type="button"
          onClick={onReset}
          data-testid={`${dataTestId}-reset`}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            border: '1px solid var(--border-subtle)',
            background: 'var(--surface-raised)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          fontSize: 12,
        }}
      >
        <div style={{ fontWeight: 600, opacity: 0.7 }}>
          <FormattedMessage id="presenter.gesture.editor.gesture" />
        </div>
        <div style={{ fontWeight: 600, opacity: 0.7 }}>
          <FormattedMessage id="presenter.gesture.editor.action" />
        </div>

        {rows.map((gesture) => (
          <RowFragment
            key={gesture}
            gesture={gesture}
            value={mappings[gesture]}
            onChange={onChange}
            testIdPrefix={dataTestId}
          />
        ))}
      </div>

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 12,
        }}
      >
        <button
          type="button"
          onClick={onPressSave}
          data-testid={`${dataTestId}-save`}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            border: '1px solid var(--accent-primary)',
            background: 'var(--accent-primary)',
            color: 'var(--content-inverse)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          <FormattedMessage id="presenter.gesture.editor.save" />
        </button>
        {savedTick > 0 && (
          <span
            data-testid={`${dataTestId}-saved`}
            aria-live="polite"
            style={{ fontSize: 11, color: 'var(--success)' }}
          >
            <FormattedMessage id="presenter.gesture.editor.saved" />
          </span>
        )}
      </footer>
    </section>
  );
}

interface RowProps {
  gesture: GestureKind;
  value: GestureAction;
  onChange: (gesture: GestureKind, action: GestureAction) => void;
  testIdPrefix: string;
}

function RowFragment({ gesture, value, onChange, testIdPrefix }: RowProps): ReactElement {
  return (
    <>
      <div style={{ padding: '4px 0' }}>
        <FormattedMessage id={GESTURE_LABEL_KEYS[gesture]} />
      </div>
      <div style={{ padding: '4px 0' }}>
        <select
          aria-label={gesture}
          data-testid={`${testIdPrefix}-select-${gesture}`}
          value={value}
          onChange={(e) => onChange(gesture, e.target.value as GestureAction)}
          style={{
            width: '100%',
            padding: '4px 6px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid var(--border-subtle)',
            background: 'var(--surface-base)',
          }}
        >
          {ALL_GESTURE_ACTIONS.map((action) => (
            <option key={action} value={action}>
              <FormattedMessage id={ACTION_LABEL_KEYS[action]} />
            </option>
          ))}
        </select>
      </div>
    </>
  );
}