'use client';

/**
 * ProfilePicker — display profile picker with auto-detect + LED-wall custom.
 *
 * Per Wave 4 §S4.10 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Sister component to ProfileSelector: ProfileSelector ships the four
 * canonical presets and lives in the sidebar; ProfilePicker is the
 * richer dialog used when a presenter opens "Display settings" — it
 * adds:
 *   - Auto-detected resolution from the current `screen` / available
 *     Presentation API displays.
 *   - LED-wall custom resolution inputs (width × height × refresh).
 *   - 21:9 ultrawide preset.
 *   - Color-profile picker (sRGB / Display P3 / Rec.2020) + HDR toggle.
 *
 * Persists the chosen snapshot to localStorage keyed by `actorId`.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { DisplayProfileSnapshot } from '../../runtime/types';

export const LED_WALL_PROFILES = ['srgb', 'display_p3', 'rec2020'] as const;
export type LedWallColor = (typeof LED_WALL_PROFILES)[number];

export interface ProfilePickerProps {
  readonly actorId: string;
  readonly initial?: DisplayProfileSnapshot;
  readonly onChange?: (snapshot: DisplayProfileSnapshot) => void;
  readonly dataTestId?: string;
}

interface CustomDraft {
  width: number;
  height: number;
  refresh: number;
  color: LedWallColor;
  hdr: boolean;
}

const STORAGE_KEY = 'domio:profile-picker:v1';

function loadSnapshot(actorId: string): DisplayProfileSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:${actorId}`);
    return raw ? (JSON.parse(raw) as DisplayProfileSnapshot) : null;
  } catch {
    return null;
  }
}

function persistSnapshot(actorId: string, snap: DisplayProfileSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_KEY}:${actorId}`, JSON.stringify(snap));
  } catch {
    /* ignore quota / private mode */
  }
}

function detectAuto(): { width: number; height: number; refresh: number } | null {
  if (typeof window === 'undefined') return null;
  // Prefer the largest connected screen's resolution.
  const screens = window.screen ? [window.screen] : [];
  if (screens.length === 0) return null;
  const widest = screens.reduce((acc, s) => (s.width * s.height > acc.width * acc.height ? s : acc), screens[0]!);
  return {
    width: widest.width,
    height: widest.height,
    refresh: 60,
  };
}

export function ProfilePicker({
  actorId,
  initial,
  onChange,
  dataTestId = 'profile-picker',
}: ProfilePickerProps): ReactElement {
  const [snapshot, setSnapshot] = useState<DisplayProfileSnapshot | null>(initial ?? null);
  const [draft, setDraft] = useState<CustomDraft>({
    width: 3840,
    height: 2160,
    refresh: 60,
    color: 'rec2020',
    hdr: true,
  });
  const [autoDetected, setAutoDetected] = useState<{ width: number; height: number; refresh: number } | null>(null);

  useEffect(() => {
    const stored = loadSnapshot(actorId);
    if (stored) setSnapshot(stored);
    setAutoDetected(detectAuto());
  }, [actorId]);

  const apply = useCallback(
    (next: DisplayProfileSnapshot) => {
      setSnapshot(next);
      persistSnapshot(actorId, next);
      onChange?.(next);
    },
    [actorId, onChange],
  );

  const chooseUltrawide = useCallback(() => {
    apply({
      name: 'ultrawide-21x9',
      width: 3440,
      height: 1440,
      refresh_hz: 100,
      color_profile: 'display_p3',
      hdr: false,
      bandwidth_estimate_mbps: 180,
      mirror_mode: 'extend',
    });
  }, [apply]);

  const chooseAuto = useCallback(() => {
    const det = autoDetected ?? detectAuto();
    if (!det) return;
    apply({
      name: `auto-${det.width}x${det.height}`,
      width: det.width,
      height: det.height,
      refresh_hz: det.refresh,
      color_profile: 'srgb',
      hdr: false,
      bandwidth_estimate_mbps: Math.round((det.width * det.height * det.refresh) / 1_000_000),
      mirror_mode: 'extend',
    });
  }, [autoDetected, apply]);

  const chooseLedWall = useCallback(() => {
    apply({
      name: `led-wall-${draft.width}x${draft.height}`,
      width: draft.width,
      height: draft.height,
      refresh_hz: draft.refresh,
      color_profile: draft.color,
      hdr: draft.hdr,
      bandwidth_estimate_mbps: Math.round(
        (draft.width * draft.height * draft.refresh * (draft.hdr ? 2 : 1)) / 1_000_000,
      ),
      mirror_mode: 'audience_only',
    });
  }, [draft, apply]);

  const summary = useMemo(() => {
    if (!snapshot) return 'No profile selected';
    const hdr = snapshot.hdr ? ' · HDR' : '';
    return `${snapshot.name} — ${snapshot.width}×${snapshot.height}@${snapshot.refresh_hz}Hz · ${snapshot.color_profile}${hdr}`;
  }, [snapshot]);

  return (
    <section
      data-testid={dataTestId}
      data-active={snapshot?.name ?? ''}
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: 12,
        background: 'var(--surface-base)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 13 }}>Display profile</strong>
        <span
          data-testid={`${dataTestId}-summary`}
          style={{ fontSize: 11, color: 'var(--content-secondary)' }}
        >
          {summary}
        </span>
      </header>

      <div role="radiogroup" aria-label="Display profile presets" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          type="button"
          role="radio"
          aria-checked={snapshot?.name === `auto-${autoDetected?.width ?? 0}x${autoDetected?.height ?? 0}`}
          data-testid={`${dataTestId}-auto`}
          onClick={chooseAuto}
          disabled={!autoDetected}
          style={btnStyle}
        >
          Auto-detected
          {autoDetected && (
            <span style={subStyle}>
              {autoDetected.width}×{autoDetected.height}@{autoDetected.refresh}Hz
            </span>
          )}
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={snapshot?.name === 'ultrawide-21x9'}
          data-testid={`${dataTestId}-ultrawide`}
          onClick={chooseUltrawide}
          style={btnStyle}
        >
          Ultrawide 21:9
          <span style={subStyle}>3440×1440@100Hz · Display P3</span>
        </button>

        <div
          data-testid={`${dataTestId}-led-wall`}
          style={{
            border: '1px dashed var(--border-subtle)',
            borderRadius: 6,
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <strong style={{ fontSize: 12 }}>LED-wall (custom)</strong>
          <div style={{ display: 'flex', gap: 6 }}>
            <NumberField
              label="W"
              value={draft.width}
              onChange={(v) => setDraft((d) => ({ ...d, width: v }))}
              min={640}
              max={15360}
            />
            <NumberField
              label="H"
              value={draft.height}
              onChange={(v) => setDraft((d) => ({ ...d, height: v }))}
              min={480}
              max={8640}
            />
            <NumberField
              label="Hz"
              value={draft.refresh}
              onChange={(v) => setDraft((d) => ({ ...d, refresh: v }))}
              min={24}
              max={240}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: 'var(--content-secondary)' }}>Color</label>
            <select
              value={draft.color}
              onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value as LedWallColor }))}
              data-testid={`${dataTestId}-color`}
              style={selectStyle}
            >
              {LED_WALL_PROFILES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={draft.hdr}
                onChange={(e) => setDraft((d) => ({ ...d, hdr: e.target.checked }))}
                data-testid={`${dataTestId}-hdr`}
              />
              HDR
            </label>
          </div>
          <button
            type="button"
            onClick={chooseLedWall}
            data-testid={`${dataTestId}-led-wall-apply`}
            style={{ ...btnStyle, background: 'var(--info)', color: 'var(--content-inverse)' }}
          >
            Apply LED-wall profile
          </button>
        </div>
      </div>
    </section>
  );
}

const btnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  textAlign: 'left',
  padding: '8px 10px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 4,
  background: 'var(--surface-raised)',
  color: 'var(--content-primary)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
};

const subStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 400,
  color: 'var(--content-secondary)',
  marginTop: 2,
};

const selectStyle: React.CSSProperties = {
  padding: '2px 4px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 3,
  background: 'var(--surface-raised)',
  color: 'var(--content-primary)',
  fontSize: 11,
};

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function NumberField({ label, value, min, max, onChange }: NumberFieldProps): ReactElement {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', fontSize: 10, color: 'var(--content-secondary)', flex: 1 }}>
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min);
        }}
        style={{
          padding: '2px 4px',
          border: '1px solid var(--border-subtle)',
          borderRadius: 3,
          background: 'var(--surface-raised)',
          color: 'var(--content-primary)',
          fontSize: 12,
        }}
      />
    </label>
  );
}