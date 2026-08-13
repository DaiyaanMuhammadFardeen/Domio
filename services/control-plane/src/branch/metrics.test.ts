import { describe, it, expect } from 'vitest';
import { createBranchMetrics, InMemoryMetricsSink, noopBranchMetrics } from './metrics.js';

describe('BranchMetrics', () => {
  it('records branch creation counter and diff span duration', () => {
    const sink = new InMemoryMetricsSink();
    const metrics = createBranchMetrics(sink);
    metrics.recordBranchCreate('deck-1', 'ok');
    metrics.recordDiff(1234, false);
    expect(sink.countersByName()['branch_create_total']).toBe(1);
    expect(sink.spanDurations('diff.compute')).toEqual([1234]);
  });

  it('noopBranchMetrics never throws', () => {
    expect(() => noopBranchMetrics.startSpan('noop')()).not.toThrow();
    noopBranchMetrics.recordBranchCreate('d', 'ok');
    noopBranchMetrics.recordBranchArchive('d');
    noopBranchMetrics.recordDiff(1, true);
    noopBranchMetrics.recordMerge(1, 'ok');
  });
});
