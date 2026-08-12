/**
 * KeyframePath — viewer-side scroll-driven camera path overlay.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Attaches the `ScrollDriver` from `../three/scroll-driver` to the
 * global scroll position and surfaces the active keyframe progress
 * as a debug-friendly badge. The actual camera move is driven by
 * the `Model3DViewer` itself, which subscribes to the same driver
 * instance via the scene id.
 */

'use client';

import { useEffect, useState, type ReactElement } from 'react';
import {
  attachScrollDriver,
  computeScrollState,
  reducedMotionFallback,
  type ScrollCameraKeyframe,
  type ScrollDriverConfig,
} from './scroll-driver';

export interface KeyframePathProps {
  readonly deckId: string;
  readonly sceneId: string;
  readonly keyframes: readonly ScrollCameraKeyframe[];
  readonly reducedMotion: boolean;
  readonly dataTestId?: string;
}

export function KeyframePath({
  deckId,
  sceneId,
  keyframes,
  reducedMotion,
  dataTestId = 'keyframe-path',
}: KeyframePathProps): ReactElement {
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (reducedMotion) {
      const fallback = reducedMotionFallback(keyframes);
      setProgress(fallback?.progress ?? 0.5);
      return;
    }
    const config: ScrollDriverConfig = {
      start: 0,
      end: Math.max(window.innerHeight * 2, 1),
    };
    const detach = attachScrollDriver(config, keyframes, (state) => {
      setProgress(state.progress);
    });
    // Also keep an explicit computation in case attachScrollDriver
    // hasn't fired yet during initial render.
    setProgress(computeScrollState(window.scrollY, config, keyframes).progress);
    return () => {
      detach();
    };
  }, [keyframes, reducedMotion]);

  return (
    <div
      data-testid={dataTestId}
      data-deck-id={deckId}
      data-scene-id={sceneId}
      aria-hidden
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        padding: '4px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontFamily: 'monospace',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      scroll:{Math.round(progress * 100)}%
    </div>
  );
}