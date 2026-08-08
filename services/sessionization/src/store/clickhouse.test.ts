import { describe, it, expect } from 'vitest';
import { buildSessionSink } from './clickhouse.js';
import type { SessionWriterClient } from './clickhouse.js';
import type { SessionRecord } from '../types.js';

class Capture implements SessionWriterClient {
  public calls: { sql: string; params?: Record<string, unknown> }[] = [];
  async execute(sql: string, params?: Record<string, unknown>): Promise<void> {
    this.calls.push({ sql, params: params ?? {} });
  }
}

const base: SessionRecord = {
  session_id: 's1',
  workspace_id: 'ws-1',
  viewer_id_key: 'vk-1',
  deck_id: 'd1',
  state: 'open',
  started_at_ms: 1_700_000_000_000,
  last_event_at_ms: 1_700_000_000_000,
  ended_at_ms: null,
  event_count: 3,
  source_app: 'viewer',
  privacy_mode: 'pseudonymous',
  device_class: 'desktop',
  region_pinned: null,
  country_iso: null,
};

describe('buildSessionSink', () => {
  it('inserts an open session with null ended_at_ms', async () => {
    const client = new Capture();
    const sink = buildSessionSink(client);
    await sink.upsert(base);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.sql).toMatch(/INSERT INTO sessions_long/);
    expect(client.calls[0]?.params?.['ended_at_ms']).toBeNull();
    expect(client.calls[0]?.params?.['event_count']).toBe(3);
  });

  it('inserts a closed session with ended_at_ms', async () => {
    const client = new Capture();
    const sink = buildSessionSink(client);
    await sink.upsert({ ...base, state: 'closed', ended_at_ms: 1_700_000_060_000 });
    expect(client.calls[0]?.params?.['ended_at_ms']).toMatch(/^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  });
});