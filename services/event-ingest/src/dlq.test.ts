/**
 * Tests for the DLQ writer (Phase 17 W1).
 */
import { describe, expect, it } from 'vitest';
import { buildInMemoryDlq, dlqRecordToEvent } from './dlq.js';
import type { AnalyticsEvent } from './types.js';

describe('in-memory DLQ', () => {
  it('records and reads back', async () => {
    const dlq = buildInMemoryDlq();
    await dlq.write({ recorded_at_ms: 1, reason: 'schema', message: 'bad', raw: {} });
    await dlq.write({
      recorded_at_ms: 2,
      reason: 'pii',
      message: 'redacted',
      raw: { event_id: 'e-1' },
    });
    const all = await dlq.readAll();
    expect(all.length).toBe(2);
  });

  it('filters by reason and sinceMs', async () => {
    const dlq = buildInMemoryDlq();
    await dlq.write({ recorded_at_ms: 1, reason: 'schema', message: 'a', raw: {} });
    await dlq.write({ recorded_at_ms: 100, reason: 'pii', message: 'b', raw: {} });
    await dlq.write({ recorded_at_ms: 200, reason: 'pii', message: 'c', raw: {} });
    const filtered = await dlq.filter({ reasons: ['pii'], sinceMs: 50 });
    expect(filtered.length).toBe(2);
  });

  it('round-trips an event through dlqRecordToEvent', async () => {
    const event: AnalyticsEvent = {
      event_id: 'e-1',
      event_name: 'view',
      schema_version: 1,
      ts_ms: 1,
      workspace_id: 'ws-1',
      deck_id: 'd-1',
      viewer_id_key: 'v-1',
      privacy_mode: 'identified',
      device_class: 'desktop',
      source_app: 'viewer',
      ingest_topic: 'events.ingest.raw',
    };
    const dlq = buildInMemoryDlq();
    await dlq.write({ recorded_at_ms: 1, reason: 'schema', message: 'x', raw: event });
    const records = await dlq.readAll();
    const replayed = dlqRecordToEvent(records[0]!);
    expect(replayed?.event_id).toBe('e-1');
  });

  it('returns null when the raw record is not a valid event', () => {
    const out = dlqRecordToEvent({
      recorded_at_ms: 1,
      reason: 'schema',
      message: 'x',
      raw: { event_id: 123 },
    });
    expect(out).toBeNull();
  });
});
