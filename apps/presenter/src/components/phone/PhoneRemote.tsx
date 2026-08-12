'use client';

/**
 * PhoneRemote — clicker-style mini-controller surfaced from the
 * pairing QR.
 *
 * Per Wave 4 §S4.2 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * This component lives on the *desktop* (presenter view) — it shows
 * the QR + a "phones connected" list. The phone-side counterpart at
 * `/pair/[token]/page.tsx` opens from scanning the QR. Both halves
 * share state through the realtime gateway subject
 * `realtime.session.{id}.remote` (W3 S3.4).
 *
 * For now, this is the **discovery + status** surface: the QR, the
 * connected devices, and a "open laser pointer" toggle. Actual remote
 * input (advance/retreat from the phone) lands in S4.7 handoff /
 * S4.8 failover as those sub-phases establish the WS channel.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { PairingInfo } from '../../runtime/types';
import {
  PhoneRemoteService,
  type PairedDevice,
} from '../../lib/phone-remote-service';

export interface PhoneRemoteProps {
  readonly pairing: PairingInfo;
  readonly apiBaseUrl?: string;
  readonly dataTestId?: string;
}

export type { PairedDevice } from '../../lib/phone-remote-service';

const POLL_INTERVAL_MS = 5_000;

export function PhoneRemote({
  pairing,
  apiBaseUrl = '',
  dataTestId = 'phone-remote',
}: PhoneRemoteProps): ReactElement {
  const [devices, setDevices] = useState<readonly PairedDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [laserEnabled, setLaserEnabled] = useState(false);

  const service = useMemo(
    () => new PhoneRemoteService({ apiBaseUrl }),
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

  useEffect(() => {
    void refresh();
    const handle = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [refresh]);

  const qrUrl = pairing.deep_link;

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
          Scan with a phone camera to use it as a clicker, laser pointer,
          whisper channel, and notes viewer. The phone stays connected
          while this tab is open.
        </div>
      </div>

      {devices.length > 0 && (
        <ul
          data-testid={`${dataTestId}-device-list`}
          style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}
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
