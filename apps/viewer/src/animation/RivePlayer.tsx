/**
 * RivePlayer — viewer-side renderer for Rive animated elements.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Mounts a `<canvas>` for the Rive runtime to draw into. The viewer
 * defers all runtime concerns (state machines, inputs) to the canvas
 * shell; here we only expose the asset id + a placeholder so the
 * slide communicates presence.
 */

'use client';

import { useEffect, useRef, type ReactElement } from 'react';

export interface RiveLayerShape {
  readonly id: string;
  readonly assetId: string;
  readonly stateMachine?: string;
  readonly inputBindings?: Record<string, number>;
}

export interface RivePlayerProps {
  readonly layer: RiveLayerShape;
  readonly reducedMotion: boolean;
  readonly dataTestId?: string;
}

export function RivePlayer({
  layer,
  reducedMotion,
  dataTestId = 'rive-player',
}: RivePlayerProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const url = `https://media.domio.app/${layer.assetId}/anim.riv`;

  useEffect(() => {
    if (reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Bootstrap: real implementation will construct a `rive.Rive`
    // instance bound to `canvas` with the named state machine.
    void fetch(url, { method: 'HEAD' }).catch(() => undefined);
  }, [layer, reducedMotion, url]);

  return (
    <div data-testid={dataTestId} style={{ position: 'absolute', inset: 0 }}>
      <canvas
        ref={canvasRef}
        data-testid={`${dataTestId}-canvas`}
        aria-label={layer.stateMachine ?? layer.assetId}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      <div
        data-testid={`${dataTestId}-badge`}
        aria-hidden
        style={{
          position: 'absolute',
          bottom: 6,
          left: 6,
          color: 'rgba(168,85,247,0.7)',
          fontSize: 10,
          fontFamily: 'monospace',
          background: 'rgba(0,0,0,0.5)',
          padding: '2px 6px',
          borderRadius: 3,
        }}
      >
        rive · {layer.stateMachine ?? 'idle'}
      </div>
    </div>
  );
}
