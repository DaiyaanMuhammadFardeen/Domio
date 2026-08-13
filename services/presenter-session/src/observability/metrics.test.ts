/**
 * @domio/presenter-session — observability tests.
 *
 * Phase 15 W16. Validates the no-op facade is safe to use everywhere,
 * and the bound facade correctly delegates to the underlying meter.
 */

import { describe, expect, it } from 'vitest';
import { bindPresenterMetrics, nullPresenterMetrics, type PresenterMetrics } from './metrics.js';
import type { Meter, Histogram } from '@domio/observability';

function fakeMeter(): {
  meter: Meter;
  records: { name: string; value: number; attrs?: Record<string, string> }[];
} {
  const records: { name: string; value: number; attrs?: Record<string, string> }[] = [];
  function makeHist(name: string): Histogram {
    return {
      type: 'histogram',
      name,
      record(value, attrs) {
        records.push({ name, value, ...(attrs !== undefined ? { attrs } : {}) });
      },
    };
  }
  const meter: Meter = {
    createCounter: () => ({ type: 'counter', name: 'c', add: () => {} }),
    createHistogram: makeHist,
    createUpDownCounter: () => ({ type: 'up_down_counter', name: 'u', add: () => {} }),
    flush: async () => {},
    shutdown: async () => {},
    resource: {
      'service.name': 'test',
      'service.version': '0.0.0',
      'deployment.environment': 'test',
      'git.sha': 'test',
    },
    exporter: null,
  };
  return { meter, records };
}

describe('presenter metrics', () => {
  it('nullPresenterMetrics records without throwing', () => {
    const m: PresenterMetrics = nullPresenterMetrics();
    expect(() => m.wsOpenMs.record(5)).not.toThrow();
    expect(() => m.annotationReplayMs.record(50)).not.toThrow();
    expect(() => m.handoffMs.record(100)).not.toThrow();
    expect(() => m.recapMs.record(200)).not.toThrow();
    expect(() => m.advanceCount.record(1)).not.toThrow();
    expect(() => m.conflictCount.record(1)).not.toThrow();
  });

  it('nullPresenterMetrics flush + shutdown are no-ops', async () => {
    const m = nullPresenterMetrics();
    await expect(m.flush()).resolves.toBeUndefined();
    await expect(m.shutdown()).resolves.toBeUndefined();
  });

  it('bound facade creates six histograms with stable names', () => {
    const { meter } = fakeMeter();
    const m = bindPresenterMetrics({ meter });
    const names = [
      m.wsOpenMs.name,
      m.annotationReplayMs.name,
      m.handoffMs.name,
      m.recapMs.name,
      m.advanceCount.name,
      m.conflictCount.name,
    ];
    expect(names).toEqual([
      'presenter_ws_open_ms',
      'presenter_annotation_replay_ms',
      'presenter_handoff_ms',
      'presenter_recap_ms',
      'presenter_advance_count',
      'presenter_conflict_count',
    ]);
  });

  it('bound facade forwards record calls to the underlying meter', () => {
    const { meter, records } = fakeMeter();
    const m = bindPresenterMetrics({ meter });
    m.wsOpenMs.record(42);
    m.handoffMs.record(100, { session_id: 'abc' });
    expect(records).toEqual([
      { name: 'presenter_ws_open_ms', value: 42 },
      { name: 'presenter_handoff_ms', value: 100, attrs: { session_id: 'abc' } },
    ]);
  });

  it('bound facade flush delegates to meter.flush', async () => {
    let flushed = 0;
    const meter: Meter = {
      createCounter: () => ({ type: 'counter', name: 'c', add: () => {} }),
      createHistogram: () => ({ type: 'histogram', name: 'h', record: () => {} }),
      createUpDownCounter: () => ({ type: 'up_down_counter', name: 'u', add: () => {} }),
      flush: async () => {
        flushed += 1;
      },
      shutdown: async () => {},
      resource: {
        'service.name': 'test',
        'service.version': '0.0.0',
        'deployment.environment': 'test',
        'git.sha': 'test',
      },
      exporter: null,
    };
    const m = bindPresenterMetrics({ meter });
    await m.flush();
    expect(flushed).toBe(1);
  });

  it('nullPresenterMetrics returns a singleton', () => {
    expect(nullPresenterMetrics()).toBe(nullPresenterMetrics());
  });
});
