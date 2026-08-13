'use client';

/**
 * PhoneRemote — clicker-style mini-controller surfaced from the
 * pairing QR.
 *
 * Per Wave 4 §S4.2 of docs/frontend-roadmap/04-wave-presenter-live.md,
 * extended in Wave 11 §S11.13 with haptic feedback (slide-advance buzz
 * + per-slide pacing checkpoints).
 *
 * This component lives on the *desktop* (presenter view) — it shows
 * the QR + a "phones connected" list. The phone-side counterpart at
 * `/pair/[token]/page.tsx` opens from scanning the QR. Both halves
 * share state through the realtime gateway subject
 * `realtime.session.{id}.remote` (W3 S3.4).
 *
 * Haptic feedback:
 *   • On slide advance (when a `slideIndex` prop is provided), the
 *     configured advance pattern is fired via the Vibration API.
 *   • For pacing checkpoints, a timer is started when the current
 *     slide is displayed; each checkpoint fires its pattern when the
 *     offset elapses.
 *   • All haptic triggers are best-effort — when the Vibration API is
 *     unavailable (laptop / no browser support) the trigger silently
 *     no-ops.
 *
 * The presenter view can configure patterns + checkpoints via the
 * HapticPatternEditor and PacingCheckpointList panels (also exported
 * from this module). The PhoneRemote settings panel exposes the
 * on/off toggle and the per-slide advance pattern picker.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

import type { PairingInfo } from '../../runtime/types';
import { PhoneRemoteService, type PairedDevice } from '../../lib/phone-remote-service';
import {
  type PacingCheckpoint,
  type VibrationPattern,
  SHORT_PATTERN,
  listPatterns,
  listPacingCheckpoints,
  triggerAdvanceVibrate,
  triggerVibrate,
  getPattern,
} from '../../lib/haptics-service';

export interface PhoneRemoteProps {
  readonly pairing: PairingInfo;
  readonly apiBaseUrl?: string;
  /**
   * Current slide index. When this changes, the configured advance
   * pattern is fired (if haptics are enabled). Optional — omit to
   * suppress slide-advance feedback entirely.
   */
  readonly slideIndex?: number;
  /** Deck id for fetching pacing checkpoints. */
  readonly deckId?: string;
  /** Pattern to use for slide advance buzz. Defaults to the short preset. */
  readonly advancePatternId?: string;
  readonly dataTestId?: string;
}

export type { PairedDevice } from '../../lib/phone-remote-service';
export type { PacingCheckpoint, VibrationPattern, VibrationPulse } from '../../lib/haptics-service';

const POLL_INTERVAL_MS = 5_000;

export function PhoneRemote({
  pairing,
  apiBaseUrl = '',
  slideIndex,
  deckId,
  advancePatternId,
  dataTestId = 'phone-remote',
}: PhoneRemoteProps): ReactElement {
  const [devices, setDevices] = useState<readonly PairedDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [laserEnabled, setLaserEnabled] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [advancePattern, setAdvancePattern] = useState<VibrationPattern>(SHORT_PATTERN);
  const [patterns, setPatterns] = useState<readonly VibrationPattern[]>([]);
  const [checkpoints, setCheckpoints] = useState<readonly PacingCheckpoint[]>([]);
  const lastSlideIndexRef = useRef<number | undefined>(undefined);
  const firedRef = useRef<Set<string>>(new Set());

  const service = useMemo(
    () => new PhoneRemoteService(apiBaseUrl !== undefined ? { apiBaseUrl } : {}),
    [apiBaseUrl],
  );

  const refresh = useCallback(async () => {
    try {
      const list = await service.listDevices(pairing.token);
      setDevices(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load paired devices');
    }
  }, [service, pairing.token]);

  // Resolve the current advance pattern id (prop → short preset).
  const resolvedAdvancePatternId = advancePatternId ?? SHORT_PATTERN.id;

  useEffect(() => {
    let cancelled = false;
    listPatterns().then((list) => {
      if (cancelled) return;
      setPatterns(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve the actual pattern object for the configured advance id.
  useEffect(() => {
    let cancelled = false;
    getPattern(resolvedAdvancePatternId).then((p) => {
      if (cancelled) return;
      setAdvancePattern(p ?? SHORT_PATTERN);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedAdvancePatternId]);

  // Fetch pacing checkpoints for the active deck.
  useEffect(() => {
    if (!deckId) {
      setCheckpoints([]);
      return;
    }
    let cancelled = false;
    listPacingCheckpoints(deckId).then((cps) => {
      if (cancelled) return;
      setCheckpoints(cps);
    });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  useEffect(() => {
    void refresh();
    const handle = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [refresh]);

  // Fire the advance pattern when the slide index changes.
  useEffect(() => {
    if (typeof slideIndex !== 'number') return;
    if (!hapticsEnabled) {
      lastSlideIndexRef.current = slideIndex;
      firedRef.current.clear();
      return;
    }
    const prev = lastSlideIndexRef.current;
    if (prev !== slideIndex) {
      if (prev !== undefined) {
        triggerAdvanceVibrate(advancePattern);
      }
      lastSlideIndexRef.current = slideIndex;
      firedRef.current.clear();
    }
  }, [slideIndex, hapticsEnabled, advancePattern]);

  // Pacing checkpoints — fire when the offset elapses while on the same
  // slide. Each (slide, checkpoint) is fired at most once per visit.
  useEffect(() => {
    if (typeof slideIndex !== 'number') return;
    if (!hapticsEnabled) return;
    if (checkpoints.length === 0) return;
    const slideKey = String(slideIndex);
    const matching = checkpoints.filter((c) => c.slide_id === slideKey);
    if (matching.length === 0) return;
    const handles: ReturnType<typeof setTimeout>[] = [];
    for (const cp of matching) {
      const tag = `${cp.id}@${slideKey}`;
      if (firedRef.current.has(tag)) continue;
      const delayMs = Math.max(0, cp.time_offset_sec * 1000);
      const handle = setTimeout(async () => {
        if (firedRef.current.has(tag)) return;
        firedRef.current.add(tag);
        const pattern = await getPattern(cp.pattern_id);
        if (pattern) triggerVibrate(pattern);
      }, delayMs);
      handles.push(handle);
    }
    return () => {
      for (const handle of handles) clearTimeout(handle);
    };
  }, [slideIndex, checkpoints, hapticsEnabled]);

  const qrUrl = pairing.deep_link;

  const hapticCapableCount = useMemo(
    () => devices.filter((d) => d.supports_haptics).length,
    [devices],
  );

  return (
    <section
      data-testid={dataTestId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        background: 'var(--surface-base)',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>📱 Phone remote</strong>
        <span
          data-testid={`${dataTestId}-count`}
          style={{ fontSize: 11, color: 'var(--content-muted)' }}
        >
          {devices.length} connected
        </span>
      </header>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          data-testid={`${dataTestId}-qr`}
          aria-label="Pairing QR"
          style={{
            width: 96,
            height: 96,
            flexShrink: 0,
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: 'var(--content-muted)',
            textAlign: 'center',
            padding: 4,
            overflow: 'hidden',
            wordBreak: 'break-all',
          }}
          title={qrUrl}
        >
          {qrUrl}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--content-secondary)' }}>
          Scan with a phone camera to use it as a clicker, laser pointer, whisper channel, and notes
          viewer. The phone stays connected while this tab is open.
        </div>
      </div>

      {devices.length > 0 && (
        <ul
          data-testid={`${dataTestId}-device-list`}
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {devices.map((d) => (
            <li
              key={d.device_id}
              data-testid={`${dataTestId}-device-${d.device_id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                padding: '4px 6px',
                background: 'var(--surface-base)',
                borderRadius: 4,
              }}
            >
              <span>{d.display_name}</span>
              <span style={{ color: 'var(--content-muted)' }}>
                {d.supports_haptics ? 'haptics ✓' : 'haptics ✗'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
        <input
          type="checkbox"
          checked={laserEnabled}
          onChange={(e) => setLaserEnabled(e.target.checked)}
          data-testid={`${dataTestId}-laser`}
        />
        Allow phone laser pointer
      </label>

      <fieldset
        data-testid={`${dataTestId}-haptics`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          border: '1px dashed var(--border-subtle)',
          borderRadius: 4,
          padding: '6px 8px',
          margin: 0,
        }}
      >
        <legend style={{ fontSize: 11, fontWeight: 700, padding: '0 4px' }}>
          <FormattedMessage id="presenter.haptics.heading" />
        </legend>
        <p
          style={{
            fontSize: 11,
            margin: 0,
            color: 'var(--content-muted)',
            lineHeight: 1.4,
          }}
        >
          <FormattedMessage id="presenter.haptics.description" />
        </p>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
          <input
            type="checkbox"
            checked={hapticsEnabled}
            onChange={(e) => setHapticsEnabled(e.target.checked)}
            data-testid={`${dataTestId}-haptics-toggle`}
          />
          {hapticsEnabled ? (
            <FormattedMessage id="presenter.haptics.toggle.enable" />
          ) : (
            <FormattedMessage id="presenter.haptics.toggle.disable" />
          )}
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
          <span style={{ flexShrink: 0 }}>Advance buzz:</span>
          <select
            value={advancePattern.id}
            onChange={(e) => {
              const target = patterns.find((p) => p.id === e.target.value);
              if (target) setAdvancePattern(target);
            }}
            disabled={!hapticsEnabled}
            data-testid={`${dataTestId}-haptics-advance`}
            style={{
              flex: 1,
              padding: '2px 4px',
              fontSize: 12,
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              background: 'var(--surface-base)',
              color: 'var(--content-primary)',
            }}
          >
            {patterns.length === 0 && (
              <option value={advancePattern.id}>{advancePattern.name}</option>
            )}
            {patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => triggerAdvanceVibrate(advancePattern)}
            disabled={!hapticsEnabled}
            data-testid={`${dataTestId}-haptics-preview`}
            style={{
              padding: '2px 8px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              background: 'transparent',
              color: 'var(--content-primary)',
              fontSize: 11,
              fontWeight: 600,
              cursor: hapticsEnabled ? 'pointer' : 'not-allowed',
            }}
          >
            ▶
          </button>
        </label>
        <p
          style={{
            fontSize: 11,
            margin: 0,
            color: 'var(--content-muted)',
          }}
        >
          {hapticCapableCount} of {devices.length} phones support haptics.
          {checkpoints.length > 0 && (
            <>
              {' '}
              {checkpoints.length} pacing checkpoint
              {checkpoints.length === 1 ? '' : 's'} configured.
            </>
          )}
        </p>
      </fieldset>

      {error && (
        <p
          role="alert"
          data-testid={`${dataTestId}-error`}
          style={{ fontSize: 11, color: 'var(--danger)', margin: 0 }}
        >
          {error}
        </p>
      )}
    </section>
  );
}
