'use client';

/**
 * PodcastPreviewPlayer — custom HTML5 audio player for the rendered MP3.
 *
 * Per Wave 11 §S11.12 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Wraps a hidden `<audio>` element with our own play/pause button,
 * seek bar, current/total time, and volume slider. Exposes a single
 * `audioUrl` prop — when it changes the player resets.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react';
import { FormattedMessage } from '@domio/ui';

export interface PodcastPreviewPlayerProps {
  readonly audioUrl: string;
  readonly dataTestId?: string;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function PodcastPreviewPlayer({
  audioUrl,
  dataTestId = 'podcast-preview-player',
}: PodcastPreviewPlayerProps): ReactElement {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // Reset when the source changes.
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [audioUrl]);

  const onLoadedMetadata = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    setDuration(a.duration);
  }, []);

  const onTimeUpdate = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    setCurrentTime(a.currentTime);
  }, []);

  const onEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(duration);
  }, [duration]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play();
      setIsPlaying(true);
    } else {
      a.pause();
      setIsPlaying(false);
    }
  }, []);

  const onSeek = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const next = Number.parseFloat(e.target.value);
    a.currentTime = next;
    setCurrentTime(next);
  }, []);

  const onVolume = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const next = Number.parseFloat(e.target.value);
    a.volume = next;
    setVolume(next);
  }, []);

  const status = isPlaying ? 'editor.podcast.player.playing' : 'editor.podcast.player.paused';
  const seekMax = useMemo(
    () => (duration > 0 ? duration : 0),
    [duration],
  );

  return (
    <section
      data-testid={dataTestId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        borderRadius: 8,
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={toggle}
          data-testid={`${dataTestId}-toggle`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: 'none',
            background: '#3b82f6',
            color: '#fff',
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 4 }}>
          <input
            type="range"
            min={0}
            max={seekMax || 0}
            step={0.1}
            value={currentTime}
            onChange={onSeek}
            data-testid={`${dataTestId}-seek`}
            aria-label="Seek"
            disabled={seekMax === 0}
            style={{ width: '100%' }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'rgba(0,0,0,0.6)',
            }}
          >
            <span data-testid={`${dataTestId}-current`}>{formatTime(currentTime)}</span>
            <span data-testid={`${dataTestId}-duration`}>{formatTime(duration)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ fontSize: 12 }}>
            🔊
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={onVolume}
            data-testid={`${dataTestId}-volume`}
            aria-label="Volume"
            style={{ width: 80 }}
          />
        </div>
      </div>
      <div
        data-testid={`${dataTestId}-status`}
        style={{ fontSize: 11, color: 'rgba(0,0,0,0.6)', textTransform: 'uppercase' }}
      >
        <FormattedMessage id={status} />
      </div>
    </section>
  );
}