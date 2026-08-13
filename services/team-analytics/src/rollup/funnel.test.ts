/**
 * Team-analytics — funnel analysis tests (Phase 17 W9).
 *
 * Verifies conversion counting, step ordering, and the relative
 * conversion_rate normalisation to step 0's audience.
 */

import { describe, it, expect } from 'vitest';
import { computeFunnel, type FunnelEvent } from './funnel.js';

describe('computeFunnel', () => {
  it('returns an empty array for empty steps', () => {
    expect(computeFunnel({ steps: [], events: [] })).toEqual([]);
  });

  it('returns entered=0 for unknown steps with no events', () => {
    const rows = computeFunnel({ steps: ['view', 'share'], events: [] });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      step_index: 0,
      step_name: 'view',
      entered: 0,
      conversion_rate: 0,
    });
    expect(rows[1]).toMatchObject({ step_index: 1, step_name: 'share', entered: 0 });
  });

  it('counts conversion for a single step', () => {
    const events: FunnelEvent[] = [
      { viewer_id_key: 'v1', event_name: 'view' },
      { viewer_id_key: 'v2', event_name: 'view' },
      { viewer_id_key: 'v3', event_name: 'view' },
    ];
    const rows = computeFunnel({ steps: ['view'], events });
    expect(rows[0]?.entered).toBe(3);
    expect(rows[0]?.conversion_rate).toBe(1);
  });

  it('computes 2-step funnel with conversion drop-off', () => {
    const events: FunnelEvent[] = [
      { viewer_id_key: 'v1', event_name: 'view' },
      { viewer_id_key: 'v2', event_name: 'view' },
      { viewer_id_key: 'v3', event_name: 'view' },
      { viewer_id_key: 'v1', event_name: 'share' },
      { viewer_id_key: 'v2', event_name: 'share' },
    ];
    const rows = computeFunnel({ steps: ['view', 'share'], events });
    expect(rows[0]?.entered).toBe(3);
    expect(rows[0]?.conversion_rate).toBe(1);
    expect(rows[1]?.entered).toBe(2);
    expect(rows[1]?.conversion_rate).toBeCloseTo(2 / 3, 5);
  });

  it('normalises every conversion_rate against step 0 entered', () => {
    const events: FunnelEvent[] = [
      { viewer_id_key: 'v1', event_name: 'view' },
      { viewer_id_key: 'v1', event_name: 'share' },
      { viewer_id_key: 'v1', event_name: 'react' },
    ];
    const rows = computeFunnel({ steps: ['view', 'share', 'react'], events });
    expect(rows[0]?.conversion_rate).toBe(1);
    expect(rows[1]?.conversion_rate).toBe(1);
    expect(rows[2]?.conversion_rate).toBe(1);
  });

  it('handles unrelated events without polluting the funnel', () => {
    const events: FunnelEvent[] = [
      { viewer_id_key: 'v1', event_name: 'scroll_progress' },
      { viewer_id_key: 'v1', event_name: 'view' },
      { viewer_id_key: 'v1', event_name: 'view' }, // dup
      { viewer_id_key: 'v1', event_name: 'share' },
    ];
    const rows = computeFunnel({ steps: ['view', 'share'], events });
    expect(rows[0]?.entered).toBe(1);
    expect(rows[1]?.entered).toBe(1);
  });
});
