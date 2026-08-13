import { describe, expect, it } from 'vitest';
import { withinBudget, pickDriftStrategy, updateDrift, type DriftState } from './sync.js';

// ─── withinBudget ───────────────────────────────────────────────────────────

describe('withinBudget', () => {
  it('returns true when offset is within budget', () => {
    expect(withinBudget(0)).toBe(true);
    expect(withinBudget(50)).toBe(true);
    expect(withinBudget(-50)).toBe(true);
    expect(withinBudget(100)).toBe(true);
    expect(withinBudget(-100)).toBe(true);
  });

  it('returns false when offset exceeds budget', () => {
    expect(withinBudget(101)).toBe(false);
    expect(withinBudget(-101)).toBe(false);
    expect(withinBudget(500)).toBe(false);
  });

  it('uses default budget of 100ms', () => {
    expect(withinBudget(99)).toBe(true);
    expect(withinBudget(101)).toBe(false);
  });

  it('accepts custom budget', () => {
    expect(withinBudget(30, 40)).toBe(true);
    expect(withinBudget(50, 40)).toBe(false);
  });

  it('handles zero budget', () => {
    expect(withinBudget(0, 0)).toBe(true);
    expect(withinBudget(1, 0)).toBe(false);
  });
});

// ─── pickDriftStrategy ──────────────────────────────────────────────────────

describe('pickDriftStrategy', () => {
  it('returns none when within budget', () => {
    expect(pickDriftStrategy(0)).toBe('none');
    expect(pickDriftStrategy(50)).toBe('none');
    expect(pickDriftStrategy(-50)).toBe('none');
    expect(pickDriftStrategy(100)).toBe('none');
  });

  it('returns resample when between budget and 2×budget', () => {
    expect(pickDriftStrategy(101)).toBe('resample');
    expect(pickDriftStrategy(150)).toBe('resample');
    expect(pickDriftStrategy(200)).toBe('resample');
    expect(pickDriftStrategy(-150)).toBe('resample');
  });

  it('returns pause-and-realign when beyond 2×budget', () => {
    expect(pickDriftStrategy(201)).toBe('pause-and-realign');
    expect(pickDriftStrategy(500)).toBe('pause-and-realign');
    expect(pickDriftStrategy(-300)).toBe('pause-and-realign');
  });

  it('uses custom budget', () => {
    expect(pickDriftStrategy(45, 40)).toBe('resample'); // 40 < 45 <= 80
    expect(pickDriftStrategy(81, 40)).toBe('pause-and-realign'); // > 80
  });
});

// ─── updateDrift ────────────────────────────────────────────────────────────

describe('updateDrift', () => {
  const initialState: DriftState = {
    lastOffsetMs: 0,
    cumulativeMs: 0,
    reSyncCount: 0,
  };

  it('no re-sync when within budget', () => {
    const result = updateDrift(initialState, 50);
    expect(result.needsReSync).toBe(false);
    expect(result.strategy).toBe('none');
    expect(result.state.lastOffsetMs).toBe(50);
    expect(result.state.cumulativeMs).toBe(50);
    expect(result.state.reSyncCount).toBe(0);
  });

  it('triggers re-sync when beyond 2×budget', () => {
    const result = updateDrift(initialState, 300);
    expect(result.needsReSync).toBe(true);
    expect(result.strategy).toBe('pause-and-realign');
    expect(result.state.reSyncCount).toBe(1);
  });

  it('does not increment reSyncCount when resample is chosen', () => {
    const result = updateDrift(initialState, 150);
    expect(result.needsReSync).toBe(false);
    expect(result.strategy).toBe('resample');
    expect(result.state.reSyncCount).toBe(0);
  });

  it('accumulates cumulative drift', () => {
    let state = initialState;
    state = updateDrift(state, 50).state;
    state = updateDrift(state, 80).state;
    state = updateDrift(state, 30).state;
    expect(state.cumulativeMs).toBe(160);
  });

  it('counts multiple re-syncs', () => {
    let state = initialState;
    state = updateDrift(state, 300).state;
    state = updateDrift(state, 250).state;
    state = updateDrift(state, 400).state;
    expect(state.reSyncCount).toBe(3);
  });

  it('handles zero offset', () => {
    const result = updateDrift(initialState, 0);
    expect(result.needsReSync).toBe(false);
    expect(result.strategy).toBe('none');
  });

  it('uses custom budget', () => {
    const result = updateDrift(initialState, 85, 40);
    expect(result.needsReSync).toBe(true); // 85 > 80
    expect(result.strategy).toBe('pause-and-realign');
  });
});
