'use client';

/**
 * VirtualBackgroundSelector — picker for camera background.
 *
 * Per Wave 4 §S4.6 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Three modes:
 *   - "none": pass-through (no processing)
 *   - "blur": gaussian-style blur over the background
 *   - "image": replace with a chosen stock image
 *
 * Real segmentation lives in @domio/annotation-engine's segmentation
 * module; this component only exposes the picker + emits the choice to
 * the parent. The PiPBubble reads `virtualBackground` from props.
 */

import { useCallback, type ReactElement } from 'react';

export type VirtualBackgroundMode = 'none' | 'blur' | 'image';

export interface VirtualBackgroundOption {
  readonly id: string;
  readonly label: string;
  readonly mode: VirtualBackgroundMode;
  /** For mode='image', the asset URL. */
  readonly imageUrl?: string;
}

export interface VirtualBackgroundSelectorProps {
  readonly options: readonly VirtualBackgroundOption[];
  readonly activeId: string | null;
  readonly disabled?: boolean;
  readonly onChange: (optionId: string) => void;
  readonly dataTestId?: string;
}

export function VirtualBackgroundSelector({
  options,
  activeId,
  disabled = false,
  onChange,
  dataTestId = 'virtual-background-selector',
}: VirtualBackgroundSelectorProps): ReactElement {
  const handleClick = useCallback(
    (id: string) => {
      if (disabled) return;
      onChange(id);
    },
    [disabled, onChange],
  );

  return (
    <div
      data-testid={dataTestId}
      role="radiogroup"
      aria-label="Virtual background"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
        gap: 6,
      }}
    >
      {options.map((opt) => {
        const active = opt.id === activeId;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => handleClick(opt.id)}
            data-testid={`${dataTestId}-option-${opt.id}`}
            style={{
              padding: 6,
              border: `1px solid ${active ? 'var(--success)' : 'var(--border-subtle)'}`,
              borderRadius: 4,
              background: active ? 'var(--surface-raised)' : 'var(--surface-base)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: 11,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {opt.mode === 'image' && opt.imageUrl ? (
              <img
                src={opt.imageUrl}
                alt=""
                style={{ width: '100%', height: 40, objectFit: 'cover', borderRadius: 2 }}
              />
            ) : (
              <span style={{ fontSize: 16 }} aria-hidden>
                {opt.mode === 'none' ? '∅' : opt.mode === 'blur' ? '▒' : '🖼'}
              </span>
            )}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
