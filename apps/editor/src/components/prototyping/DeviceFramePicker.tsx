/**
 * DeviceFramePicker — Wave 2 §S2.12.
 *
 * Picker for device-frame presets used by the editor preview and the
 * web viewer. The list comes from `DeviceFrameRegistry` in
 * `@domio/prototype-runtime/device-frames`.
 *
 * Two display modes:
 *  - 'list' — vertical list of frame names with dimensions
 *  - 'grid' — visual grid of miniature frames
 *
 * Selecting a frame emits `onChange(spec)` so the host can drive
 * the preview iframe's viewport size.
 */

import { useState, type ReactElement } from 'react';
import { DEFAULT_DEVICE_FRAMES, type DeviceFrameSpec } from '@domio/prototype-runtime';

export type DeviceFrameDisplay = 'list' | 'grid';

export interface DeviceFramePickerProps {
  readonly initialId?: string;
  readonly frames?: readonly DeviceFrameSpec[];
  readonly display?: DeviceFrameDisplay;
  readonly onChange?: (spec: DeviceFrameSpec) => void;
}

export function DeviceFramePicker({
  initialId,
  frames = DEFAULT_DEVICE_FRAMES,
  display = 'list',
  onChange,
}: DeviceFramePickerProps): ReactElement {
  const [selected, setSelected] = useState<string>(initialId ?? frames[0]?.id ?? '');

  const pick = (id: string): void => {
    setSelected(id);
    const spec = frames.find((f) => f.id === id);
    if (spec && onChange) onChange(spec);
  };

  if (display === 'grid') {
    return (
      <div
        className="prototyping-device-frame-picker"
        data-testid="prototyping-device-frame-picker"
      >
        <div style={{ fontSize: 11, color: 'var(--muted, #888)', marginBottom: 4 }}>
          Device frame
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
          }}
        >
          {frames.map((f) => {
            const isSelected = selected === f.id;
            const aspect = f.height / f.width;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => pick(f.id)}
                style={{
                  padding: 6,
                  background: 'var(--bg-secondary, #111)',
                  border: `1px solid ${isSelected ? 'var(--accent, #58a6ff)' : 'var(--border, #333)'}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
                data-testid={`device-frame-${f.id}`}
                title={`${f.width}×${f.height} @${f.dpr}x`}
              >
                <div
                  style={{
                    width: '100%',
                    aspectRatio: aspect < 1 ? `${1 / aspect} / 1` : `1 / ${aspect}`,
                    maxHeight: 60,
                    background: isSelected ? 'rgba(88, 166, 255, 0.2)' : 'var(--bg, #000)',
                    border: '1px solid var(--border, #444)',
                    borderRadius: 4,
                  }}
                  data-testid={`device-frame-preview-${f.id}`}
                />
                <span style={{ fontSize: 10, color: 'var(--fg, #eee)', textAlign: 'center' }}>
                  {f.label}
                </span>
                <span style={{ fontSize: 9, color: 'var(--muted, #888)' }}>
                  {f.width}×{f.height}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="prototyping-device-frame-picker" data-testid="prototyping-device-frame-picker">
      <div style={{ fontSize: 11, color: 'var(--muted, #888)', marginBottom: 4 }}>Device frame</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {frames.map((f) => {
          const isSelected = selected === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => pick(f.id)}
              style={{
                padding: '6px 8px',
                background: isSelected ? 'rgba(88, 166, 255, 0.15)' : 'var(--bg-secondary, #111)',
                border: `1px solid ${isSelected ? 'var(--accent, #58a6ff)' : 'var(--border, #333)'}`,
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: isSelected ? 'var(--accent, #58a6ff)' : 'var(--fg, #eee)',
              }}
              data-testid={`device-frame-${f.id}`}
            >
              <span style={{ fontSize: 12, fontWeight: 500 }}>{f.label}</span>
              <span style={{ fontSize: 10, color: 'var(--muted, #888)' }}>
                {f.width}×{f.height} @ {f.dpr}x
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
