/**
 * AudioTrack — viewer-side renderer for `audio`-typed slide elements.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Mounts a single HTML5 `<audio>` element behind the slide, with the
 * gain/pan/fade/loop values from the descriptor. The viewer's
 * `createViewerAudioRuntime` owns the gain-bus state and exposes
 * `apply()` so a deck-wide mixer can fade this track in/out across
 * slides.
 */

'use client';

import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import type { AudioLayer } from '@domio/schema/generated/scene-graph';
import { createViewerAudioRuntime, type ViewerAudioTrackSpec } from '../audio/playback';

export interface AudioTrackProps {
  readonly layer: AudioLayer;
  readonly dataTestId?: string;
}

export function AudioTrack({ layer, dataTestId = 'audio-track' }: AudioTrackProps): ReactElement {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const spec: ViewerAudioTrackSpec = useMemo(
    () => ({
      id: layer.id,
      kind: 'sfx',
      durationMs: 0,
      volume: layer.volume ?? 1,
      pan: layer.pan ?? 0,
      fadeInMs: layer.fadeInMs ?? 0,
      fadeOutMs: layer.fadeOutMs ?? 0,
      loop: layer.loop ?? false,
    }),
    [layer],
  );

  const runtime = useMemo(
    () =>
      createViewerAudioRuntime({
        tracks: [spec],
      }),
    [spec],
  );

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, layer.volume ?? 1));
    if (layer.loop) el.loop = true;
    if (layer.startAtMs != null && layer.startAtMs > 0) el.currentTime = layer.startAtMs / 1000;
    return () => {
      runtime.destroy();
    };
  }, [layer, runtime]);

  const url = `https://media.domio.app/${layer.assetId}`;

  return (
    <div data-testid={dataTestId} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        aria-label={layer.name}
        data-testid={`${dataTestId}-element`}
        style={{ display: 'none' }}
      />
    </div>
  );
}
