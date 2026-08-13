'use client';

/**
 * TimeBudgetAlerts — per-slide time-budget alert bar.
 *
 * Per Wave 4 §S4.13 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Sister to AgendaTimer / SoftHardAlerts but scoped to the CURRENT
 * slide. The presenter sets a budget per slide (e.g. 90s for the
 * demo, 30s for the transition). The bar:
 *   - fills in over `dwellMs` (time since slide became active)
 *   - goes yellow at soft threshold (default 80% of budget)
 *   - goes red and fires `onHardAlert` at hard threshold (default 100%)
 *
 * Soft/hard thresholds can be overridden per-slide via the
 * `thresholds` map. When the bar crosses a threshold, the matching
 * callback fires exactly once.
 */

import { useEffect, useRef, type ReactElement } from 'react';

export interface SlideThreshold {
  readonly softPct?: number;
  readonly hardPct?: number;
}

export interface TimeBudgetAlertsProps {
  /** ms since the current slide became active (dwell time). */
  readonly dwellMs: number;
  /** ms budget for the current slide. */
  readonly budgetMs: number;
  /** Per-slide threshold overrides (softPct 0–1, hardPct 0–1). */
  readonly thresholds?: SlideThreshold;
  readonly onSoftAlert?: () => void;
  readonly onHardAlert?: () => void;
  readonly dataTestId?: string;
}

export function TimeBudgetAlerts({
  dwellMs,
  budgetMs,
  thresholds,
  onSoftAlert,
  onHardAlert,
  dataTestId = 'time-budget-alerts',
}: TimeBudgetAlertsProps): ReactElement {
  const softPct = thresholds?.softPct ?? 0.8;
  const hardPct = thresholds?.hardPct ?? 1.0;
  const pct = budgetMs > 0 ? dwellMs / budgetMs : 0;
  const level: 'safe' | 'soft' | 'hard' =
    pct >= hardPct ? 'hard' : pct >= softPct ? 'soft' : 'safe';

  // Fire each callback exactly once per (re-)entry into the level.
  const firedSoft = useRef(false);
  const firedHard = useRef(false);
  useEffect(() => {
    if (level === 'soft' && !firedSoft.current) {
      firedSoft.current = true;
      onSoftAlert?.();
    }
    if (level === 'hard' && !firedHard.current) {
      firedHard.current = true;
      onHardAlert?.();
    }
    if (level === 'safe') {
      firedSoft.current = false;
      firedHard.current = false;
    }
  }, [level, onSoftAlert, onHardAlert]);

  const width = `${Math.min(100, Math.max(0, pct * 100))}%`;
  const barColor =
    level === 'hard' ? 'var(--danger)' : level === 'soft' ? 'var(--warning)' : 'var(--success)';

  return (
    <div
      data-testid={dataTestId}
      data-level={level}
      data-pct={pct.toFixed(2)}
      style={{
        height: 6,
        background: 'var(--surface-raised)',
        borderRadius: 3,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        data-testid={`${dataTestId}-bar`}
        style={{
          width,
          height: '100%',
          background: barColor,
          transition: 'width 200ms linear',
        }}
      />
    </div>
  );
}
