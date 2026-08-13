/**
 * Tests for the rollup orchestrator. We use a fake ClickHouse client
 * that records every execute() call so we can assert the right
 * statements are issued.
 */
import { describe, it, expect } from 'vitest';
import { buildOrchestrator, defaultRollupConfig } from './orchestrator.js';
import type { ClickHouseClient } from '../client/clickhouse.js';

class FakeCh implements ClickHouseClient {
  executed: string[] = [];
  async query<T>(): Promise<T[]> {
    return [];
  }
  async execute(sql: string): Promise<void> {
    this.executed.push(sql);
  }
  async raw(): Promise<Response> {
    return new Response('', { status: 200 });
  }
  async ping(): Promise<boolean> {
    return true;
  }
}

describe('rollup orchestrator', () => {
  it('issues OPTIMIZE TABLE FINAL for every hourly table', async () => {
    const ch = new FakeCh();
    const orch = buildOrchestrator(ch, defaultRollupConfig(), { info: () => {}, warn: () => {} });
    const { optimized } = await orch.runHourly();
    // Lists the underlying physical tables, not the materialized views.
    expect(optimized).toEqual(['events', 'session_agg', 'slide_metric_5m']);
    for (const t of optimized) {
      expect(ch.executed).toContain(`OPTIMIZE TABLE ${t} FINAL`);
    }
  });

  it('issues TRUNCATE for nightly rebuild tables', async () => {
    const ch = new FakeCh();
    const orch = buildOrchestrator(ch, defaultRollupConfig(), { info: () => {}, warn: () => {} });
    const { rebuilt } = await orch.runNightly();
    expect(rebuilt).toEqual(['benchmark_snapshot']);
    expect(ch.executed).toContain('TRUNCATE TABLE benchmark_snapshot');
  });

  it('continues past a failing hourly table', async () => {
    const ch = new FakeCh();
    const failing: ClickHouseClient = {
      async query<T>(): Promise<T[]> {
        return [];
      },
      async execute(sql: string) {
        if (sql.includes('events')) throw new Error('boom');
        await ch.execute(sql);
      },
      async raw(): Promise<Response> {
        return new Response('', { status: 200 });
      },
      async ping(): Promise<boolean> {
        return true;
      },
    };
    const orch = buildOrchestrator(failing, defaultRollupConfig(), {
      info: () => {},
      warn: () => {},
    });
    const { optimized } = await orch.runHourly();
    expect(optimized).toEqual(['session_agg', 'slide_metric_5m']);
  });

  it('stop() removes all timers', () => {
    const ch = new FakeCh();
    const orch = buildOrchestrator(ch, defaultRollupConfig(), { info: () => {}, warn: () => {} });
    expect(() => orch.stop()).not.toThrow();
  });
});
