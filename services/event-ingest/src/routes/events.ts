/**
 * Event-ingest — POST /v1/events route (Phase 17 W1).
 *
 * The HTTP route carries HMAC-signed batches from the analytics-sdk.
 * The flow is:
 *   1. Read raw body bytes (we MUST verify before parsing).
 *   2. Verify HMAC signature + timestamp + nonce.
 *   3. Parse JSON, validate against the JSON Schemas.
 *   4. Strip PII + privacy-mode gate.
 *   5. Publish to Kafka (or fall back to disk spool).
 *   6. Return 200 with an IngestAck.
 */

import { Hono } from 'hono';
import { toIngestError } from '../errors.js';
import { HMAC_HEADER_NAME, TIMESTAMP_HEADER_NAME, NONCE_HEADER_NAME } from '../hmac.js';
import { KAFKA_TOPIC_DLQ } from '../types.js';
import type { DlqRecord } from '../dlq.js';
import type { IngestDeps } from '../deps.js';
import type { AnalyticsEvent, IngestAck } from '../types.js';

/**
 * Publish a DLQ record to the DLQ Kafka topic. Best-effort: if the
 * publisher is missing or Kafka is unavailable we log but do not fail
 * the request — the disk DLQ is the source of truth.
 */
async function publishDlq(deps: IngestDeps, record: DlqRecord): Promise<void> {
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
    // Swallowed intentionally; disk DLQ is authoritative.
  }
}

export function eventsRoutes(deps: IngestDeps): Hono {
  const app = new Hono();

  app.post('/v1/events', async (c) => {
    const t0 = Date.now();
    try {
      // 1. Read raw body.
      const raw = await c.req.text();
      if (raw.length > deps.cfg.maxBatchBytes) {
        deps.metrics.recordBatch('rejected');
        return c.json({ error: { code: 'payload_too_large', message: 'batch exceeds size limit' } }, 413);
      }

      // 2. Verify HMAC.
      const sig = c.req.header(HMAC_HEADER_NAME) ?? null;
      const ts = c.req.header(TIMESTAMP_HEADER_NAME) ?? null;
      const nonce = c.req.header(NONCE_HEADER_NAME) ?? null;
      let verifiedTimestamp: number;
      let verifiedNonce: string;
      try {
        const verified = deps.hmac.verify({
          rawBody: raw,
          signatureHeader: sig,
          timestampHeader: ts,
          nonceHeader: nonce,
          maxClockSkewMs: deps.cfg.maxClockSkewMs,
          now: Date.now(),
        });
        verifiedTimestamp = verified.timestamp;
        verifiedNonce = verified.nonce;
      } catch (err) {
        deps.metrics.recordSignatureFailure();
        deps.metrics.recordBatch('rejected');
        const wrapped = toIngestError(err);
        return c.json({ error: { code: wrapped.code, message: wrapped.message } }, wrapped.status);
      }

      // 3. Replay protection.
      try {
        await deps.nonces.checkAndStore(verifiedNonce, verifiedTimestamp, deps.cfg.nonceTtlMs);
      } catch (err) {
        deps.metrics.recordReplayFailure();
        deps.metrics.recordBatch('rejected');
        const wrapped = toIngestError(err);
        return c.json({ error: { code: wrapped.code, message: wrapped.message } }, wrapped.status);
      }

      // 4. Parse JSON.
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        deps.metrics.recordBatch('rejected');
        return c.json({ error: { code: 'malformed_json', message: 'request body must be valid JSON' } }, 400);
      }

      const batch = Array.isArray(parsed) ? parsed : [parsed];
      if (batch.length > deps.cfg.maxBatchSize) {
        deps.metrics.recordBatch('rejected');
        return c.json({ error: { code: 'batch_too_large', message: 'too many events' } }, 413);
      }

      // 5. Validate + Privacy + PII strip + publish.
      const accepted: AnalyticsEvent[] = [];
      let rejected = 0;
      let piiStripped = 0;
      let seqStart = deps.nextSeq();
      let seq = seqStart;
      for (const rawEvent of batch) {
        const err = deps.validator.tryValidate(rawEvent);
        if (err !== null) {
          rejected += 1;
          const dlqRec = {
            recorded_at_ms: Date.now(),
            reason: 'schema' as const,
            message: err,
            raw: rawEvent,
          };
          await deps.dlq.write(dlqRec);
          await publishDlq(deps, dlqRec);
          deps.metrics.recordEvent(
            typeof (rawEvent as { event_name?: unknown })?.event_name === 'string'
              ? ((rawEvent as { event_name: string }).event_name)
              : 'unknown',
            (rawEvent as { privacy_mode?: string }).privacy_mode ?? 'unknown',
            (rawEvent as { source_app?: string }).source_app ?? 'unknown',
            'rejected',
          );
          deps.metrics.recordDlq('schema');
          continue;
        }
        const event = rawEvent as AnalyticsEvent;
        if (!deps.cfg.acceptPrivacyModes.includes(event.privacy_mode)) {
          rejected += 1;
          const dlqRec = {
            recorded_at_ms: Date.now(),
            reason: 'consent' as const,
            message: `privacy_mode ${event.privacy_mode} not accepted`,
            raw: event,
          };
          await deps.dlq.write(dlqRec);
          await publishDlq(deps, dlqRec);
          deps.metrics.recordEvent(event.event_name, event.privacy_mode, event.source_app, 'rejected');
          deps.metrics.recordDlq('consent');
          continue;
        }

        const { event: strippedRaw, stripped: didStrip } = deps.pii.stripWithReport(
          event as unknown as Record<string, unknown>,
        );
        if (didStrip) piiStripped += 1;

        // Stamp the per-event sequence.
        const eventWithSeq = { ...strippedRaw } as unknown as AnalyticsEvent & {
          _ingest_seq?: number;
        };
        seq += 1;
        eventWithSeq._ingest_seq = seq;
        accepted.push(eventWithSeq);
      }

      // 6. Publish (with spool fallback).
      let spooled = 0;
      const kafkaStart = Date.now();
      try {
        await deps.publisher.publishMany(accepted);
      } catch (err) {
        // Kafka is down — spool and return 202.
        for (const event of accepted) {
          await deps.spool.write(event);
          spooled += 1;
        }
        const wrapped = toIngestError(err);
        // IngestUnavailableError uses 503 in toIngestError; we want 202
        // (Accepted) when spooled so the client knows we held the data.
        const status: 202 | 500 = wrapped.status === 503 ? 202 : 500;
        const ack: IngestAck = {
          accepted: accepted.length,
          rejected,
          spooled,
          seq_start: seqStart,
          seq_end: seq,
        };
        deps.metrics.recordBatch('partial');
        for (const e of accepted) {
          deps.metrics.recordEvent(e.event_name, e.privacy_mode, e.source_app, 'spooled');
        }
        if (piiStripped > 0) deps.metrics.recordPiiStripped(piiStripped);
        deps.metrics.setSpoolBytes(await deps.spool.size());
        deps.metrics.setSpoolFiles((await deps.spool.list()).length);
        deps.metrics.recordRoute('POST /v1/events', status);
        return c.json({ ack, warning: { code: 'spooled', message: 'kafka unreachable; spooled to disk' } }, status);
      }
      deps.metrics.observeKafkaPublish((Date.now() - kafkaStart) / 1000);
      for (const e of accepted) {
        deps.metrics.recordEvent(e.event_name, e.privacy_mode, e.source_app, 'ok');
      }
      if (piiStripped > 0) deps.metrics.recordPiiStripped(piiStripped);

      const ack: IngestAck = {
        accepted: accepted.length,
        rejected,
        spooled: 0,
        seq_start: seqStart,
        seq_end: seq,
      };
      deps.metrics.recordBatch(rejected > 0 ? 'partial' : 'ok');
      deps.metrics.recordRoute('POST /v1/events', 200);
      void t0;
      return c.json({ ack });
    } catch (err) {
      const wrapped = toIngestError(err);
      deps.metrics.recordBatch('rejected');
      deps.metrics.recordRoute('POST /v1/events', wrapped.status);
      return c.json({ error: { code: wrapped.code, message: wrapped.message } }, wrapped.status);
    }
  });

  return app;
}
