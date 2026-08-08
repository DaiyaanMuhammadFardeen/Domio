/**
 * CaptureControls — start / pause / resume / stop controls for the
 * recording panel.
 *
 * Phase 21 W1.7. Wraps the `useRecorder` hook with click handlers and
 * disabled state per the recorder's current status.
 */

'use client';

import type { ReactElement } from 'react';
import type { RecorderStatus } from './useRecorder.js';

export interface CaptureControlsProps {
  readonly status: RecorderStatus;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStop: () => void;
}

const LABELS: Record<RecorderStatus, string> = {
  idle: 'Idle',
  starting: 'Starting…',
  recording: 'Recording',
  paused: 'Paused',
  stopping: 'Stopping…',
  finalized: 'Finalized',
  error: 'Error',
};

export function CaptureControls(props: CaptureControlsProps): ReactElement {
  const { status, onStart, onPause, onResume, onStop } = props;
  return (
    <div
      className="recording-capture-controls"
      data-testid="recording-capture-controls"
      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
    >
      <span data-testid="recording-status" data-state={status}>
        {LABELS[status]}
      </span>
      <button
        type="button"
        data-testid="recording-start"
        onClick={onStart}
        disabled={status !== 'idle' && status !== 'finalized' && status !== 'error'}
      >
        Start
      </button>
      <button
        type="button"
        data-testid="recording-pause"
        onClick={onPause}
        disabled={status !== 'recording'}
      >
        Pause
      </button>
      <button
        type="button"
        data-testid="recording-resume"
        onClick={onResume}
        disabled={status !== 'paused'}
      >
        Resume
      </button>
      <button
        type="button"
        data-testid="recording-stop"
        onClick={onStop}
        disabled={status !== 'recording' && status !== 'paused'}
      >
        Stop
      </button>
    </div>
  );
}
