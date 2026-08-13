'use client';

/**
 * PhonePairingPanel — collapsible pairing details.
 *
 * Per Wave 4 §S4.2 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Differs from PhoneRemote: PhoneRemote is the always-visible QR +
 * device list. PhonePairingPanel is a deeper pane that opens when the
 * presenter taps "Pairing details" — it shows the deep link URL
 * (copyable), pairing token expiry, and a "rotate now" button that
 * forces the session-service to mint a fresh token.
 */

import { useCallback, useState, type ReactElement } from 'react';
import type { PairingInfo } from '../../runtime/types';

export interface PhonePairingPanelProps {
  readonly pairing: PairingInfo;
  readonly onRotate?: () => Promise<PairingInfo>;
  readonly dataTestId?: string;
}

function formatRelative(ms: number): string {
  const delta = ms - Date.now();
  if (delta <= 0) return 'expired';
  if (delta < 60_000) return `${Math.round(delta / 1000)}s`;
  return `${Math.round(delta / 60_000)}m`;
}

export function PhonePairingPanel({
  pairing,
  onRotate,
  dataTestId = 'phone-pairing-panel',
}: PhonePairingPanelProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(pairing.deep_link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // ignore — best-effort UX
    }
  }, [pairing.deep_link]);

  const handleRotate = useCallback(async () => {
    if (!onRotate) return;
    setRotating(true);
    setError(null);
    try {
      await onRotate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rotation failed');
    } finally {
      setRotating(false);
    }
  }, [onRotate]);

  return (
    <section
      data-testid={dataTestId}
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        background: 'var(--surface-base)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 10px',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <strong style={{ fontSize: 12 }}>🔗 Pairing details</strong>
        <span style={{ fontSize: 11, color: 'var(--content-muted)' }}>
          {expanded ? '▾' : '▸'} token expires in {formatRelative(pairing.expires_at_ms)}
        </span>
      </header>

      {expanded && (
        <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label
              htmlFor={`${dataTestId}-link`}
              style={{ fontSize: 11, color: 'var(--content-muted)' }}
            >
              Deep link
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                id={`${dataTestId}-link`}
                readOnly
                value={pairing.deep_link}
                data-testid={`${dataTestId}-link`}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  background: 'var(--surface-base)',
                  color: 'var(--content-primary)',
                }}
              />
              <button
                type="button"
                onClick={handleCopy}
                data-testid={`${dataTestId}-copy`}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  border: '1px solid var(--border-default)',
                  borderRadius: 4,
                  background: 'var(--surface-raised)',
                  cursor: 'pointer',
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--content-secondary)' }}>
            <div>
              Token: <code style={{ fontFamily: 'var(--font-mono)' }}>{pairing.token}</code>
            </div>
            <div>Epoch: {pairing.epoch}</div>
            <div>Paired devices: {pairing.paired_devices}</div>
          </div>

          {onRotate && (
            <button
              type="button"
              onClick={handleRotate}
              disabled={rotating}
              data-testid={`${dataTestId}-rotate`}
              style={{
                padding: '6px 10px',
                fontSize: 12,
                border: '1px solid var(--border-default)',
                borderRadius: 4,
                background: 'var(--surface-raised)',
                cursor: rotating ? 'wait' : 'pointer',
              }}
            >
              {rotating ? 'Rotating…' : 'Rotate pairing token now'}
            </button>
          )}

          {error && (
            <p
              role="alert"
              data-testid={`${dataTestId}-error`}
              style={{ fontSize: 11, color: 'var(--danger)', margin: 0 }}
            >
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
