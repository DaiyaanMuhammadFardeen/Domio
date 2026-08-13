/**
 * SegmentedVideoPlayer — viewer renderer for chapter-driven video.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Builds on the same HTML5 video element model as `VideoPlayer` and
 * exposes the chapter list as clickable segments. Clicking a chapter
 * jumps the playhead to that timestamp; the segment-aware runtime
 * clips the trim window to the source.
 *
 * The chapter controls are stacked above the inner video player; to
 * drive the underlying `<video>` element we look it up via a stable
 * data-testid selector on the inner player.
 */

'use client';

import { useCallback, useEffect, useRef, type ReactElement } from 'react';
import type { VideoLayer } from '@domio/schema/generated/scene-graph';
import { VideoPlayer } from './VideoPlayer';

export interface SegmentedVideoPlayerProps {
  readonly layer: VideoLayer;
  readonly reducedMotion: boolean;
  readonly dataTestId?: string;
}

export function SegmentedVideoPlayer({
  layer,
  reducedMotion,
  dataTestId = 'segmented-video-player',
}: SegmentedVideoPlayerProps): ReactElement {
  const innerTestId = `${dataTestId}-inner`;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Re-resolve the inner <video> element on each chapter click. The
  // inner player lives in the same tree so React will keep the same
  // node identity across renders once mounted.
  const resolveVideo = useCallback((): HTMLVideoElement | null => {
    if (videoRef.current) return videoRef.current;
    if (typeof document === 'undefined') return null;
    const el = document.querySelector(`[data-testid="${innerTestId}"] video`);
    if (el instanceof HTMLVideoElement) {
      videoRef.current = el;
      return el;
    }
    return null;
  }, [innerTestId]);

  // Drop the cached ref whenever the layer changes (new asset id).
  useEffect(() => {
    videoRef.current = null;
  }, [layer.assetId]);

  const onJump = useCallback(
    (timeMs: number) => {
      const el = resolveVideo();
      if (el) el.currentTime = timeMs / 1000;
    },
    [resolveVideo],
  );

  const chapters = layer.chapters ?? [];

  return (
    <div data-testid={dataTestId} style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          padding: 6,
          borderRadius: 4,
          fontSize: 11,
        }}
      >
        {chapters.map((c) => (
          <button
            type="button"
            key={`${c.timeMs}-${c.label}`}
            data-testid={`${dataTestId}-chapter-${c.timeMs}`}
            onClick={() => onJump(c.timeMs)}
            style={{
              background: 'transparent',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 11,
              padding: 0,
            }}
          >
            {c.label} · {Math.round(c.timeMs / 1000)}s
          </button>
        ))}
      </div>
      <VideoPlayer layer={layer} reducedMotion={reducedMotion} dataTestId={innerTestId} />
    </div>
  );
}
