/**
 * Event-ingest — shared pipeline for HTTP + NATS events (Phase 17 W1).
 *
 * Both the /v1/events route and the NATS bridge funnel into this
 * function so validation, PII stripping, and publish routing are
 * identical across ingest paths.
 */

import type { AnalyticsEvent } from './types.js';
import { KAFKA_TOPIC_DLQ } from './types.js';
import type { EventValidator } from './validation.js';
import type { PiiStripper } from './pii.js';
import type { KafkaPublisher } from './kafka.js';
import type { Spool } from './spool.js';
import type { Metrics } from './metrics/metrics.js';
import type { DlqWriter, DlqRecord } from './dlq.js';

export interface PipelineDeps {
  validator: EventValidator;
  pii: PiiStripper;
  publisher: KafkaPublisher;
  dlqPublisher: KafkaPublisher | null;
  spool: Spool;
  dlq: DlqWriter;
  metrics: Metrics;
}

async function publishDlq(deps: PipelineDeps, record: DlqRecord): Promise<void> {
  if (!deps.dlqPublisher) return;
  try {
    const key = typeof record.raw === 'object' && record.raw !== null
      ? String((record.raw as { event_id?: unknown }).event_id ?? 'unknown')
      : 'unknown';
    await deps.dlqPublisher.publishRaw(
      KAFKA_TOPIC_DLQ,
      key,
      new TextEncoder().encode(JSON.stringify(record)),
    );
  } catch {
    // Disk DLQ is authoritative.
  }
}

export async function handleNatsEvent(event: AnalyticsEvent, deps: PipelineDeps): Promise<void> {
  const err = deps.validator.tryValidate(event);
  if (err !== null) {
    const rec: DlqRecord = {
      recorded_at_ms: Date.now(),
      reason: 'schema',
      message: err,
      raw: event,
    };
    await deps.dlq.write(rec);
    await publishDlq(deps, rec);
    deps.metrics.recordEvent(event.event_name, event.privacy_mode, event.source_app, 'rejected');
    deps.metrics.recordDlq('schema');
    return;
  }
  const { event: strippedRaw, stripped: didStrip } = deps.pii.stripWithReport(event as unknown as Record<string, unknown>);
  if (didStrip) deps.metrics.recordPiiStripped(1);
  const stripped = strippedRaw as unknown as AnalyticsEvent;
  const kafkaStart = Date.now();
  try {
    await deps.publisher.publish(stripped);
    deps.metrics.observeKafkaPublish((Date.now() - kafkaStart) / 1000);
    deps.metrics.recordEvent(stripped.event_name, stripped.privacy_mode, stripped.source_app, 'ok');
  } catch {
    await deps.spool.write(stripped);
    deps.metrics.recordEvent(stripped.event_name, stripped.privacy_mode, stripped.source_app, 'spooled');
    deps.metrics.setSpoolBytes(await deps.spool.size());
    deps.metrics.setSpoolFiles((await deps.spool.list()).length);
  }
}
