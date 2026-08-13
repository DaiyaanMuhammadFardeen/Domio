/**
 * AutoPlayMode — narrated auto-play that advances slides synced to voiceover.
 *
 * Per Wave 3 §S3.7 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * The viewer reads a recorded voiceover (`services/recording-orchestrator`
 * produced it during authoring) and advances slides when the audio
 * reaches the slide's recorded timestamp. Interactive elements remain
 * interactive — clicking a hot spot pauses auto-advance, and the user
 * resumes by clicking the play button in the chrome.
 *
 * The voiceover manifest is a flat list of `{ slideIdx, timeMs }` markers
 * — one per recorded slide. The bootstrap implementation derives the
 * manifest deterministically (one marker per slide, evenly spaced across
 * `durationMs`) so the UI is exercisable without a real recording.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { DeckDocument } from '@domio/schema/generated/scene-graph';
import { Voiceover } from '../audio/Voiceover';

export interface AutoPlayModeProps {
  readonly deck: DeckDocument;
  readonly voiceoverUrl: string;
  readonly voiceoverDurationMs: number;
  readonly reducedMotion: boolean;
  readonly onSlideChange?: (slideIdx: number) => void;
  readonly dataTestId?: string;
}

interface AutoPlayMarker {
  readonly slideIdx: number;
  readonly timeMs: number;
}

export function AutoPlayMode({
  deck,
  voiceoverUrl,
  voiceoverDurationMs,
  reducedMotion,
  onSlideChange,
  dataTestId = 'autoplay-mode',
}: AutoPlayModeProps): ReactElement {
  const [slideIdx, setSlideIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const lastEmittedRef = useRef(0);

  const markers: readonly AutoPlayMarker[] = useMemo(() => {
    const slideCount = Math.max(1, deck.slides.length);
    const spacingMs = Math.max(2000, voiceoverDurationMs / slideCount);
    return deck.slides.map((_slide, i) => ({
      slideIdx: i,
      timeMs: Math.round(i * spacingMs),
    }));
  }, [deck.slides, voiceoverDurationMs]);

  const currentMarkerIndex = useMemo(() => {
    let lo = 0;
    let hi = markers.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (
        markers[mid]!.timeMs <=
        slideIdx * (voiceoverDurationMs / Math.max(1, deck.slides.length))
      ) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }, [markers, slideIdx, deck.slides.length, voiceoverDurationMs]);

  const onTimeUpdate = useCallback(
    (timeMs: number) => {
      // Find the most recent marker <= timeMs.
      let next = 0;
      for (let i = 0; i < markers.length; i++) {
        if (markers[i]!.timeMs <= timeMs) next = markers[i]!.slideIdx;
        else break;
      }
      if (next !== lastEmittedRef.current) {
        lastEmittedRef.current = next;
        setSlideIdx(next);
        onSlideChange?.(next);
      }
    },
    [markers, onSlideChange],
  );

  const togglePlay = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  const onEnded = useCallback(() => {
    setPlaying(false);
  }, []);

  useEffect(() => {
    lastEmittedRef.current = 0;
  }, [voiceoverUrl]);

  const slide = deck.slides[slideIdx];
  const progressPct = (lastEmittedRef.current / Math.max(1, markers.length - 1)) * 100;

  return (
    <div
      data-testid={dataTestId}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        background: '#000',
        color: '#fff',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <div
        data-testid={`${dataTestId}-chrome`}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(0,0,0,0.85)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          zIndex: 100,
          fontFamily: 'system-ui',
          fontSize: 13,
        }}
      >
        <button
          type="button"
          onClick={togglePlay}
          data-testid={`${dataTestId}-play`}
          style={chromeButtonStyle}
          aria-label={playing ? 'Pause auto-play' : 'Start auto-play'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          data-testid={`${dataTestId}-mute`}
          style={chromeButtonStyle}
          aria-label={muted ? 'Unmute voiceover' : 'Mute voiceover'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <div
          data-testid={`${dataTestId}-track`}
          style={{
            flex: 1,
            height: 4,
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
              transition: reducedMotion ? 'none' : 'width 200ms ease-out',
            }}
          />
        </div>
        <div data-testid={`${dataTestId}-counter`} style={{ color: 'rgba(255,255,255,0.7)' }}>
          {slideIdx + 1} / {deck.slides.length}
        </div>
      </div>
      <main style={{ paddingBottom: 96 }}>
        {slide ? (
          <div data-testid={`${dataTestId}-slide`}>
            <h2 style={{ marginTop: 0, color: 'rgba(255,255,255,0.9)' }}>
              {slide.title ?? `Slide ${slideIdx + 1}`}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)' }}>
              {markers[currentMarkerIndex]?.timeMs
                ? `Speaking at ${Math.round(markers[currentMarkerIndex]!.timeMs / 1000)}s`
                : '—'}
            </p>
          </div>
        ) : (
          <div data-testid={`${dataTestId}-empty`}>No slides</div>
        )}
      </main>
      <Voiceover
        url={voiceoverUrl}
        durationMs={voiceoverDurationMs}
        playing={playing}
        {...(muted ? { muted: true } : {})}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        dataTestId={`${dataTestId}-voiceover`}
      />
    </div>
  );
}

const chromeButtonStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  width: 32,
  height: 32,
  cursor: 'pointer',
  fontSize: 14,
};
