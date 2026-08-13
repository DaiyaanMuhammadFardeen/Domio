/**
 * Model3DViewer — viewer-side renderer for `model3d`-typed slide elements.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * The viewer never owns the WebGL context. It constructs a
 * `ViewerScene3D` instance from `../three/scroll-driver` and points it
 * at the element's bounding box. When the host has no WebGL canvas,
 * a poster frame (a deterministic gradient computed from the scene
 * id) is rendered instead so the slide still communicates the model's
 * presence.
 */

'use client';

import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import type { Model3DLayer } from '@domio/schema/generated/scene-graph';
import { createViewerScene3D, type ViewerScene3DConfig } from './Scene3DAdapter';

export interface Model3DViewerProps {
  readonly layer: Model3DLayer;
  readonly reducedMotion: boolean;
  readonly dataTestId?: string;
}

export function Model3DViewer({
  layer,
  reducedMotion,
  dataTestId = 'model3d-viewer',
}: Model3DViewerProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const config: ViewerScene3DConfig = useMemo(
    () => ({
      assetId: layer.modelAssetId,
      sceneId: layer.sceneId ?? 'default',
      upAxis: layer.upAxis ?? 'y-up',
      autoRotate: layer.autoRotate ?? false,
      paused: layer.paused ?? false,
      physicsEnabled: layer.physicsEnabled ?? false,
      reducedMotion,
    }),
    [layer, reducedMotion],
  );

  const scene = useMemo(() => createViewerScene3D(config), [config]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cleanup = scene.attach(canvas);
    return () => {
      cleanup?.();
    };
  }, [scene]);

  const url = `https://media.domio.app/${layer.modelAssetId}/poster.png`;

  return (
    <div data-testid={dataTestId} style={{ position: 'absolute', inset: 0, background: '#0b0b0b' }}>
      <canvas
        ref={canvasRef}
        data-testid={`${dataTestId}-canvas`}
        aria-label={layer.name}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      <div
        data-testid={`${dataTestId}-poster`}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(135deg, rgba(88,166,255,0.05), rgba(168,85,247,0.1))`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          pointerEvents: 'none',
        }}
      >
        <img
          src={url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }}
        />
      </div>
    </div>
  );
}
