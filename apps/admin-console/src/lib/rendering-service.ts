/**
 * Headless rendering service — Wave 8 §S8.11.
 *
 * Wraps `GET /v1/admin/rendering/queue`, `GET …/samples`,
 * `GET …/config`, `PUT …/config`, and `POST …/samples/:id/cancel`.
 * Falls back to deterministic local seed when the upstream is
 * unreachable, mirroring the scim-service pattern.
 */

import { fetcher } from './fetcher';
import type {
  RenderConfig,
  RenderJobStatus,
  RenderQueueStatus,
  RenderSample,
  RenderThroughputPoint,
} from './types';

const NOW = Date.UTC(2026, 6, 1);
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const POINTS_PER_DAY = (24 * 60) / 5; // 288

/** Build 24h of throughput data at 5-minute intervals. */
function seedThroughput(): ReadonlyArray<RenderThroughputPoint> {
  const out: RenderThroughputPoint[] = [];
  // Walk backwards from NOW so the most recent point is the last in
  // the array — easier to reason about for chart code.
  for (let i = POINTS_PER_DAY - 1; i >= 0; i -= 1) {
    // Simple deterministic cycle so the chart is pleasant to look at
    // without any real randomness in tests.
    const base = 60 + Math.sin((i / POINTS_PER_DAY) * Math.PI * 2) * 18;
    const errorBase = 2.5 + Math.cos((i / POINTS_PER_DAY) * Math.PI * 2) * 1.2;
    out.push({
      timestamp_ms: NOW - i * FIVE_MINUTES_MS,
      jobs_per_minute: Math.max(0, Math.round(base)),
      errors_per_minute: Math.max(0, Math.round(errorBase * 10) / 10),
    });
  }
  return out;
}

const STATUSES: ReadonlyArray<RenderJobStatus> = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
];
const FORMATS: ReadonlyArray<RenderSample['output_format']> = ['pdf', 'png', 'mp4'];
const DECK_IDS: ReadonlyArray<string> = [
  'deck-q3-allhands',
  'deck-acme-launch',
  'deck-pricing-v2',
  'deck-roadmap',
  'deck-security-review',
  'deck-product-update',
];

function seededSamples(): RenderSample[] {
  const list: RenderSample[] = [];
  for (let i = 0; i < 20; i += 1) {
    // Mostly succeeded with a sprinkle of failed/running/queued.
    const fallback: RenderJobStatus = STATUSES[i % STATUSES.length] ?? 'succeeded';
    const status: RenderJobStatus =
      i < 2 ? 'running' : i < 4 ? 'queued' : i === 4 ? 'failed' : i === 5 ? 'cancelled' : fallback;
    const started = NOW - i * 1000 * 60 * 3;
    const duration =
      status === 'succeeded' || status === 'failed' || status === 'cancelled'
        ? 1800 + ((i * 173) % 1200)
        : null;
    const completed =
      status === 'succeeded' || status === 'failed' || status === 'cancelled'
        ? started + (duration ?? 0)
        : null;
    list.push({
      id: `render-${(i + 1).toString().padStart(4, '0')}`,
      deck_id: DECK_IDS[i % DECK_IDS.length] ?? 'deck-default',
      status,
      started_at_ms: started,
      completed_at_ms: completed,
      duration_ms: duration,
      output_format: FORMATS[i % FORMATS.length] ?? 'pdf',
      error: status === 'failed' ? `Render timed out after ${duration ?? 0}ms` : null,
    });
  }
  return list;
}

let SAMPLES: RenderSample[] = seededSamples();

let CONFIG: RenderConfig = {
  tenant_id: 'acme',
  max_parallelism: 16,
  retention_days: 14,
  rate_limit_per_tenant: 60,
};

export async function getRenderQueueStatus(): Promise<RenderQueueStatus> {
  try {
    const json = await fetcher<RenderQueueStatus>('/v1/admin/rendering/queue');
    if (json && Array.isArray(json.throughput)) return json;
  } catch {
    // fall through to seed
  }
  return {
    queued: 5,
    running: 3,
    succeeded_1h: 200,
    failed_1h: 8,
    avg_duration_ms_1h: 2400,
    error_rate_1h: 0.04,
    throughput: seedThroughput(),
  };
}

export async function listRenderSamples(limit: number): Promise<RenderSample[]> {
  const capped = Math.max(1, Math.min(100, Math.floor(limit)));
  try {
    const json = await fetcher<{ items?: RenderSample[] }>(
      `/v1/admin/rendering/samples?limit=${capped}`,
    );
    const items = json.items ?? [];
    if (items.length > 0) return items.slice(0, capped);
  } catch {
    // fall through to seed
  }
  return SAMPLES.slice(0, capped).map((s) => ({ ...s }));
}

export async function getRenderConfig(): Promise<RenderConfig> {
  try {
    const json = await fetcher<RenderConfig>('/v1/admin/rendering/config');
    if (json && typeof json.max_parallelism === 'number') return json;
  } catch {
    // fall through to seed
  }
  return { ...CONFIG };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export async function updateRenderConfig(input: Partial<RenderConfig>): Promise<RenderConfig> {
  const next: RenderConfig = {
    tenant_id: input.tenant_id ?? CONFIG.tenant_id,
    max_parallelism: clamp(input.max_parallelism ?? CONFIG.max_parallelism, 1, 64),
    retention_days: clamp(input.retention_days ?? CONFIG.retention_days, 1, 365),
    rate_limit_per_tenant: clamp(
      input.rate_limit_per_tenant ?? CONFIG.rate_limit_per_tenant,
      1,
      1000,
    ),
  };
  CONFIG = next;
  try {
    const json = await fetcher<RenderConfig>('/v1/admin/rendering/config', {
      method: 'PUT',
      body: next,
    });
    if (json && typeof json.max_parallelism === 'number') {
      CONFIG = json;
      return { ...CONFIG };
    }
  } catch {
    // keep local state
  }
  return { ...CONFIG };
}

export async function cancelRender(id: string): Promise<RenderSample> {
  try {
    await fetcher<void>(`/v1/admin/rendering/samples/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    });
  } catch {
    // fall through — we still update local state.
  }
  const idx = SAMPLES.findIndex((s) => s.id === id);
  const now = NOW;
  if (idx >= 0) {
    const prev = SAMPLES[idx];
    if (prev) {
      const updated: RenderSample = {
        ...prev,
        status: 'cancelled',
        completed_at_ms: prev.completed_at_ms ?? now,
        error: prev.error,
      };
      SAMPLES = [...SAMPLES.slice(0, idx), updated, ...SAMPLES.slice(idx + 1)];
      return { ...updated };
    }
  }
  return {
    id,
    deck_id: 'unknown',
    status: 'cancelled',
    started_at_ms: now,
    completed_at_ms: now,
    duration_ms: 0,
    output_format: 'pdf',
    error: null,
  };
}

/** Test-only: reset mutable seed state between vitest cases. */
export function __resetRenderingSeed(): void {
  SAMPLES = seededSamples();
  CONFIG = {
    tenant_id: 'acme',
    max_parallelism: 16,
    retention_days: 14,
    rate_limit_per_tenant: 60,
  };
}
