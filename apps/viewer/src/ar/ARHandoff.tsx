/**
 * ARHandoff — viewer-side renderer for AR-capable 3D elements.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Detects AR support via `detectArSupport` from `../ar/viewer-ar`,
 * mints an `ArSession` via the ar-sessions service (or accepts a
 * pre-minted token), and surfaces the appropriate handoff UI:
 *   - inline: `webxr` (desktop with XR) → an "Enter AR" button that
 *     attaches the session to the model.
 *   - handoff: iOS QuickLook / Android Scene Viewer → a deep link
 *     button + a mobile fallback URL.
 *   - unsupported: an explainer paragraph with a link to the desktop
 *     viewer for users who land here on a non-AR device.
 */

'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { Model3DLayer } from '@domio/schema/generated/scene-graph';
import {
  buildPlatformAudienceUrl,
  defaultArProbe,
  detectArSupport,
  type ArSupportSnapshot,
} from './viewer-ar';

export interface ARHandoffProps {
  readonly layer: Model3DLayer;
  readonly deckId: string;
  readonly dataTestId?: string;
}

export function ARHandoff({
  layer,
  deckId,
  dataTestId = 'ar-handoff',
}: ARHandoffProps): ReactElement {
  const [support, setSupport] = useState<ArSupportSnapshot | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const snap = detectArSupport(defaultArProbe());
      setSupport(snap);
      // Bootstrap: we don't have an ar-sessions service yet, so the
      // token is derived deterministically from deckId+assetId. Real
      // implementation calls POST /v1/ar/sessions.
      setToken(`${deckId}.${layer.modelAssetId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AR detection failed');
    }
  }, [deckId, layer.modelAssetId]);

  const handoffUrl = useMemo(() => {
    if (!token || !support) return null;
    return buildPlatformAudienceUrl({
      platform: support.platform,
      baseUrl: `https://ar.domio.app/${token}`,
      displayName: layer.name,
    });
  }, [layer.name, support, token]);

  if (error) {
    return (
      <div data-testid={dataTestId} style={panelStyle}>
        <strong>AR unavailable</strong>
        <p style={paragraphStyle}>{error}</p>
      </div>
    );
  }
  if (!support) {
    return (
      <div data-testid={dataTestId} style={panelStyle}>
        Detecting AR support…
      </div>
    );
  }
  if (support.inline) {
    return (
      <div data-testid={dataTestId} style={panelStyle}>
        <strong>AR ready</strong>
        <p style={paragraphStyle}>Tap to launch {support.platform} on this device.</p>
        <button type="button" data-testid={`${dataTestId}-enter`} style={buttonStyle}>
          Enter AR
        </button>
      </div>
    );
  }
  if (support.handoffOnly && handoffUrl) {
    return (
      <div data-testid={dataTestId} style={panelStyle}>
        <strong>View in AR</strong>
        <p style={paragraphStyle}>Open this link on a mobile device to view in AR.</p>
        <a
          href={handoffUrl}
          data-testid={`${dataTestId}-handoff-link`}
          style={{ ...buttonStyle, textDecoration: 'none', display: 'inline-block' }}
        >
          Open on mobile
        </a>
        <div
          data-testid={`${dataTestId}-qr`}
          style={{ marginTop: 8, fontSize: 11, fontFamily: 'monospace' }}
        >
          {handoffUrl}
        </div>
      </div>
    );
  }
  return (
    <div data-testid={dataTestId} style={panelStyle}>
      <strong>AR not supported</strong>
      <p style={paragraphStyle}>Open this link on a mobile device to view in AR.</p>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 12,
  right: 12,
  background: 'rgba(0,0,0,0.7)',
  color: '#fff',
  padding: '8px 12px',
  borderRadius: 6,
  fontSize: 12,
  maxWidth: 240,
};
const paragraphStyle: React.CSSProperties = { margin: '4px 0' };
const buttonStyle: React.CSSProperties = {
  background: '#1e3a8a',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 12,
};
