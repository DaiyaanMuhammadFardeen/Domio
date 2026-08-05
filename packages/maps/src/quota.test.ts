import { describe, it, expect } from 'vitest';
import { getQuotaFallback, incrementUsage } from './quota.js';
import type { QuotaState } from './quota.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getQuotaFallback', () => {
  it('returns live when usage is well under quota', () => {
    const state: QuotaState = { used: 1000, limit: 50000 };
    const result = getQuotaFallback(state);
    expect(result.fallback).toBe('live');
  });

  it('returns static when usage exceeds the static threshold (90%)', () => {
    const state: QuotaState = { used: 46000, limit: 50000 };
    const result = getQuotaFallback(state);
    expect(result.fallback).toBe('static');
    expect(result.reason).toContain('92%');
  });

  it('returns simplified when usage exceeds the simplified threshold (100%)', () => {
    const state: QuotaState = { used: 51000, limit: 50000 };
    const result = getQuotaFallback(state);
    expect(result.fallback).toBe('simplified');
    expect(result.reason).toContain('102%');
  });

  it('returns live when limit is 0 (unlimited)', () => {
    const state: QuotaState = { used: 999999, limit: 0 };
    const result = getQuotaFallback(state);
    expect(result.fallback).toBe('live');
    expect(result.reason).toContain('Unlimited');
  });

  it('returns live when limit is negative (invalid)', () => {
    const state: QuotaState = { used: 100, limit: -1 };
    const result = getQuotaFallback(state);
    expect(result.fallback).toBe('live');
  });

  it('uses custom static threshold when provided', () => {
    const state: QuotaState = {
      used: 800,
      limit: 1000,
      staticThreshold: 0.7,
    };
    const result = getQuotaFallback(state);
    expect(result.fallback).toBe('static');
  });

  it('uses custom simplified threshold when provided', () => {
    const state: QuotaState = {
      used: 950,
      limit: 1000,
      staticThreshold: 0.8,
      simplifiedThreshold: 0.9,
    };
    const result = getQuotaFallback(state);
    expect(result.fallback).toBe('simplified');
  });

  it('returns live at exactly 0 usage', () => {
    const state: QuotaState = { used: 0, limit: 50000 };
    const result = getQuotaFallback(state);
    expect(result.fallback).toBe('live');
  });

  it('returns static at exactly 90% (default threshold)', () => {
    const state: QuotaState = { used: 45000, limit: 50000 };
    const result = getQuotaFallback(state);
    expect(result.fallback).toBe('static');
  });

  it('returns simplified at exactly 100% (default threshold)', () => {
    const state: QuotaState = { used: 50000, limit: 50000 };
    const result = getQuotaFallback(state);
    expect(result.fallback).toBe('simplified');
  });
});

describe('incrementUsage', () => {
  it('increments by 1 by default', () => {
    const state: QuotaState = { used: 100, limit: 50000 };
    const next = incrementUsage(state);
    expect(next.used).toBe(101);
    expect(next.limit).toBe(50000);
  });

  it('increments by a custom amount', () => {
    const state: QuotaState = { used: 100, limit: 50000 };
    const next = incrementUsage(state, 10);
    expect(next.used).toBe(110);
  });

  it('does not mutate the original state', () => {
    const state: QuotaState = { used: 100, limit: 50000 };
    incrementUsage(state, 50);
    expect(state.used).toBe(100);
  });

  it('preserves custom thresholds', () => {
    const state: QuotaState = {
      used: 100,
      limit: 50000,
      staticThreshold: 0.7,
      simplifiedThreshold: 0.95,
    };
    const next = incrementUsage(state);
    expect(next.staticThreshold).toBe(0.7);
    expect(next.simplifiedThreshold).toBe(0.95);
  });
});
