/**
 * LiveAppEmbed — viewer-side renderer for `embed`-typed slide elements.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Mounts an iframe sandbox using the policy's flags from the layer
 * descriptor. The bootstrap implementation derives a policy from
 * the layer's `sandboxFlags` and the workspace id; once the real
 * `embed-proxy` service lands it will return the authoritative
 * `EmbedPolicy` (allow-listed origins, CSP, focus trap).
 */

'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { EmbedLayer } from '@domio/schema/generated/scene-graph';

export interface LiveAppEmbedProps {
  readonly layer: EmbedLayer;
  readonly workspaceId: string;
  readonly dataTestId?: string;
}

interface ResolvedEmbedPolicy {
  readonly sandboxFlags: string;
  readonly allowedOrigins: readonly string[];
}

export function LiveAppEmbed({
  layer,
  workspaceId,
  dataTestId = 'live-app-embed',
}: LiveAppEmbedProps): ReactElement {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [policy, setPolicy] = useState<ResolvedEmbedPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const viewerOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const requestedPolicy = useMemo(
    () => ({
      sandboxFlags: layer.sandboxFlags ?? 'allow-scripts allow-same-origin allow-popups',
    }),
    [layer.sandboxFlags],
  );

  useEffect(() => {
    let cancelled = false;
    // Bootstrap: trust the layer's `sandboxFlags` and the current
    // viewer origin. Real implementation will call the
    // `embed-proxy` service to resolve a workspace-scoped policy.
    void (async () => {
      try {
        const resolved: ResolvedEmbedPolicy = {
          sandboxFlags: requestedPolicy.sandboxFlags,
          allowedOrigins: viewerOrigin ? [viewerOrigin] : [],
        };
        if (resolved.allowedOrigins.length === 0) {
          setError('No viewer origin available for embed.');
          return;
        }
        if (!cancelled) setPolicy(resolved);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Embed policy failed');
      }
    })();
    return () => {
      cancelled = true;
    };
    // Reference workspaceId to satisfy intent for the real backend.
    void workspaceId;
  }, [requestedPolicy, viewerOrigin, workspaceId]);

  if (error) {
    return (
      <div data-testid={dataTestId} style={placeholderStyle}>
        Embed blocked: {error}
      </div>
    );
  }
  if (!policy) {
    return (
      <div data-testid={dataTestId} style={placeholderStyle}>
        Resolving embed policy…
      </div>
    );
  }

  return (
    <div data-testid={dataTestId} style={{ position: 'absolute', inset: 0 }}>
      <iframe
        ref={iframeRef}
        src={layer.url}
        title={layer.title ?? layer.name}
        sandbox={policy.sandboxFlags}
        allow="fullscreen; clipboard-write"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        data-testid={`${dataTestId}-iframe`}
      />
    </div>
  );
}

const placeholderStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(88,166,255,0.05)',
  color: 'rgba(88,166,255,0.7)',
  fontSize: 12,
  fontFamily: 'monospace',
};