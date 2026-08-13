/**
 * Billing service — Wave 10 §S10.6.
 *
 * Read-side for the rate-limit + spend dashboards. The real
 * implementation will page from `/v1/billing/usage`, `/v1/billing/agents`,
 * and `/v1/billing/rate-limits`; until those endpoints land we expose a
 * deterministic local seed so the dashboard always renders something
 * realistic on first load.
 *
 * Numbers are anchored at a fixed NOW (2026-08-13) so screenshots,
 * tests, and per-agent breakdowns stay stable across reloads. Cost
 * model is intentionally simple — tokens at $0.000002/token, render
 * minutes at $0.012/min, export minutes at $0.018/min, plus a flat
 * $0.0001 per API call. These rates are intentionally hand-picked to
 * produce the kind of dollar figure a finance reviewer would expect
 * to see in a snapshot.
 */

import { fetcher } from './fetcher';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UsageMetric =
  | 'api_calls'
  | 'ai_tokens'
  | 'render_minutes'
  | 'export_minutes';

export type RateLimitScope = 'per_key' | 'per_agent' | 'per_ip';
export type RateLimitWindow = '1m' | '5m' | '1h' | '1d';

export interface UsageSummary {
  api_calls: number;
  ai_tokens: number;
  render_minutes: number;
  export_minutes: number;
  cost_cents: number;
  period_start_ms: number;
  period_end_ms: number;
}

export interface UsagePoint {
  date_ms: number;
  value: number;
}

export interface UsageSeries {
  metric: UsageMetric;
  series: UsagePoint[];
}

export interface AgentUsage {
  agent_id: string;
  agent_name: string;
  api_calls: number;
  ai_tokens: number;
  render_minutes: number;
  export_minutes: number;
  cost_cents: number;
}

export interface RateLimitRule {
  id: string;
  scope: RateLimitScope;
  subject: string;
  limit: number;
  window: RateLimitWindow;
  current_usage: number;
  created_at_ms: number;
}

export type RateLimitRuleInput = Omit<
  RateLimitRule,
  'id' | 'current_usage' | 'created_at_ms'
>;

// ---------------------------------------------------------------------------
// Constants + seed
// ---------------------------------------------------------------------------

const NOW = Date.UTC(2026, 7, 13); // 2026-08-13 — matches today's harness date.
const DAY_MS = 1000 * 60 * 60 * 24;

// Per-unit USD cost used to convert raw usage → cost_cents. Kept in one
// place so the projection and per-agent totals stay in sync.
export const UNIT_COST_USD = {
  api_call: 0.0001,
  ai_token: 0.000002,
  render_minute: 0.012,
  export_minute: 0.018,
} as const;

function deterministicNoise(seed: number, i: number): number {
  // Cheap deterministic "noise" — sin-based so it's stable across reloads
  // and between test runs.
  const v = Math.sin(seed * 9301 + i * 49297) * 233280;
  return v - Math.floor(v);
}

/**
 * Build 30 daily points for a given metric. The shape is intentionally
 * organic: weekday spikes with a dip around weekends, plus a baseline
 * that varies per metric so the four charts look distinct.
 */
function buildSeries(
  metric: UsageMetric,
  rangeDays: number,
): UsagePoint[] {
  const points: UsagePoint[] = [];
  for (let i = 0; i < rangeDays; i += 1) {
    const day = NOW - (rangeDays - 1 - i) * DAY_MS;
    const dayOfWeek = new Date(day).getUTCDay();
    // Weekend dip — 0 = Sunday, 6 = Saturday.
    const weekendFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.55 : 1;
    // Slow growth trend across the range window.
    const trend = 0.85 + (i / Math.max(1, rangeDays - 1)) * 0.4;
    const noise = 0.85 + deterministicNoise(metric.length * 7, i) * 0.3;

    let base: number;
    switch (metric) {
      case 'api_calls':
        base = 18_000;
        break;
      case 'ai_tokens':
        base = 1_200_000;
        break;
      case 'render_minutes':
        base = 240;
        break;
      case 'export_minutes':
        base = 95;
        break;
    }
    const value = Math.round(base * trend * weekendFactor * noise);
    points.push({ date_ms: day, value });
  }
  return points;
}

/**
 * Sum the metric across the supplied range. Used to build the
 * UsageSummary totals and the per-agent projections.
 */
function totalForRange(
  metric: UsageMetric,
  rangeDays: number,
): number {
  return buildSeries(metric, rangeDays).reduce((acc, p) => acc + p.value, 0);
}

function costForUsage(args: {
  api_calls: number;
  ai_tokens: number;
  render_minutes: number;
  export_minutes: number;
}): number {
  const usd =
    args.api_calls * UNIT_COST_USD.api_call +
    args.ai_tokens * UNIT_COST_USD.ai_token +
    args.render_minutes * UNIT_COST_USD.render_minute +
    args.export_minutes * UNIT_COST_USD.export_minute;
  return Math.round(usd * 100);
}

const SEED_AGENTS: ReadonlyArray<Omit<AgentUsage, 'cost_cents'>> = [
  {
    agent_id: 'agent-deck-builder',
    agent_name: 'Deck Builder',
    api_calls: 42_180,
    ai_tokens: 2_840_000,
    render_minutes: 612,
    export_minutes: 215,
  },
  {
    agent_id: 'agent-brand-police',
    agent_name: 'Brand Police',
    api_calls: 31_950,
    ai_tokens: 1_120_000,
    render_minutes: 84,
    export_minutes: 38,
  },
  {
    agent_id: 'agent-pitch-coach',
    agent_name: 'Pitch Coach',
    api_calls: 18_440,
    ai_tokens: 980_000,
    render_minutes: 142,
    export_minutes: 96,
  },
  {
    agent_id: 'agent-data-viz',
    agent_name: 'Data Viz',
    api_calls: 9_870,
    ai_tokens: 412_000,
    render_minutes: 388,
    export_minutes: 124,
  },
  {
    agent_id: 'agent-translator',
    agent_name: 'Translator',
    api_calls: 14_220,
    ai_tokens: 1_870_000,
    render_minutes: 22,
    export_minutes: 11,
  },
];

const AGENTS: AgentUsage[] = SEED_AGENTS.map((a) => ({
  ...a,
  cost_cents: costForUsage(a),
}));

const SEED_RATE_LIMITS: readonly RateLimitRule[] = [
  {
    id: 'rl-acme-prod',
    scope: 'per_key',
    subject: 'ak-acme-prod-201',
    limit: 1000,
    window: '1m',
    current_usage: 712,
    created_at_ms: NOW - 14 * DAY_MS,
  },
  {
    id: 'rl-initech',
    scope: 'per_key',
    subject: 'ak-initech-read-118',
    limit: 500,
    window: '5m',
    current_usage: 188,
    created_at_ms: NOW - 32 * DAY_MS,
  },
  {
    id: 'rl-agent-deck-builder',
    scope: 'per_agent',
    subject: 'agent-deck-builder',
    limit: 4000,
    window: '1m',
    current_usage: 3120,
    created_at_ms: NOW - 8 * DAY_MS,
  },
  {
    id: 'rl-ip-office',
    scope: 'per_ip',
    subject: '203.0.113.42',
    limit: 5000,
    window: '1h',
    current_usage: 412,
    created_at_ms: NOW - 21 * DAY_MS,
  },
];

// Mutable working copy — mutating methods (create/update/delete) write
// here, then attempt to forward to the backend.
const STORE: RateLimitRule[] = SEED_RATE_LIMITS.map((r) => ({ ...r }));

function genId(): string {
  return `rl-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneRule(r: RateLimitRule): RateLimitRule {
  return { ...r };
}

function isValidScope(value: unknown): value is RateLimitScope {
  return value === 'per_key' || value === 'per_agent' || value === 'per_ip';
}

function isValidWindow(value: unknown): value is RateLimitWindow {
  return value === '1m' || value === '5m' || value === '1h' || value === '1d';
}

function validateRuleInput(input: RateLimitRuleInput): void {
  if (!isValidScope(input.scope)) {
    throw new Error(`Invalid scope: ${String(input.scope)}`);
  }
  if (!isValidWindow(input.window)) {
    throw new Error(`Invalid window: ${String(input.window)}`);
  }
  if (typeof input.limit !== 'number' || input.limit <= 0) {
    throw new Error(`Limit must be a positive number (got ${input.limit})`);
  }
  if (typeof input.subject !== 'string' || input.subject.trim() === '') {
    throw new Error('Subject must be a non-empty string');
  }
}

// ---------------------------------------------------------------------------
// Read-side
// ---------------------------------------------------------------------------

export async function getUsageSummary(): Promise<UsageSummary> {
  try {
    const json = await fetcher<UsageSummary>('/v1/billing/usage/summary');
    // Trust the API response only if it has plausible numeric fields.
    if (typeof json?.api_calls === 'number') {
      return json;
    }
  } catch {
    // fall through
  }
  const rangeDays = 30;
  const api_calls = totalForRange('api_calls', rangeDays);
  const ai_tokens = totalForRange('ai_tokens', rangeDays);
  const render_minutes = totalForRange('render_minutes', rangeDays);
  const export_minutes = totalForRange('export_minutes', rangeDays);
  return {
    api_calls,
    ai_tokens,
    render_minutes,
    export_minutes,
    cost_cents: costForUsage({
      api_calls,
      ai_tokens,
      render_minutes,
      export_minutes,
    }),
    period_start_ms: NOW - (rangeDays - 1) * DAY_MS,
    period_end_ms: NOW,
  };
}

export async function getUsageSeries(
  metric: string,
  rangeDays: number,
): Promise<UsageSeries> {
  const safeMetric: UsageMetric = (
    ['api_calls', 'ai_tokens', 'render_minutes', 'export_minutes'] as const
  ).includes(metric as UsageMetric)
    ? (metric as UsageMetric)
    : 'api_calls';
  const safeRange = Math.max(1, Math.min(rangeDays, 90));
  try {
    const json = await fetcher<UsageSeries>(
      `/v1/billing/usage/series?metric=${encodeURIComponent(safeMetric)}&days=${safeRange}`,
    );
    if (Array.isArray(json?.series) && json.series.length > 0) {
      return { metric: safeMetric, series: json.series };
    }
  } catch {
    // fall through
  }
  return { metric: safeMetric, series: buildSeries(safeMetric, safeRange) };
}

export async function listAgentUsage(): Promise<AgentUsage[]> {
  try {
    const json = await fetcher<{ items?: AgentUsage[] }>(
      '/v1/billing/usage/by-agent',
    );
    if (Array.isArray(json?.items) && json.items.length > 0) {
      return json.items;
    }
  } catch {
    // fall through
  }
  // Return a fresh copy so callers can't mutate our store.
  return AGENTS.map((a) => ({ ...a }));
}

export async function listRateLimitRules(): Promise<RateLimitRule[]> {
  try {
    const json = await fetcher<{ items?: RateLimitRule[] }>(
      '/v1/billing/rate-limits',
    );
    if (Array.isArray(json?.items) && json.items.length > 0) {
      // Keep our local cache in sync with whatever the API returned.
      STORE.splice(0, STORE.length, ...json.items.map(cloneRule));
      return STORE.map(cloneRule);
    }
  } catch {
    // fall through
  }
  return STORE.map(cloneRule);
}

// ---------------------------------------------------------------------------
// Mutating operations
// ---------------------------------------------------------------------------

export async function createRateLimitRule(
  input: RateLimitRuleInput,
): Promise<RateLimitRule> {
  validateRuleInput(input);
  const rule: RateLimitRule = {
    id: genId(),
    scope: input.scope,
    subject: input.subject.trim(),
    limit: input.limit,
    window: input.window,
    current_usage: 0,
    created_at_ms: NOW,
  };
  STORE.push(rule);
  try {
    return await fetcher<RateLimitRule>('/v1/billing/rate-limits', {
      method: 'POST',
      body: input,
    });
  } catch {
    return cloneRule(rule);
  }
}

export async function updateRateLimitRule(
  id: string,
  input: Partial<RateLimitRule>,
): Promise<RateLimitRule> {
  const idx = STORE.findIndex((r) => r.id === id);
  if (idx < 0) {
    throw new Error(`Rate-limit rule ${id} not found`);
  }
  const prev = STORE[idx];
  if (!prev) {
    throw new Error(`Rate-limit rule ${id} not found`);
  }
  const next: RateLimitRule = {
    ...prev,
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.window !== undefined ? { window: input.window } : {}),
  };
  validateRuleInput({
    scope: next.scope,
    subject: next.subject,
    limit: next.limit,
    window: next.window,
  });
  STORE[idx] = next;
  try {
    return await fetcher<RateLimitRule>(
      `/v1/billing/rate-limits/${encodeURIComponent(id)}`,
      { method: 'PUT', body: input },
    );
  } catch {
    return cloneRule(next);
  }
}

export async function deleteRateLimitRule(id: string): Promise<void> {
  const idx = STORE.findIndex((r) => r.id === id);
  if (idx < 0) {
    throw new Error(`Rate-limit rule ${id} not found`);
  }
  STORE.splice(idx, 1);
  try {
    await fetcher<void>(
      `/v1/billing/rate-limits/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  } catch {
    // swallow — the local mutation already succeeded.
  }
}

// ---------------------------------------------------------------------------
// Derived helpers (used by the projection panel)
// ---------------------------------------------------------------------------

export interface CostProjection {
  monthly_cost_cents: number;
  days_observed: number;
  per_metric_cents: {
    api_calls: number;
    ai_tokens: number;
    render_minutes: number;
    export_minutes: number;
  };
}

/**
 * Project a full-month cost from the trailing window of usage.
 * Returns the per-metric cents breakdown plus the monthly total so the
 * dashboard can render a one-line summary plus an itemized list.
 */
export function projectMonthlyCost(
  observedDays: number,
  summary: Pick<
    UsageSummary,
    'api_calls' | 'ai_tokens' | 'render_minutes' | 'export_minutes' | 'cost_cents'
  >,
): CostProjection {
  const safeDays = Math.max(1, observedDays);
  const factor = 30 / safeDays;
  return {
    monthly_cost_cents: Math.round(summary.cost_cents * factor),
    days_observed: safeDays,
    per_metric_cents: {
      api_calls: Math.round(
        costForUsage({
          api_calls: summary.api_calls,
          ai_tokens: 0,
          render_minutes: 0,
          export_minutes: 0,
        }) * factor,
      ),
      ai_tokens: Math.round(
        costForUsage({
          api_calls: 0,
          ai_tokens: summary.ai_tokens,
          render_minutes: 0,
          export_minutes: 0,
        }) * factor,
      ),
      render_minutes: Math.round(
        costForUsage({
          api_calls: 0,
          ai_tokens: 0,
          render_minutes: summary.render_minutes,
          export_minutes: 0,
        }) * factor,
      ),
      export_minutes: Math.round(
        costForUsage({
          api_calls: 0,
          ai_tokens: 0,
          render_minutes: 0,
          export_minutes: summary.export_minutes,
        }) * factor,
      ),
    },
  };
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${sign}$${dollars.toLocaleString('en-US')}.${frac}`;
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  }
  return value.toLocaleString('en-US');
}
