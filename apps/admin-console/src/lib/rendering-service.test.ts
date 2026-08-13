/**
 * Rendering service tests — Wave 8 §S8.11.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRenderQueueStatus,
  listRenderSamples,
  getRenderConfig,
  updateRenderConfig,
  cancelRender,
  __resetRenderingSeed,
} from './rendering-service';

describe('rendering-service', () => {
  beforeEach(() => {
    __resetRenderingSeed();
  });

  it('getRenderQueueStatus returns reasonable values', async () => {
    const status = await getRenderQueueStatus();
    expect(status.queued).toBeGreaterThanOrEqual(0);
    expect(status.running).toBeGreaterThanOrEqual(0);
    expect(status.succeeded_1h).toBeGreaterThan(0);
    expect(status.failed_1h).toBeGreaterThanOrEqual(0);
    expect(status.avg_duration_ms_1h).toBeGreaterThan(0);
    expect(status.error_rate_1h).toBeGreaterThanOrEqual(0);
    expect(status.error_rate_1h).toBeLessThanOrEqual(1);
  });

  it('queue throughput has 24h of points (288)', async () => {
    const status = await getRenderQueueStatus();
    expect(status.throughput.length).toBe(288);
    // Each point has both series populated.
    for (const p of status.throughput) {
      expect(typeof p.timestamp_ms).toBe('number');
      expect(p.jobs_per_minute).toBeGreaterThanOrEqual(0);
      expect(p.errors_per_minute).toBeGreaterThanOrEqual(0);
    }
  });

  it('listRenderSamples(20) returns 20', async () => {
    const samples = await listRenderSamples(20);
    expect(samples.length).toBe(20);
    // Each sample has the required fields.
    for (const s of samples) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.deck_id.length).toBeGreaterThan(0);
      expect(['queued', 'running', 'succeeded', 'failed', 'cancelled']).toContain(
        s.status,
      );
    }
  });

  it('getRenderConfig returns positive numbers', async () => {
    const cfg = await getRenderConfig();
    expect(cfg.max_parallelism).toBeGreaterThan(0);
    expect(cfg.retention_days).toBeGreaterThan(0);
    expect(cfg.rate_limit_per_tenant).toBeGreaterThan(0);
  });

  it('updateRenderConfig clamps parallelism to 1-64', async () => {
    const tooLow = await updateRenderConfig({ max_parallelism: -10 });
    expect(tooLow.max_parallelism).toBeGreaterThanOrEqual(1);

    const tooHigh = await updateRenderConfig({ max_parallelism: 9999 });
    expect(tooHigh.max_parallelism).toBeLessThanOrEqual(64);

    const ok = await updateRenderConfig({ max_parallelism: 32 });
    expect(ok.max_parallelism).toBe(32);
  });

  it('cancelRender sets status=cancelled', async () => {
    const cancelled = await cancelRender('render-0001');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.completed_at_ms).not.toBeNull();
  });
});
