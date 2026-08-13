/**
 * GesturePicker — Wave 2 §S2.12.
 *
 * Multi-select picker for the gesture vocabulary (tap, double-tap,
 * long-press, swipe, hover, focus, etc.) used by hotspots and
 * branching edges in the Connections panel.
 *
 * The runtime side already understands this vocabulary
 * (`connections-panel.tsx` → `gestureMask`).
 */

import type { ReactElement } from 'react';

export type GestureKind =
  | 'click'
  | 'doubleClick'
  | 'longPress'
  | 'rightClick'
  | 'hover'
  | 'focus'
  | 'blur'
  | 'swipeLeft'
  | 'swipeRight'
  | 'swipeUp'
  | 'swipeDown'
  | 'twoFingerTap'
  | 'pinch';

export const GESTURE_LABELS: Readonly<Record<GestureKind, string>> = {
  click: 'Click',
  doubleClick: 'Double-click',
  longPress: 'Long-press',
  rightClick: 'Right-click',
  hover: 'Hover',
  focus: 'Focus',
  blur: 'Blur',
  swipeLeft: 'Swipe left',
  swipeRight: 'Swipe right',
  swipeUp: 'Swipe up',
  swipeDown: 'Swipe down',
  twoFingerTap: '2-finger tap',
  pinch: 'Pinch',
};

export const ALL_GESTURES: readonly GestureKind[] = Object.keys(GESTURE_LABELS) as GestureKind[];

export interface GesturePickerProps {
  readonly value: readonly GestureKind[];
  readonly onChange: (next: readonly GestureKind[]) => void;
  /** When provided, restrict to this subset (e.g. only touch gestures on slide). */
  readonly subset?: readonly GestureKind[];
}

export function GesturePicker({ value, onChange, subset }: GesturePickerProps): ReactElement {
  const available = subset ?? ALL_GESTURES;
  const toggle = (g: GestureKind): void => {
    if (value.includes(g)) {
      onChange(value.filter((x) => x !== g));
    } else {
      onChange([...value, g]);
    }
  };

  return (
    <div className="prototyping-gesture-picker" data-testid="prototyping-gesture-picker">
      <div style={{ fontSize: 11, color: 'var(--muted, #888)', marginBottom: 4 }}>Gestures</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 4,
        }}
      >
        {available.map((g) => {
          const checked = value.includes(g);
          return (
            <button
              key={g}
              type="button"
              onClick={() => toggle(g)}
              style={{
                padding: '6px 8px',
                fontSize: 11,
                background: checked ? 'rgba(88, 166, 255, 0.15)' : 'var(--bg-secondary, #111)',
                color: checked ? 'var(--accent, #58a6ff)' : 'var(--fg, #eee)',
                border: `1px solid ${checked ? 'var(--accent, #58a6ff)' : 'var(--border, #333)'}`,
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'all 0.15s',
                textAlign: 'center',
              }}
              data-testid={`gesture-${g}`}
            >
              {checked ? '✓ ' : ''}
              {GESTURE_LABELS[g]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
