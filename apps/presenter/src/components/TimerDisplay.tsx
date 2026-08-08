'use client';

/**
 * TimerDisplay — elapsed / remaining session timer.
 *
 * Uses performance.now() anchored to the session start. The tick rate
 * is 60 Hz under the default motion preference; reduced-motion users
 * get a 1 Hz tick (the SessionTimer ticks less aggressively).
 */

import { useEffect, useState } from 'react';
import { SessionTimer, formatElapsed, formatRemaining } from '../runtime/timer';

export interface TimerDisplayProps {
  /** Wall-clock ms at which the session started. */
  startedAtMs: number;
  /** Total session budget in ms. */
  budgetMs: number;
  /** Reduced-motion override. */
  reducedMotion?: boolean;
}

export function TimerDisplay({ startedAtMs, budgetMs, reducedMotion }: TimerDisplayProps) {
  const [tick, setTick] = useState(() => ({ elapsed_ms: 0, remaining_ms: budgetMs, over: false }));

  useEffect(() => {
    const opts: { startedAtMs: number; budgetMs: number; reducedMotion?: boolean } = { startedAtMs, budgetMs };
    if (reducedMotion !== undefined) opts.reducedMotion = reducedMotion;
    const timer = new SessionTimer(opts);
    const dispose = timer.onTick(setTick);
    timer.start();
    return () => {
      dispose();
      timer.dispose();
    };
  }, [startedAtMs, budgetMs, reducedMotion]);

  return (
    <div className="panel">
      <p className="panel__title">Session timer</p>
      <div className="timer">
        <span className="timer__elapsed" aria-label="Elapsed time">
          {formatElapsed(tick.elapsed_ms)}
        </span>
        <span className={`timer__remaining ${tick.over ? 'timer__remaining--over' : ''}`}
              aria-label={tick.over ? 'Over budget' : 'Remaining time'}>
          {tick.over ? '−' : ''}{formatRemaining(Math.abs(tick.remaining_ms))}
        </span>
      </div>
    </div>
  );
}