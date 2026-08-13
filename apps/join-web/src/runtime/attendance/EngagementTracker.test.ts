/**
 * EngagementTracker tests.
 *
 * Per Wave 5 §S5.4 spec:
 *   recordInteraction('click'); recordRejoin(); getScore() > 0
 *   subscribe pattern works
 */

import { describe, expect, it } from 'vitest';
import { EngagementTracker } from './EngagementTracker';

describe('EngagementTracker', () => {
  it('returns a positive score after an interaction + rejoin (per spec)', () => {
    const clock = { now: 0 };
    const tracker = new EngagementTracker({ now: () => clock.now });
    // Initialize the dwell sampler.
    void tracker.getScore();
    tracker.recordInteraction('click');
    tracker.recordRejoin();
    clock.now = 1_000; // 1s of dwell
    const score = tracker.getScore();
    // 1 interaction (+1) + 1 rejoin (-1) + 1s dwell (+0.1) = 0.1
    expect(score).toBeGreaterThan(0);
    expect(score).toBeCloseTo(0.1, 5);
  });

  it('caps interaction points at 100 per 5-min window', () => {
    const clock = { now: 0 };
    const tracker = new EngagementTracker({ now: () => clock.now });
    for (let i = 0; i < 150; i += 1) tracker.recordInteraction('click');
    const score = tracker.getScore();
    // 100 interactions cap → at most 100; dwell negligible.
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(99);
  });

  it('rejoin penalty subtracts from the score', () => {
    const clock = { now: 0 };
    const tracker = new EngagementTracker({ now: () => clock.now });
    tracker.recordInteraction('click'); // +1
    tracker.recordInteraction('click'); // +1
    tracker.recordRejoin(); // -1
    tracker.recordRejoin(); // -1
    const score = tracker.getScore();
    expect(score).toBe(0);
  });

  it('evicts events outside the rolling 5-min window', () => {
    const clock = { now: 0 };
    const tracker = new EngagementTracker({ now: () => clock.now });
    // Initialize the dwell sampler.
    void tracker.getScore();
    // Record two interactions, then jump 6 minutes forward in one
    // step. The interactions are outside the 5-min window and evicted.
    tracker.recordInteraction('click'); // +1
    tracker.recordInteraction('click'); // +1
    expect(tracker.getScore()).toBeGreaterThanOrEqual(2);

    clock.now = 6 * 60 * 1_000; // 6 min
    const score = tracker.getScore();
    // Interaction points gone. Dwell during the gap is partially
    // counted: 300 seconds in the window × 0.1 = 30.05 (the last
    // sample rolls in at fullSeconds = 360, then evict keeps 300).
    expect(score).toBeGreaterThanOrEqual(30);
    expect(score).toBeLessThan(36);
  });

  it('subscribe fires on every mutation', () => {
    const clock = { now: 0 };
    const tracker = new EngagementTracker({ now: () => clock.now });
    const observed: number[] = [];
    tracker.subscribe((s) => observed.push(s));

    tracker.recordInteraction('click');
    tracker.recordRejoin();
    tracker.recordInteraction('submit');

    expect(observed.length).toBe(3);
    // Each subsequent observation should be ≤ the previous (penalty can lower).
    expect(observed[0]).toBeGreaterThan(observed[1]!);
    expect(observed[1]).toBeLessThanOrEqual(observed[2]!);
  });

  it('subscribe returns an unsubscribe function', () => {
    const clock = { now: 0 };
    const tracker = new EngagementTracker({ now: () => clock.now });
    let count = 0;
    const off = tracker.subscribe(() => {
      count += 1;
    });
    tracker.recordInteraction('click');
    off();
    tracker.recordInteraction('click');
    expect(count).toBe(1);
  });
});
