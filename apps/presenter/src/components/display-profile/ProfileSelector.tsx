'use client';

/**
 * ProfileSelector — Display profile picker.
 *
 * Phase 15 W14. The four profiles:
 *   - Standard  (1920×1080, sRGB, extend) — normal dual-screen.
 *   - Stage     (large venue projection, 60Hz, extend).
 *   - Recording (capture-optimised: shadow + watermark on).
 *   - Kiosk     (single-screen, clone mode, brighter palette).
 *
 * The selector persists the choice to localStorage keyed by `actor_id`,
 * so a presenter's profile follows them across sessions.
 */

import { useCallback, useEffect, useState } from 'react';
import type { DisplayProfileSnapshot } from '../../runtime/types';

export const PROFILES: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  snapshot: DisplayProfileSnapshot;
}> = [
  {
    id: 'standard',
    label: 'Standard',
    description: '1920×1080, sRGB, dual-screen extend.',
    snapshot: {
      name: '1080p',
      width: 1920,
      height: 1080,
      refresh_hz: 60,
      color_profile: 'srgb',
      hdr: false,
      bandwidth_estimate_mbps: 50,
      mirror_mode: 'extend',
    },
  },
  {
    id: 'stage',
    label: 'Stage',
    description: '3840×2160 stage projection; high-bandwidth.',
    snapshot: {
      name: '4K-stage',
      width: 3840,
      height: 2160,
      refresh_hz: 60,
      color_profile: 'rec2020',
      hdr: true,
      bandwidth_estimate_mbps: 220,
      mirror_mode: 'extend',
    },
  },
  {
    id: 'recording',
    label: 'Recording',
    description: '1440p capture; watermark + shadow enabled.',
    snapshot: {
      name: '1440p-rec',
      width: 2560,
      height: 1440,
      refresh_hz: 30,
      color_profile: 'srgb',
      hdr: false,
      bandwidth_estimate_mbps: 90,
      mirror_mode: 'audience_only',
    },
  },
  {
    id: 'kiosk',
    label: 'Kiosk',
    description: 'Single-screen clone; bright palette.',
    snapshot: {
      name: 'kiosk-1080p',
      width: 1920,
      height: 1080,
      refresh_hz: 60,
      color_profile: 'srgb',
      hdr: false,
      bandwidth_estimate_mbps: 30,
      mirror_mode: 'clone',
    },
  },
];

const STORAGE_KEY = 'domio:display-profile:v1';

export function loadStoredProfile(actorId: string): string {
  if (typeof window === 'undefined') return 'standard';
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:${actorId}`);
    if (!raw) return 'standard';
    return PROFILES.find((p) => p.id === raw)?.id ?? 'standard';
  } catch {
    return 'standard';
  }
}

export function persistProfile(actorId: string, id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_KEY}:${actorId}`, id);
  } catch {
    /* ignore quota / private mode */
  }
}

export interface ProfileSelectorProps {
  actorId: string;
  onChange?: (snapshot: DisplayProfileSnapshot, id: string) => void;
}

export function ProfileSelector({ actorId, onChange }: ProfileSelectorProps) {
  const [active, setActive] = useState<string>('standard');

  useEffect(() => {
    setActive(loadStoredProfile(actorId));
  }, [actorId]);

  const choose = useCallback(
    (id: string) => {
      const found = PROFILES.find((p) => p.id === id);
      if (!found) return;
      setActive(id);
      persistProfile(actorId, id);
      onChange?.(found.snapshot, id);
    },
    [actorId, onChange],
  );

  return (
    <div className="profile-selector" role="radiogroup" aria-label="Display profile">
      <div className="profile-selector__title">Display profile</div>
      <div className="profile-selector__list">
        {PROFILES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={active === p.id}
            className={`profile-selector__option${active === p.id ? ' profile-selector__option--active' : ''}`}
            onClick={() => choose(p.id)}
          >
            <span className="profile-selector__label">{p.label}</span>
            <span className="profile-selector__desc">{p.description}</span>
            <span className="profile-selector__spec">
              {p.snapshot.width}×{p.snapshot.height}@{p.snapshot.refresh_hz}Hz ·{' '}
              {p.snapshot.color_profile}
              {p.snapshot.hdr ? ' · HDR' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
