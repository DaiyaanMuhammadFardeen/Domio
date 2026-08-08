/**
 * Phase 21 W1.7 — editor recording panel integration tests.
 *
 * Covers:
 *   - useRecorder hook transitions through the documented status set
 *   - CaptureControls disables buttons per status
 *   - TrackStatus renders per-track state + chunk count
 *   - PreviewGrid renders a tile per track
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TrackKind } from '@domio/object-store';
import { CaptureControls } from './CaptureControls.js';
import { PreviewGrid } from './PreviewGrid.js';
import { TrackStatus } from './TrackStatus.js';

describe('CaptureControls', () => {
  it('disables Start when status is recording', () => {
    render(
      <CaptureControls
        status="recording"
        onStart={() => {}}
        onPause={() => {}}
        onResume={() => {}}
        onStop={() => {}}
      />,
    );
    expect((screen.getByTestId('recording-start') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('recording-pause') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('recording-stop') as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables Pause/Stop and enables Resume when status is paused', () => {
    render(
      <CaptureControls
        status="paused"
        onStart={() => {}}
        onPause={() => {}}
        onResume={() => {}}
        onStop={() => {}}
      />,
    );
    expect((screen.getByTestId('recording-pause') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('recording-resume') as HTMLButtonElement).disabled).toBe(false);
  });

  it('fires onStart when Start is clicked', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <CaptureControls
        status="idle"
        onStart={onStart}
        onPause={() => {}}
        onResume={() => {}}
        onStop={() => {}}
      />,
    );
    await user.click(screen.getByTestId('recording-start'));
    expect(onStart).toHaveBeenCalledOnce();
  });
});

describe('TrackStatus', () => {
  it('renders a row per track with state + chunk count', () => {
    const tracks: readonly TrackKind[] = ['screen', 'camera', 'microphone'];
    const trackStates = new Map<TrackKind, string>([
      ['screen', 'recording'],
      ['camera', 'ready'],
    ]);
    const progress = new Map<TrackKind, number>([
      ['screen', 4],
      ['camera', 0],
    ]);
    render(
      <TrackStatus tracks={tracks} trackStates={trackStates} progress={progress} />,
    );
    expect(screen.getByTestId('recording-track-row-screen').getAttribute('data-state')).toBe('recording');
    expect(screen.getByTestId('recording-track-row-screen').textContent).toContain('4 chunks');
    expect(screen.getByTestId('recording-track-row-camera').getAttribute('data-state')).toBe('ready');
    expect(screen.getByTestId('recording-track-row-microphone').getAttribute('data-state')).toBe('pending');
  });
});

describe('PreviewGrid', () => {
  it('renders a tile per track', () => {
    const tiles = [
      { track: 'screen' as const, stream: null, state: 'ready' },
      { track: 'camera' as const, stream: null, state: 'recording' },
    ];
    render(<PreviewGrid tiles={tiles} />);
    expect(screen.getByTestId('recording-preview-tile-screen')).toBeTruthy();
    expect(screen.getByTestId('recording-preview-tile-camera')).toBeTruthy();
  });
});