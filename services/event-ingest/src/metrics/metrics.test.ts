/**
 * Tests for the metrics renderer (Phase 17 W1).
 */
import { describe, expect, it } from 'vitest';
import { buildMetrics } from './metrics.js';

describe('metrics', () => {
  it('records events and renders Prometheus text', () => {
    const m = buildMetrics();
    m.recordEvent('view', 'identified', 'viewer', 'ok');
    m.recordEvent('view', 'identified', 'viewer', 'rejected');
    m.recordBatch('ok');
    m.observeKafkaPublish(0.05);
    m.setSpoolBytes(1024);
    m.setSpoolFiles(2);
    m.recordDlq('schema');
    m.recordNats();
    m.recordReplay(5);
    m.recordPiiStripped(3);
    m.recordSignatureFailure();
    m.recordReplayFailure();
    m.recordRoute('POST /v1/events', 200);
    const text = m.render();
    expect(text).toContain('domio_ingest_events_total');
    expect(text).toContain('domio_ingest_batches_total');
    expect(text).toContain('domio_ingest_kafka_publish_duration_seconds');
    expect(text).toContain('domio_ingest_spool_bytes 1024');
    expect(text).toContain('domio_ingest_spool_files 2');
    expect(text).toContain('domio_ingest_dlq_total');
    expect(text).toContain('domio_ingest_nats_received_total');
    expect(text).toContain('domio_ingest_replay_total');
    expect(text).toContain('domio_ingest_pii_stripped_total');
    expect(text).toContain('domio_ingest_signature_failures_total');
    expect(text).toContain('domio_ingest_replay_failures_total');
    expect(text).toContain('domio_ingest_route_requests_total');
  });
});