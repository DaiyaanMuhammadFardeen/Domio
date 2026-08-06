'use client';

/**
 * RecordingPanel — Phase 11 recording UI for the editor (M7.3).
 *
 * Wraps the recording package's pure headless primitives:
 *  - `selectEncoder` for codec pick
 *  - `computeBitrate` for adaptive bitrate
 *  - `draftReducer` for the resumable local state machine
 *  - `checkElapsed` / `checkMinDuration` for timing guards
 *
 * Pure presentation: data is fed via props so tests can drive the
 * state machine without touching the browser's getDisplayMedia API.
 */

import { useEffect, useMemo, useReducer, useState } from 'react';
import type { ReactElement } from 'react';
import {
  selectEncoder,
  computeBitrate,
  draftReducer,
  createDraft,
  finalizeDraft,
  checkElapsed,
  checkMinDuration,
  DEFAULT_MAX_DURATION_MS,
  MIN_DURATION_MS,
  type SupportMatrix,
  type EncoderResult,
  type DraftMachine,
  type DraftState,
  type FinalizedDraft,
  type BitrateParams,
  type TimingConfig,
} from '@domio/recording';

export type { FinalizedDraft } from '@domio/recording';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RecordingPanelProps {
  /** Width of the recorded viewport. Drives bitrate math. */
  readonly viewportWidth: number;
  /** Height of the recorded viewport. Drives bitrate math. */
  readonly viewportHeight: number;
  /** Frame rate of the recording. Defaults to 30. */
  readonly fps?: number;
  /** Injectable stop handler so tests can finalize a recording. */
  readonly onFinalize?: (draft: FinalizedDraft) => void;
  /** Injectable support matrix so tests run without getDisplayMedia. */
  readonly supportMatrix?: () => SupportMatrix;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_SUPPORT: SupportMatrix = { h264: true, vp9: true };

function describeEncoder(result: EncoderResult): string {
  if ('unsupported' in result) return 'none (unsupported)';
  return result.mimeType;
}

const STATE_LABELS: Record<DraftState, string> = {
  idle: 'Idle',
  recording: 'Recording',
  paused: 'Paused',
  finalized: 'Finalized',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecordingPanel({
  viewportWidth,
  viewportHeight,
  fps = 30,
  onFinalize,
  supportMatrix,
}: RecordingPanelProps): ReactElement {
  const support = useMemo(
    () => (supportMatrix ? supportMatrix() : DEFAULT_SUPPORT),
    [supportMatrix],
  );
  const encoderChoice = useMemo(() => selectEncoder(support), [support]);

  const bitrateParams: BitrateParams = useMemo(() => {
    return {
      width: viewportWidth,
      height: viewportHeight,
      fps,
      tier: 'high',
    };
  }, [viewportWidth, viewportHeight, fps]);

  const bitrateKbps = useMemo(() => computeBitrate(bitrateParams), [bitrateParams]);

  // Initialize the draft state machine.
  const initialMachine = useMemo(() => createDraft(), []);
  // The pure draftReducer takes (machine, action, now) — wrap it so React's
  // useReducer only sees (state, action) and we pass `Date.now()` as the
  // wall-clock source for `startedAt`.
  const reducer = useMemo(
    () => (state: DraftMachine, action: import('@domio/recording').DraftAction): DraftMachine =>
      draftReducer(state, action, Date.now()),
    [],
  );
  const [machine, dispatch] = useReducer(reducer, initialMachine);
  const [now, setNow] = useState<number>(() => Date.now());

  // Tick clock so elapsed counter updates at ~1Hz.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  const timingConfig: TimingConfig = useMemo(
    () => ({
      maxDurationMs: DEFAULT_MAX_DURATION_MS,
      minDurationMs: MIN_DURATION_MS,
    }),
    [],
  );

  const elapsed =
    machine.state === 'recording' && machine.startedAt !== null
      ? now - machine.startedAt
      : machine.state === 'paused' && machine.startedAt !== null
        ? Math.floor(now / 2 - machine.startedAt / 2) // demo: simulate
        : 0;
  // checkElapsed(startMs, nowMs, config?) returns TimingCheck { stopped, elapsedMs }.
  // We use stopped (true when elapsed >= maxDurationMs) instead of `exceeded`.
  const elapsedCheck = checkElapsed(
    machine.startedAt ?? now,
    now,
    timingConfig,
  );
  // checkMinDuration(durationMs) returns MinGuardResult { discarded, warning }.
  const minCheck = checkMinDuration(elapsed);

  const handleStart = (): void => {
    dispatch({ type: 'start' });
  };

  const handlePause = (): void => {
    dispatch({ type: 'pause' });
  };

  const handleResume = (): void => {
    dispatch({ type: 'resume' });
  };

  const handleStop = (): void => {
    // Two-step: finalize() handles the actual transition + summary.
    // We approximate the elapsed by passing `now` as the chunk count is unknown.
    const draft: DraftMachine = { ...machine };
    const result = finalizeDraft(draft, now);
    dispatch({ type: 'finalize' });
    if (onFinalize) {
      onFinalize(result);
    }
  };

  // Compute progress (0..1) for the progress bar.
  const progress = Math.min(elapsed / DEFAULT_MAX_DURATION_MS, 1);
  const remaining = Math.max(DEFAULT_MAX_DURATION_MS - elapsed, 0);

  return (
    <section data-testid="recording-panel" className="recording-panel">
      <header className="recording-panel__header">
        <h2>Recording</h2>
        <p data-testid="recording-panel-encoder">
          Encoder: {describeEncoder(encoderChoice)}
        </p>
        <p data-testid="recording-panel-bitrate">
          Bitrate: {bitrateKbps.toFixed(0)} kbps · {viewportWidth}×{viewportHeight}@{fps}fps
        </p>
      </header>

      <div className="recording-panel__state">
        <span data-testid="recording-panel-status" data-state={machine.state}>
          {STATE_LABELS[machine.state]}
        </span>
        <span data-testid="recording-panel-elapsed">
          Elapsed: {Math.floor(elapsed / 1000)}s
        </span>
        <span data-testid="recording-panel-remaining">
          Remaining: {Math.floor(remaining / 1000)}s
        </span>
      </div>

      <div
        className="recording-panel__progress"
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        data-testid="recording-panel-progress"
      >
        <div
          className="recording-panel__progress-bar"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="recording-panel__controls">
        <button
          type="button"
          onClick={handleStart}
          disabled={machine.state !== 'idle' && machine.state !== 'finalized'}
          data-testid="recording-panel-start"
        >
          Start
        </button>
        <button
          type="button"
          onClick={handlePause}
          disabled={machine.state !== 'recording'}
          data-testid="recording-panel-pause"
        >
          Pause
        </button>
        <button
          type="button"
          onClick={handleResume}
          disabled={machine.state !== 'paused'}
          data-testid="recording-panel-resume"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={handleStop}
          disabled={machine.state !== 'recording' && machine.state !== 'paused'}
          data-testid="recording-panel-stop"
        >
          Stop
        </button>
      </div>

      {machine.state === 'finalized' ? (
        <div data-testid="recording-panel-finalized" className="recording-panel__finalized">
          <strong>Recording finalized.</strong>
          <span data-testid="recording-panel-finalized-chunks">
            Chunks: {machine.chunks.length}
          </span>
        </div>
      ) : null}

      {elapsedCheck.stopped ? (
        <p data-testid="recording-panel-warning-max" role="alert" className="recording-panel__warning">
          Recording exceeded max duration ({DEFAULT_MAX_DURATION_MS / 1000}s). Auto-stop recommended.
        </p>
      ) : null}

      {minCheck.discarded && machine.state === 'finalized' ? (
        <p data-testid="recording-panel-warning-min" role="alert" className="recording-panel__warning">
          Recording shorter than the minimum ({MIN_DURATION_MS / 1000}s) and cannot be saved.
        </p>
      ) : null}
    </section>
  );
}

// Default export for consumption without explicit named import.
export default RecordingPanel;
