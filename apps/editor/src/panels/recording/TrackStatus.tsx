/**
 * TrackStatus — per-track chunk count + state badge.
 *
 * Phase 21 W1.7. Shows the live state of each track and the number of
 * chunks committed so far. The recorder hooks feed this via the
 * `useRecorder` hook's `progress` and `trackStates` maps.
 */

'use client';

import type { ReactElement } from 'react';
import type { TrackKind } from '@domio/object-store';

export interface TrackStatusProps {
  readonly tracks: readonly TrackKind[];
  readonly trackStates: ReadonlyMap<TrackKind, string>;
  readonly progress: ReadonlyMap<TrackKind, number>;
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

export function TrackStatus({ tracks, trackStates, progress }: TrackStatusProps): ReactElement {
  return (
    <ul
      className="recording-track-status"
      data-testid="recording-track-status"
      style={{ listStyle: 'none', padding: 0, margin: 0 }}
    >
      {tracks.map((track) => {
        const state = trackStates.get(track) ?? 'pending';
        const chunks = progress.get(track) ?? 0;
        return (
          <li
            key={track}
            data-testid={`recording-track-row-${track}`}
            data-state={state}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '4px 8px',
              borderBottom: '1px solid #eee',
              fontSize: 12,
            }}
          >
            <span>{TRACK_LABELS[track]}</span>
            <span>
              {state} · {chunks} chunk{chunks === 1 ? '' : 's'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}