'use client';

/**
 * HapticPatternEditor — UI for editing a single VibrationPattern.
 *
 * Per Wave 11 §S11.13 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * A pattern is a list of pulses (vibrate_ms, pause_ms). This editor:
 *   • Lets the user set the pattern name.
 *   • Add / remove pulses.
 *   • Edit each pulse's vibrate_ms and pause_ms inline.
 *   • Preview the pattern immediately via the Vibration API.
 *   • Save the pattern via the supplied `onSave` callback.
 *
 * The component is purely a form — the parent owns persistence (typically
 * `savePattern` from the haptics service).
 */

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

import {
  type VibrationPattern,
  type VibrationPulse,
  SHORT_PATTERN,
  savePattern,
  triggerVibrate,
} from '../lib/haptics-service';

export interface HapticPatternEditorProps {
  /** Initial pattern. If omitted, a fresh blank pattern is seeded. */
  readonly initial?: VibrationPattern;
  /** Called when the user presses "Save". */
  readonly onSave?: (pattern: VibrationPattern) => void | Promise<void>;
  readonly dataTestId?: string;
}

function blankPulse(): VibrationPulse {
  return { vibrate_ms: 40, pause_ms: 20 };
}

function toDraft(pattern: VibrationPattern): VibrationPattern {
  return {
    id: pattern.id,
    name: pattern.name,
    pulses: pattern.pulses.map((p) => ({ ...p })),
  };
}

export function HapticPatternEditor({
  initial,
  onSave,
  dataTestId = 'haptic-pattern-editor',
}: HapticPatternEditorProps): ReactElement {
  const [draft, setDraft] = useState<VibrationPattern>(() =>
    toDraft(initial ?? { ...SHORT_PATTERN, id: '', name: 'New pattern' }),
  );
  const [status, setStatus] = useState<
    { kind: 'idle' | 'saved' | 'error'; message?: string }
  >({ kind: 'idle' });

  const totalDurationMs = useMemo(
    () =>
      draft.pulses.reduce(
        (sum, p) => sum + Math.max(0, p.vibrate_ms) + Math.max(0, p.pause_ms),
        0,
      ),
    [draft.pulses],
  );

  const updateName = useCallback((value: string) => {
    setDraft((current) => ({ ...current, name: value }));
    setStatus({ kind: 'idle' });
  }, []);

  const updatePulse = useCallback(
    (index: number, patch: Partial<VibrationPulse>) => {
      setDraft((current) => ({
        ...current,
        pulses: current.pulses.map((p, i) => {
          if (i !== index) return p;
          const next = { ...p, ...patch };
          // Coerce to non-negative integers; fall back to 0 on garbage.
          const v = Number(next.vibrate_ms);
          const w = Number(next.pause_ms);
          return {
            vibrate_ms: Number.isFinite(v) && v >= 0 ? Math.round(v) : 0,
            pause_ms: Number.isFinite(w) && w >= 0 ? Math.round(w) : 0,
          };
        }),
      }));
      setStatus({ kind: 'idle' });
    },
    [],
  );

  const addPulse = useCallback(() => {
    setDraft((current) => ({
      ...current,
      pulses: [...current.pulses, blankPulse()],
    }));
    setStatus({ kind: 'idle' });
  }, []);

  const removePulse = useCallback((index: number) => {
    setDraft((current) => ({
      ...current,
      pulses: current.pulses.filter((_, i) => i !== index),
    }));
    setStatus({ kind: 'idle' });
  }, []);

  const onPreview = useCallback(() => {
    triggerVibrate(draft);
  }, [draft]);

  const onSaveClick = useCallback(async () => {
    try {
      const saved = await savePattern(draft);
      setDraft(saved);
      setStatus({ kind: 'saved' });
      await onSave?.(saved);
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Save failed' });
    }
  }, [draft, onSave]);

  return (
    <section
      data-testid={dataTestId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        border: '1px solid var(--border-subtle, #e2e8f0)',
        borderRadius: 6,
        background: 'var(--surface-base, #fff)',
        color: 'var(--content-primary, #1a1a1a)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>
          <FormattedMessage id="presenter.haptics.patterns.heading" />
        </h3>
        <span style={{ fontSize: 11, color: 'var(--content-muted, #6b7280)' }}>
          {totalDurationMs}ms total
        </span>
      </header>

      <label
        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
      >
        <FormattedMessage id="presenter.haptics.patterns.name" />
        <input
          type="text"
          value={draft.name}
          onChange={(e) => updateName(e.target.value)}
          data-testid={`${dataTestId}-name`}
          style={{
            flex: 1,
            padding: '4px 6px',
            fontSize: 12,
            border: '1px solid var(--border-subtle, #e2e8f0)',
            borderRadius: 4,
            background: 'var(--surface-base, #fff)',
            color: 'var(--content-primary, #1a1a1a)',
          }}
        />
      </label>

      <div style={{ fontSize: 11, fontWeight: 700 }}>
        <FormattedMessage id="presenter.haptics.patterns.pulses" />
      </div>
      <div
        role="list"
        data-testid={`${dataTestId}-pulses`}
        style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        {draft.pulses.length === 0 && (
          <div
            role="listitem"
            style={{ fontSize: 11, opacity: 0.7, fontStyle: 'italic' }}
          >
            No pulses — add one below.
          </div>
        )}
        {draft.pulses.map((pulse, index) => (
          <div
            role="listitem"
            key={index}
            data-testid={`${dataTestId}-pulse-${index}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 6px',
              border: '1px dashed var(--border-subtle, #e2e8f0)',
              borderRadius: 4,
            }}
          >
            <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <FormattedMessage
                id="presenter.haptics.patterns.pulse.vibrate"
                values={{ ms: Math.max(0, pulse.vibrate_ms) }}
              />
              <input
                type="number"
                min={0}
                step={5}
                value={pulse.vibrate_ms}
                onChange={(e) =>
                  updatePulse(index, { vibrate_ms: Number(e.target.value) })
                }
                data-testid={`${dataTestId}-pulse-${index}-vibrate`}
                style={{ width: 64, padding: '2px 4px', fontSize: 11 }}
              />
            </label>
            <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <FormattedMessage
                id="presenter.haptics.patterns.pulse.pause"
                values={{ ms: Math.max(0, pulse.pause_ms) }}
              />
              <input
                type="number"
                min={0}
                step={5}
                value={pulse.pause_ms}
                onChange={(e) =>
                  updatePulse(index, { pause_ms: Number(e.target.value) })
                }
                data-testid={`${dataTestId}-pulse-${index}-pause`}
                style={{ width: 64, padding: '2px 4px', fontSize: 11 }}
              />
            </label>
            <button
              type="button"
              onClick={() => removePulse(index)}
              aria-label="Remove pulse"
              data-testid={`${dataTestId}-pulse-${index}-remove`}
              style={{
                marginLeft: 'auto',
                padding: '2px 6px',
                border: '1px solid var(--border-subtle, #e2e8f0)',
                borderRadius: 4,
                background: 'transparent',
                color: 'var(--content-primary, #1a1a1a)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={addPulse}
          data-testid={`${dataTestId}-add`}
          style={{
            padding: '4px 10px',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            borderRadius: 4,
            background: 'transparent',
            color: 'var(--content-primary, #1a1a1a)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + <FormattedMessage id="presenter.haptics.patterns.add" />
        </button>
        <button
          type="button"
          onClick={onPreview}
          data-testid={`${dataTestId}-preview`}
          style={{
            padding: '4px 10px',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            borderRadius: 4,
            background: 'transparent',
            color: 'var(--content-primary, #1a1a1a)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ▶ <FormattedMessage id="presenter.haptics.patterns.preview" />
        </button>
        <button
          type="button"
          onClick={onSaveClick}
          data-testid={`${dataTestId}-save`}
          style={{
            marginLeft: 'auto',
            padding: '4px 12px',
            border: 'none',
            borderRadius: 4,
            background: 'var(--accent-primary, #6366f1)',
            color: 'var(--content-inverse, #fff)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <FormattedMessage id="presenter.haptics.patterns.save" />
        </button>
      </div>

      {status.kind === 'saved' && (
        <div
          role="status"
          data-testid={`${dataTestId}-status`}
          aria-live="polite"
          style={{ fontSize: 11, color: 'var(--success, #2e7d32)' }}
        >
          <FormattedMessage id="presenter.haptics.patterns.saved" />
        </div>
      )}
      {status.kind === 'error' && (
        <div
          role="alert"
          data-testid={`${dataTestId}-error`}
          style={{ fontSize: 11, color: 'var(--danger, #b00020)' }}
        >
          {status.message}
        </div>
      )}
    </section>
  );
}
