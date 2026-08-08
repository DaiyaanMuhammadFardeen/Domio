/**
 * Event-ingest — Prometheus metrics (Phase 17 W1).
 *
 * Mirrors the metrics naming conventions used by
 * services/realtime-gateway/internal/observability so a single
 * Grafana dashboard can roll up the entire analytics pipeline.
 *
 * Exposed metrics:
 *   domio_ingest_events_total{event_name,privacy_mode,source_app,status}
 *   domio_ingest_batches_total{status}
 *   domio_ingest_kafka_publish_duration_seconds (histogram)
 *   domio_ingest_spool_bytes (gauge)
 *   domio_ingest_spool_files (gauge)
 *   domio_ingest_dlq_total{reason}
 *   domio_ingest_nats_received_total
 *   domio_ingest_nats_forwarded_total
 *   domio_ingest_replay_total
 *   domio_ingest_pii_stripped_total
 *   domio_ingest_signature_failures_total
 *   domio_ingest_replay_failures_total
 */

export interface Metrics {
  recordEvent(eventName: string, privacyMode: string, sourceApp: string, status: 'ok' | 'rejected' | 'spooled'): void;
  recordBatch(status: 'ok' | 'rejected' | 'partial'): void;
  observeKafkaPublish(seconds: number): void;
  setSpoolBytes(bytes: number): void;
  setSpoolFiles(count: number): void;
  recordDlq(reason: string): void;
  recordNats(): void;
  recordReplay(count: number): void;
  recordPiiStripped(count: number): void;
  recordSignatureFailure(): void;
  recordReplayFailure(): void;
  /** Render the metrics in Prometheus text exposition format. */
  render(): string;
  /** Per-route request counter. */
  recordRoute(route: string, status: number): void;
}

interface Counter {
  value: number;
}

interface CounterVec {
  store: Map<string, Counter>;
  inc(labels: Record<string, string>, by?: number): void;
  render(name: string, help: string, labelNames: readonly string[]): string;
}

function makeCounterVec(labelNames: readonly string[]): CounterVec {
  const store = new Map<string, Counter>();
  return {
    store,
    inc(labels, by = 1) {
      const key = labelNames.map((n) => `${n}=${labels[n] ?? ''}`).join(',');
      const existing = this.store.get(key);
      if (existing) {
        existing.value += by;
      } else {
        this.store.set(key, { value: by });
      }
    },
    render(name, help, labelNames) {
      const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} counter`];
      for (const [key, c] of this.store) {
        lines.push(`${name}{${key}} ${c.value}`);
      }
      void labelNames;
      return lines.join('\n') + '\n';
    },
  };
}

interface Gauge {
  value: number;
}

function makeGauge(): Gauge {
  return { value: 0 };
}

interface Histogram {
  buckets: Map<number, number>;
  count: number;
  sum: number;
}

function makeHistogram(): Histogram {
  const buckets = new Map<number, number>();
  for (const b of [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]) {
    buckets.set(b, 0);
  }
  return { buckets, count: 0, sum: 0 };
}

function observeHistogram(h: Histogram, v: number): void {
  h.count += 1;
  h.sum += v;
  for (const [b, c] of h.buckets) {
    if (v <= b) {
      h.buckets.set(b, c + 1);
    }
  }
}

function renderHistogram(name: string, help: string, h: Histogram): string {
  const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} histogram`];
  for (const [b, c] of h.buckets) {
    lines.push(`${name}_bucket{le="${b}"} ${c}`);
  }
  lines.push(`${name}_bucket{le="+Inf"} ${h.count}`);
  lines.push(`${name}_sum ${h.sum}`);
  lines.push(`${name}_count ${h.count}`);
  return lines.join('\n') + '\n';
}

export function buildMetrics(): Metrics {
  const events = makeCounterVec(['event_name', 'privacy_mode', 'source_app', 'status']);
  const batches = makeCounterVec(['status']);
  const kafkaPublish = makeHistogram();
  const spoolBytes = makeGauge();
  const spoolFiles = makeGauge();
  const dlq = makeCounterVec(['reason']);
  const nats = makeCounter();
  const replay = makeCounter();
  const piiStripped = makeCounter();
  const signaturesFailed = makeCounter();
  const replaysFailed = makeCounter();
  const routes = makeCounterVec(['route', 'status']);

  return {
    recordEvent(eventName, privacyMode, sourceApp, status) {
      events.inc({ event_name: eventName, privacy_mode: privacyMode, source_app: sourceApp, status });
    },
    recordBatch(status) {
      batches.inc({ status });
    },
    observeKafkaPublish(seconds) {
      observeHistogram(kafkaPublish, seconds);
    },
    setSpoolBytes(bytes) {
      spoolBytes.value = bytes;
    },
    setSpoolFiles(count) {
      spoolFiles.value = count;
    },
    recordDlq(reason) {
      dlq.inc({ reason });
    },
    recordNats() {
      nats.value += 1;
    },
    recordReplay(count) {
      replay.value += count;
    },
    recordPiiStripped(count) {
      piiStripped.value += count;
    },
    recordSignatureFailure() {
      signaturesFailed.value += 1;
    },
    recordReplayFailure() {
      replaysFailed.value += 1;
    },
    recordRoute(route, status) {
      routes.inc({ route, status: String(status) });
    },
    render() {
      return [
        events.render(
          'domio_ingest_events_total',
          'Events received by the ingest edge, labeled by outcome.',
          ['event_name', 'privacy_mode', 'source_app', 'status'],
        ),
        batches.render('domio_ingest_batches_total', 'Batches received.', ['status']),
        renderHistogram(
          'domio_ingest_kafka_publish_duration_seconds',
          'Kafka publish latency.',
          kafkaPublish,
        ),
        `# HELP domio_ingest_spool_bytes Bytes currently in the disk spool.\n# TYPE domio_ingest_spool_bytes gauge\ndomio_ingest_spool_bytes ${spoolBytes.value}\n`,
        `# HELP domio_ingest_spool_files Number of files in the disk spool.\n# TYPE domio_ingest_spool_files gauge\ndomio_ingest_spool_files ${spoolFiles.value}\n`,
        dlq.render('domio_ingest_dlq_total', 'Events routed to the DLQ.', ['reason']),
        `# HELP domio_ingest_nats_received_total NATS messages received from the analytics bridge.\n# TYPE domio_ingest_nats_received_total counter\ndomio_ingest_nats_received_total ${nats.value}\n`,
        `# HELP domio_ingest_replay_total Events replayed from the disk spool.\n# TYPE domio_ingest_replay_total counter\ndomio_ingest_replay_total ${replay.value}\n`,
        `# HELP domio_ingest_pii_stripped_total Events where PII was redacted.\n# TYPE domio_ingest_pii_stripped_total counter\ndomio_ingest_pii_stripped_total ${piiStripped.value}\n`,
        `# HELP domio_ingest_signature_failures_total Requests rejected with invalid HMAC.\n# TYPE domio_ingest_signature_failures_total counter\ndomio_ingest_signature_failures_total ${signaturesFailed.value}\n`,
        `# HELP domio_ingest_replay_failures_total Requests rejected as replay.\n# TYPE domio_ingest_replay_failures_total counter\ndomio_ingest_replay_failures_total ${replaysFailed.value}\n`,
        routes.render(
          'domio_ingest_route_requests_total',
          'Per-route request count.',
          ['route', 'status'],
        ),
      ].join('\n');
    },
  };
}

function makeCounter(): { value: number } {
  return { value: 0 };
}

/**
 * In-memory metrics for tests. Same interface as the production
 * metrics, but using a fresh instance so test runs don't share state.
 */
export function buildInMemoryMetrics(): Metrics {
  return buildMetrics();
}