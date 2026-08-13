/**
 * VideoTrimmer — non-destructive video clip mask editor.
 *
 * Per Wave 2 §S2.10 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Range-select on the timeline; edits stored as a clip mask (start/end
 * time in source milliseconds) instead of mutating the source.
 */

'use client';

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';

export interface VideoTrim {
  /** Start time in ms within the source. */
  startMs: number;
  /** End time in ms within the source. */
  endMs: number;
}

export interface VideoTrimmerProps {
  /** Source duration in ms. */
  durationMs: number;
  /** Current trim. */
  value: VideoTrim;
  onChange: (trim: VideoTrim) => void;
}

export function VideoTrimmer({ durationMs, value, onChange }: VideoTrimmerProps): ReactElement {
  const [pending, setPending] = useState<VideoTrim>(value);

  const handleStart = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = { ...pending, startMs: Math.min(Number(e.target.value), pending.endMs - 100) };
      setPending(next);
      onChange(next);
    },
    [pending, onChange],
  );

  const handleEnd = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = { ...pending, endMs: Math.max(Number(e.target.value), pending.startMs + 100) };
      setPending(next);
      onChange(next);
    },
    [pending, onChange],
  );

  const startPct = durationMs === 0 ? 0 : (pending.startMs / durationMs) * 100;
  const endPct = durationMs === 0 ? 100 : (pending.endMs / durationMs) * 100;

  return (
    <div className="video-trimmer" data-testid="video-trimmer">
      <div className="video-trimmer__timeline">
        <div
          className="video-trimmer__selection"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          data-testid="video-trimmer-selection"
        />
      </div>
      <div className="video-trimmer__controls">
        <label>
          Start
          <input
            type="range"
            min="0"
            max={durationMs}
            step="100"
            value={pending.startMs}
            onChange={handleStart}
            data-testid="video-trimmer-start"
          />
          <span>{pending.startMs}ms</span>
        </label>
        <label>
          End
          <input
            type="range"
            min="0"
            max={durationMs}
            step="100"
            value={pending.endMs}
            onChange={handleEnd}
            data-testid="video-trimmer-end"
          />
          <span>{pending.endMs}ms</span>
        </label>
        <span className="video-trimmer__duration">
          Duration: {pending.endMs - pending.startMs}ms
        </span>
      </div>
    </div>
  );
}
