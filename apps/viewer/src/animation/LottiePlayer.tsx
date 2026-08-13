/**
 * LottiePlayer — viewer-side renderer for `lottie`-typed slide elements.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * The viewer relies on the `@lottiefiles/dotlottie-web` runtime
 * shipped by the canvas shell. Bootstrap mode renders a static
 * placeholder keyed off the asset id so the slide communicates
 * presence; the real implementation loads the dotLottie runtime on
 * mount and tears it down on unmount.
 */

'use client';

import { useEffect, useRef, type ReactElement } from 'react';
import type { LottieLayer } from '@domio/schema/generated/scene-graph';

export interface LottiePlayerProps {
  readonly layer: LottieLayer;
  readonly reducedMotion: boolean;
  readonly dataTestId?: string;
}

export function LottiePlayer({
  layer,
  reducedMotion,
  dataTestId = 'lottie-player',
}: LottiePlayerProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const url = `https://media.domio.app/${layer.assetId}/anim.lottie`;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (reducedMotion) {
      // Reduced motion prefers the first frame, no autoplay.
      return;
    }
    // Bootstrap: when the real dotLottie runtime lands, replace this
    // stub with `loadAnimation` from `@lottiefiles/dotlottie-web`.
    // The viewer's responsibility is only to mount + tear down.
    let cancelled = false;
    void (async () => {
      try {
        await fetch(url, { method: 'HEAD' });
      } catch {
        /* ignore — placeholder renders regardless */
      }
      void cancelled;
    })();
    return () => {
      cancelled = true;
    };
  }, [layer, reducedMotion, url]);

  return (
    <div
      ref={containerRef}
      data-testid={dataTestId}
      data-asset-id={layer.assetId}
      style={{ position: 'absolute', inset: 0, background: 'rgba(168,85,247,0.05)' }}
    >
      <div
        data-testid={`${dataTestId}-placeholder`}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(168,85,247,0.8)',
          fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        ◐ lottie · {layer.assetId}
      </div>
    </div>
  );
}
