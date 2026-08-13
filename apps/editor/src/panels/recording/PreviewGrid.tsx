/**
 * PreviewGrid — multi-track preview tiles for the recording panel.
 *
 * Phase 21 W1.7. Each tile shows the live MediaStream from one track
 * (screen / camera / mic / system_audio). The hook attaches a stream
 * via getUserMedia/getDisplayMedia (already wired through
 * `BrowserMediaSourceFactory`).
 */

'use client';

import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import type { TrackKind } from '@domio/object-store';

export interface PreviewTile {
  readonly track: TrackKind;
  readonly stream: MediaStream | null;
  readonly state: string;
}

export interface PreviewGridProps {
  readonly tiles: readonly PreviewTile[];
}

const TRACK_LABELS: Record<TrackKind, string> = {
  screen: 'Screen',
  camera: 'Camera',
  microphone: 'Microphone',
  system_audio: 'System audio',
  slide_diff: 'Slide diff',
  widget_events: 'Widget events',
  annotations: 'Annotations',
};

export function PreviewGrid({ tiles }: PreviewGridProps): ReactElement {
  return (
    <div
      className="recording-preview-grid"
      data-testid="recording-preview-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '8px',
      }}
    >
      {tiles.map((tile) => (
        <PreviewTileView key={tile.track} tile={tile} />
      ))}
    </div>
  );
}

function PreviewTileView({ tile }: { tile: PreviewTile }): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && tile.stream) {
      videoRef.current.srcObject = tile.stream;
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [tile.stream]);

  const isVideo = tile.track === 'screen' || tile.track === 'camera';
  return (
    <div
      className="recording-preview-tile"
      data-testid={`recording-preview-tile-${tile.track}`}
      data-state={tile.state}
      style={{
        border: '1px solid #ccc',
        borderRadius: 4,
        padding: 8,
        background: '#0a0a0a',
        color: '#fafafa',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        <strong>{TRACK_LABELS[tile.track]}</strong>
        <span data-state={tile.state}>{tile.state}</span>
      </header>
      {isVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: '100%', background: '#000', borderRadius: 2 }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            color: '#888',
            fontSize: 11,
          }}
        >
          {tile.state === 'recording' ? '● capturing' : '— idle —'}
        </div>
      )}
    </div>
  );
}
