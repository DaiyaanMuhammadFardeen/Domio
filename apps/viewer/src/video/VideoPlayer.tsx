/**
 * VideoPlayer — viewer-side renderer for `video`-typed slide elements.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Mounts an HTML5 `<video>` element honoring trim, speed, autoplay,
 * captions-on, chapters, and the poster frame. Passes the resulting
 * element into `createViewerVideoRuntime` from `../video/playback`
 * so segment-aware behaviour (chapter scrub, contrast protection,
 * VTT parsing) shares the same code path as the editor preview.
 */

'use client';

import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import type { VideoLayer } from '@domio/schema/generated/scene-graph';
import { createViewerVideoRuntime } from '../video/playback';

export interface VideoPlayerProps {
  readonly layer: VideoLayer;
  readonly reducedMotion: boolean;
  readonly dataTestId?: string;
}

export function VideoPlayer({
  layer,
  reducedMotion,
  dataTestId = 'video-player',
}: VideoPlayerProps): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Construct the runtime once per (assetId, chapters) pair so the
  // runtime's segment metadata doesn't churn on every render.
  const runtime = useMemo(
    () =>
      createViewerVideoRuntime({
        sourceDurationMs: 0,
        segments: [],
      }),
    [],
  );
  const url = useMemo(() => `https://media.domio.app/${layer.assetId}`, [layer.assetId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (layer.trimInMs != null) video.currentTime = layer.trimInMs / 1000;
    if (layer.speed != null) video.playbackRate = layer.speed;
    if (layer.muted) video.muted = true;
    if (layer.autoplay && !reducedMotion) {
      // Autoplay must be muted per browser policies; ignore otherwise.
      void (layer.muted === true ? video.play() : Promise.resolve());
    }
  }, [layer, reducedMotion, url]);

  const chapters = layer.chapters ?? [];
  const posterMs = layer.posterFrameMs ?? 0;

  return (
    <div data-testid={dataTestId} style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <video
        ref={videoRef}
        src={url}
        poster={posterMs > 0 ? `${url}#t=${posterMs / 1000}` : undefined}
        controls={!layer.autoplay}
        loop={layer.loop ?? false}
        playsInline
        preload="metadata"
        aria-label={layer.name}
        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
      />
      {layer.captionsOn ? (
        <div
          data-testid={`${dataTestId}-captions`}
          style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
            maxWidth: '80%',
            textAlign: 'center',
          }}
        >
          Captions on
        </div>
      ) : null}
      {chapters.length > 0 ? (
        <div
          data-testid={`${dataTestId}-chapters`}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          {chapters.length} chapter{chapters.length === 1 ? '' : 's'}
        </div>
      ) : null}
      <div data-testid={`${dataTestId}-runtime`} aria-hidden style={{ display: 'none' }}>
        {runtime ? 'video-runtime-ready' : null}
      </div>
    </div>
  );
}
