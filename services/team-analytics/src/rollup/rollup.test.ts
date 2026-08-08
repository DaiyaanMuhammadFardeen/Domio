/**
 * Team-analytics — rollup daemon tests (Phase 17 W9).
 *
 * Verifies that the rollup issues a single INSERT, increments the run
 * counter, and surfaces the last error on ClickHouse failure.
 */

import { describe, it, expect } from 'vitest';
import { buildInMemoryClickHouseClient } from '../store/clickhouse.js';
import { buildRollup } from './rollup.js';

describe('buildRollup', () => {
  it('issues an INSERT into team_metric_materialized_view on runOnce', async () => {
    const ch = buildInMemoryClickHouseClient();
    const rollup = buildRollup(ch, 60_000);
    await rollup.runOnce();
    expect(rollup.runs()).toBe(1);
    expect(rollup.lastError()).toBeNull();
    expect(ch.executes).toHaveLength(1);
    expect(ch.executes[0]?.sql).toMatch(/INSERT INTO team_metric_materialized_view/);
  });

  it('captures the error when the insert fails', async () => {
    const ch = buildInMemoryClickHouseClient();
    // Override execute to throw.
    ch.execute = async () => {
      throw new Error('simulated clickhouse outage');
    };
    const rollup = buildRollup(ch, 60_000);
    await rollup.runOnce();
    expect(rollup.lastError()).toBeInstanceOf(Error);
    expect(rollup.lastError()?.message).toMatch(/simulated clickhouse outage/);
  });

  it('start() triggers an immediate run and stop() does not throw', async () => {
    const ch = buildInMemoryClickHouseClient();
    const rollup = buildRollup(ch, 60_000);
    rollup.start();
    // Let the immediate runOnce() resolve.
    await new Promise((r) => setTimeout(r, 5));
    expect(rollup.runs()).toBe(1);
    rollup.stop();
  });
});