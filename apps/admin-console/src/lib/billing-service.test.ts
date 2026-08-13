/**
 * Billing service tests — Wave 10 §S10.6.
 *
 * Verifies the deterministic seed fallback (because the API endpoint
 * is not wired up in this environment) and the CRUD behavior on the
 * rate-limit store.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRateLimitRule,
  deleteRateLimitRule,
  formatCents,
  formatCompact,
  getUsageSeries,
  getUsageSummary,
  listAgentUsage,
  listRateLimitRules,
  projectMonthlyCost,
  updateRateLimitRule,
  type RateLimitRule,
  type RateLimitRuleInput,
} from './billing-service';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Force every fetcher call to reject so we exercise the seed fallback.
  // Per S10.6 the service must still return realistic-looking data when
  // the backend is unreachable.
  globalThis.fetch = vi.fn(async () => {
    throw new Error('network unreachable');
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('billing-service', () => {
  it('getUsageSummary returns 30-day totals with non-zero cost', async () => {
    const summary = await getUsageSummary();
    expect(summary.api_calls).toBeGreaterThan(0);
    expect(summary.ai_tokens).toBeGreaterThan(0);
    expect(summary.render_minutes).toBeGreaterThan(0);
    expect(summary.export_minutes).toBeGreaterThan(0);
    expect(summary.cost_cents).toBeGreaterThan(0);
    expect(summary.period_end_ms).toBeGreaterThan(summary.period_start_ms);
  });

  it('getUsageSeries returns the requested number of points', async () => {
    const series = await getUsageSeries('api_calls', 30);
    expect(series.metric).toBe('api_calls');
    expect(series.series).toHaveLength(30);
    for (const point of series.series) {
      expect(typeof point.date_ms).toBe('number');
      expect(typeof point.value).toBe('number');
      expect(point.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('getUsageSeries clamps absurd ranges', async () => {
    const series = await getUsageSeries('ai_tokens', 9999);
    expect(series.series.length).toBeLessThanOrEqual(90);
  });

  it('getUsageSeries defaults to api_calls when given an unknown metric', async () => {
    const series = await getUsageSeries('not-a-real-metric', 7);
    expect(series.metric).toBe('api_calls');
    expect(series.series).toHaveLength(7);
  });

  it('listAgentUsage returns 4-5 seeded agents', async () => {
    const agents = await listAgentUsage();
    expect(agents.length).toBeGreaterThanOrEqual(4);
    expect(agents.length).toBeLessThanOrEqual(5);
    const totalCost = agents.reduce((acc, a) => acc + a.cost_cents, 0);
    expect(totalCost).toBeGreaterThan(0);
  });

  it('listRateLimitRules returns 3-4 seeded rules', async () => {
    const rules = await listRateLimitRules();
    expect(rules.length).toBeGreaterThanOrEqual(3);
    expect(rules.length).toBeLessThanOrEqual(4);
    const scopes = new Set(rules.map((r) => r.scope));
    // Seed covers per_key, per_agent, and per_ip.
    expect(scopes.has('per_key')).toBe(true);
    expect(scopes.has('per_agent')).toBe(true);
    expect(scopes.has('per_ip')).toBe(true);
  });

  it('createRateLimitRule adds a new rule with current_usage = 0', async () => {
    const before = await listRateLimitRules();
    const input: RateLimitRuleInput = {
      scope: 'per_agent',
      subject: 'agent-new',
      limit: 500,
      window: '5m',
    };
    const created = await createRateLimitRule(input);
    expect(created.id).toMatch(/^rl-/);
    expect(created.current_usage).toBe(0);
    expect(created.subject).toBe('agent-new');

    const after = await listRateLimitRules();
    expect(after.length).toBe(before.length + 1);
    expect(after.some((r) => r.id === created.id)).toBe(true);
  });

  it('createRateLimitRule rejects invalid inputs', async () => {
    await expect(
      createRateLimitRule({
        scope: 'per_key',
        subject: '',
        limit: 100,
        window: '1m',
      }),
    ).rejects.toThrow(/Subject/);

    await expect(
      createRateLimitRule({
        scope: 'per_key',
        subject: 'ak-x',
        limit: 0,
        window: '1m',
      }),
    ).rejects.toThrow(/positive/);

    await expect(
      createRateLimitRule({
        scope: 'per_key',
        subject: 'ak-x',
        limit: 10,
        window: 'bogus' as never,
      }),
    ).rejects.toThrow(/window/i);
  });

  it('updateRateLimitRule mutates fields', async () => {
    const before = await listRateLimitRules();
    const target = before[0];
    if (!target) throw new Error('expected seed rule');
    const updated = await updateRateLimitRule(target.id, {
      limit: target.limit + 100,
      window: '1h',
    });
    expect(updated.limit).toBe(target.limit + 100);
    expect(updated.window).toBe('1h');
    expect(updated.subject).toBe(target.subject);
  });

  it('updateRateLimitRule throws for unknown id', async () => {
    await expect(
      updateRateLimitRule('rl-does-not-exist', { limit: 1 }),
    ).rejects.toThrow(/not found/);
  });

  it('deleteRateLimitRule removes from store', async () => {
    const before = await listRateLimitRules();
    const target = before[0];
    if (!target) throw new Error('expected seed rule');
    await deleteRateLimitRule(target.id);
    const after = await listRateLimitRules();
    expect(after.some((r) => r.id === target.id)).toBe(false);
    expect(after.length).toBe(before.length - 1);
  });

  it('deleteRateLimitRule throws for unknown id', async () => {
    await expect(deleteRateLimitRule('rl-nope')).rejects.toThrow(/not found/);
  });

  it('projectMonthlyCost extrapolates the trailing window to a full month', () => {
    const summary = {
      api_calls: 100_000,
      ai_tokens: 5_000_000,
      render_minutes: 1_500,
      export_minutes: 600,
      cost_cents: 42_345,
      period_start_ms: 0,
      period_end_ms: 1,
    };
    const projection = projectMonthlyCost(30, summary);
    // 30-day observation → identical to the input cost.
    expect(projection.monthly_cost_cents).toBe(summary.cost_cents);
    expect(projection.days_observed).toBe(30);

    const half = projectMonthlyCost(15, summary);
    expect(half.monthly_cost_cents).toBe(summary.cost_cents * 2);
  });

  it('formatCents pads dollars and supports negative values', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(123)).toBe('$1.23');
    expect(formatCents(12345)).toBe('$123.45');
    expect(formatCents(-250)).toBe('-$2.50');
  });

  it('formatCompact picks k/M suffix based on magnitude', () => {
    expect(formatCompact(900)).toBe('900');
    expect(formatCompact(1_500)).toBe('1.5k');
    expect(formatCompact(12_000)).toBe('12k');
    expect(formatCompact(2_500_000)).toBe('2.5M');
    expect(formatCompact(50_000_000)).toBe('50M');
  });

  it('returned rule objects are isolated from the internal store', async () => {
    const rules = await listRateLimitRules();
    expect(rules.length).toBeGreaterThan(0);
    const first: RateLimitRule = rules[0] as RateLimitRule;
    first.subject = 'mutated-by-test';
    const refetched = await listRateLimitRules();
    expect(refetched[0]?.subject).not.toBe('mutated-by-test');
  });
});
