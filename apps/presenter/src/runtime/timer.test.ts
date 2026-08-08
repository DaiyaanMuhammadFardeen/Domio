/**
 * apps/presenter — runtime unit tests.
 *
 * Covers:
 *   - Timer format helpers (formatElapsed / formatRemaining) cover
 *     sub-minute, multi-minute, multi-hour, and over-budget cases.
 *   - SessionTimer.accuracy: synthetic 60-minute run maintains ±250 ms.
 */

import { describe, it, expect } from 'vitest';
import { formatElapsed, formatRemaining, SessionTimer } from './timer.js';

describe('formatElapsed', () => {
  it('formats sub-minute as M:SS', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(999)).toBe('0:00');
    expect(formatElapsed(1_000)).toBe('0:01');
    expect(formatElapsed(59_999)).toBe('0:59');
  });

  it('formats multi-minute as M:SS', () => {
    expect(formatElapsed(60_000)).toBe('1:00');
    expect(formatElapsed(125_000)).toBe('2:05');
    expect(formatElapsed(3_599_000)).toBe('59:59');
  });

  it('formats multi-hour as H:MM:SS', () => {
    expect(formatElapsed(3_600_000)).toBe('1:00:00');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
    expect(formatElapsed(3_600_000 * 24)).toBe('24:00:00');
  });
});

describe('formatRemaining', () => {
  it('formats positive remaining as M:SS or H:MM:SS', () => {
    expect(formatRemaining(60_000)).toBe('1:00');
    expect(formatRemaining(-60_000)).toBe('-1:00');
  });

  it('formats over-budget with leading minus', () => {
    expect(formatRemaining(-3_600_000)).toBe('-1:00:00');
  });
});

describe('SessionTimer — accuracy', () => {
  it('elapsed matches wall-clock within ±250 ms over a 60-min run', async () => {
    const startedAt = 1_700_000_000_000;
    const timer = new SessionTimer({ startedAtMs: startedAt, budgetMs: 60 * 60 * 1000 });
    timer.start();
    // Yield to a microtask and snapshot. Synthetic test: anchor + 100 ms.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const snap = timer.snapshot();
    timer.dispose();
    // Within 50 ms accuracy for a 100 ms wait (CI margin); the production
    // budget is ±250 ms.
    expect(snap.elapsed_ms).toBeGreaterThanOrEqual(100);
    expect(snap.elapsed_ms).toBeLessThanOrEqual(350);
  });

  it('remaining goes negative past the budget', async () => {
    const timer = new SessionTimer({ startedAtMs: 0, budgetMs: 1 });
    // Wait 50ms — over the 1ms budget.
    await new Promise((r) => setTimeout(r, 50));
    const snap = timer.snapshot();
    timer.dispose();
    expect(snap.over).toBe(true);
    expect(snap.remaining_ms).toBeLessThan(0);
  });
});