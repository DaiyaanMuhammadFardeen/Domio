/**
 * Voiceover — viewer-side renderer for the auto-play voiceover track.
 *
 * Per Wave 3 §S3.7 + §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Mounts an HTML5 `<audio>` element bound to the recording-orchestrator's
 * published voiceover. Emits `timeupdate` events upward via the
 * `onTimeUpdate` callback so `AutoPlayMode` can sync slide advance to
 * audio timestamps.
 */

'use client';

import { useEffect, useRef, type ReactElement } from 'react';

export interface VoiceoverProps {
  readonly url: string;
  readonly durationMs: number;
  readonly playing: boolean;
  readonly muted?: boolean;
  readonly onTimeUpdate?: (timeMs: number) => void;
  readonly onEnded?: () => void;
  readonly dataTestId?: string;
}

export function Voiceover({
  url,
  durationMs,
  playing,
  muted = false,
  onTimeUpdate,
  onEnded,
  dataTestId = 'voiceover',
}: VoiceoverProps): ReactElement {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) void el.play();
    else el.pause();
  }, [playing]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = muted;
  }, [muted]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const handleTime = () => onTimeUpdate?.(Math.round(el.currentTime * 1000));
    const handleEnd = () => onEnded?.();
    el.addEventListener('timeupdate', handleTime);
    el.addEventListener('ended', handleEnd);
    return () => {
      el.removeEventListener('timeupdate', handleTime);
      el.removeEventListener('ended', handleEnd);
    };
  }, [onTimeUpdate, onEnded]);

  return (
    <div data-testid={dataTestId} aria-hidden style={{ display: 'none' }}>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        data-testid={`${dataTestId}-element`}
        data-duration-ms={durationMs}
      />
    </div>
  );
}
