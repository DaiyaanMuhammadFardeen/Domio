/**
 * Event-ingest — default dependency wiring (Phase 17 W1).
 *
 * main() calls defaultDeps(cfg) to construct production dependencies
 * (real Kafka, real Redis, real disk spool). Tests build their own
 * IngestDeps with the InMemory* / noop variants.
 */

import type { IngestDeps } from './deps.js';
import type { IngestConfig } from './types.js';
import { buildValidator } from './validation.js';
import { buildHmacVerifier } from './hmac.js';
import { buildRedisNonceCache, buildMemoryNonceCache } from './nonce.js';
import { buildPiiStripper } from './pii.js';
import { buildKafkaPublisher } from './kafka.js';
import { buildDiskSpool } from './spool.js';
import { buildNatsBridge } from './nats_bridge.js';
import { buildDiskDlq, buildInMemoryDlq } from './dlq.js';
import { buildMetrics } from './metrics/metrics.js';
import { handleNatsEvent } from './ingest_pipeline.js';

/**
 * Build a fully wired IngestDeps for production. Use the in-memory
 * variants in tests via the build* helpers in this package.
 */
export async function defaultDeps(cfg: IngestConfig): Promise<IngestDeps> {
  const validator = buildValidator();
  const hmac = buildHmacVerifier(cfg.hmacKeyHex);
  const nonces = await buildRedisNonceCache(cfg.redisUrl).catch(() => buildMemoryNonceCache());
  const pii = buildPiiStripper();
  const publisher = await buildKafkaPublisher(cfg.kafkaBrokers).catch(() => {
    // Kafka unavailable at boot — fall back to a publisher that always
    // fails so the spool takes over. This is the same behavior the
    // runtime path uses when Kafka drops mid-flight.
    return {
      ready: () => false,
      publish: async () => {
        throw new Error('kafka not connected');
      },
      publishMany: async () => {
        throw new Error('kafka not connected');
      },
      publishRaw: async () => {
        throw new Error('kafka not connected');
      },
      disconnect: async () => {
        /* no-op */
      },
    };
  });
  const spool = await buildDiskSpool(cfg.spoolDir);
  const nats = await buildNatsBridge(cfg.natsUrl);
  const dlq = await buildDiskDlq(`${cfg.spoolDir}/dlq`).catch(() => buildInMemoryDlq());
  const metrics = buildMetrics();
  let seq = 0;
  const nextSeq = () => {
    seq += 1;
    return seq;
  };

  // The DLQ publisher reuses the main Kafka producer but routes to the
  // dedicated DLQ topic. If Kafka is down at boot, we still keep the
  // always-failing publisher so DLQ publishes go to disk only.
  const dlqPublisher = publisher;

  // Wire the NATS handler into the same ingest pipeline the HTTP
  // route uses. The bridge calls handleNatsEvent, which validates,
  // strips, and publishes — with the same metrics counters.
  await nats.start(async (event) => {
    metrics.recordNats();
    await handleNatsEvent(event, {
      validator,
      pii,
      publisher,
      dlqPublisher,
      spool,
      dlq,
      metrics,
    });
  });

  return { cfg, validator, pii, hmac, nonces, publisher, dlqPublisher, spool, nats, dlq, metrics, nextSeq };
}