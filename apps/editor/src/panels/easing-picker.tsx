'use client';

/**
 * EasingPicker — reusable easing selector used by both timeline keyframes
 * and the slide transition inspector. Validates cubic-bezier input and
 * renders a mini preview of the curve.
 */

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';

export interface EasingOption {
  value: string;
  label: string;
}

export const EASING_PRESETS: EasingOption[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease in' },
  { value: 'ease-out', label: 'Ease out' },
  { value: 'ease-in-out', label: 'Ease in-out' },
  { value: 'spring', label: 'Spring' },
  { value: 'bounce', label: 'Bounce' },
];

const BEZIER_REGEX = /^cubic-bezier\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/;

export function validateBezier(value: string): boolean {
  return BEZIER_REGEX.test(value);
}

function parseBezier(value: string): [number, number, number, number] | null {
  const m = BEZIER_REGEX.exec(value);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

function curvePath(p1x: number, p1y: number, p2x: number, p2y: number, size = 40): string {
  // Approximate cubic-bezier with a few segments for the SVG preview
  const steps = 20;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Simplified approximation of cubic bezier
    const u = 1 - t;
    const x = 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t;
    const y = 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t;
    points.push(`${(x * size).toFixed(1)},${((1 - y) * size).toFixed(1)}`);
  }
  return `M ${points[0]} ` + points.slice(1).map((p) => `L ${p}`).join(' ');
}

interface EasingPickerProps {
  value: string;
  onChange: (easing: string) => void;
  presets?: EasingOption[];
  className?: string;
}

export function EasingPicker({
  value,
  onChange,
  presets = EASING_PRESETS,
  className = 'data-panel__add-input',
}: EasingPickerProps): ReactElement {
  const [customInput, setCustomInput] = useState(
    value.startsWith('cubic-bezier') ? value : '',
  );
  const [isCustom, setIsCustom] = useState(() => !presets.some((p) => p.value === value) && value !== '');
  const [error, setError] = useState<string | null>(null);

  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      if (v === '__custom') {
        setIsCustom(true);
        setError(null);
        return;
      }
      setIsCustom(false);
      setCustomInput('');
      setError(null);
      onChange(v);
    },
    [onChange],
  );

  const handleCustomBlur = useCallback(() => {
    if (!customInput.trim()) return;
    if (validateBezier(customInput.trim())) {
      setError(null);
      onChange(customInput.trim());
    } else {
      setError('Invalid cubic-bezier curve');
    }
  }, [customInput, onChange]);

  const bezier = parseBezier(customInput || value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select
          className={className}
          value={isCustom ? '__custom' : value}
          onChange={handlePresetChange}
          data-testid="p09-easing-select"
          style={{ flex: 1 }}
        >
          {presets.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
          <option value="__custom">Custom (cubic-bezier)</option>
        </select>
        {/* Mini curve preview */}
        <svg width={40} height={40} viewBox="0 0 40 40" style={{ flexShrink: 0, border: '1px solid var(--border, #333)', borderRadius: 4, background: 'var(--bg-secondary, #1a1a1a)' }}>
          <path
            d={bezier
              ? curvePath(bezier[0], bezier[1], bezier[2], bezier[3])
              : value === 'spring'
                ? 'M 0,40 C 10,40 15,0 20,5 C 25,10 30,0 35,2 L 40,0'
                : value === 'bounce'
                  ? 'M 0,40 L 15,5 L 20,35 L 28,10 L 32,30 L 40,0'
                  : value === 'linear'
                    ? 'M 0,40 L 40,0'
                    : value === 'ease-in'
                      ? 'M 0,40 C 20,40 30,20 40,0'
                      : value === 'ease-out'
                        ? 'M 0,40 C 10,30 20,0 40,0'
                        : 'M 0,40 C 10,40 30,0 40,0'}
            fill="none"
            stroke="var(--accent, #58a6ff)"
            strokeWidth={2}
          />
          <line x1={0} y1={40} x2={40} y2={0} stroke="var(--muted, #666)" strokeWidth={0.5} strokeDasharray="2,2" />
        </svg>
      </div>
      {isCustom && (
        <div>
          <input
            className={className}
            placeholder="cubic-bezier(0.25, 0.1, 0.25, 1)"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onBlur={handleCustomBlur}
            data-testid="p09-easing-custom"
            style={{ width: '100%' }}
          />
          {error && (
            <div style={{ color: 'var(--error, #f85149)', fontSize: 11, marginTop: 2 }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
