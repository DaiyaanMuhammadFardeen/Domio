/**
 * Logs API — minimal OTLP-flavored logger.
 *
 * Emits OTLP `LogRecord` payloads to the configured exporter. Logs are
 * PII-redacted before serialization; the redaction is provided by
 * `@domio/redact-pii` through the lazy adapter.
 *
 * Severity follows the OTLP enum: 1=TRACE, 5=DEBUG, 9=INFO, 13=WARN,
 * 17=ERROR, 21=FATAL.
 */

import type { ResourceAttributes } from './resource.js';
import type { OtlpHttpExporter } from './exporters/otlp-http.js';
import { resourceToOtlp } from './exporters/otlp-http.js';
import { getRedactor } from './redaction.js';

export type Severity = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

const SEVERITY_TO_OTLP: Record<Severity, number> = {
  TRACE: 1,
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
  FATAL: 21,
};

export interface LogRecord {
  severity: Severity;
  body: string;
  attributes?: Record<string, string | number | boolean> | undefined;
  timestampMs?: number;
  traceId?: string;
  spanId?: string;
}

export interface Logger {
  log(record: LogRecord): void;
  child(attrs: Record<string, string>): Logger;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
  readonly resource: ResourceAttributes;
  readonly exporter: OtlpHttpExporter | null;
}

export interface LoggerConfig {
  resource: ResourceAttributes;
  exporter: OtlpHttpExporter | null;
  defaultAttributes?: Record<string, string | number | boolean>;
}

export function createLogger(cfg: LoggerConfig): Logger {
  const queue: LogRecord[] = [];
  let flushing = false;

  function redact(rec: LogRecord): LogRecord {
    const redactor = getRedactor();
    return {
      ...rec,
      body: redactor.redactString(rec.body),
      attributes: rec.attributes ? redactor.redactValue(rec.attributes) : rec.attributes,
    };
  }

  function log(rec: LogRecord): void {
    queue.push(redact(rec));
  }

  return {
    resource: cfg.resource,
    exporter: cfg.exporter,
    log,
    child(attrs) {
      return createLogger({
        resource: cfg.resource,
        exporter: cfg.exporter,
        defaultAttributes: { ...(cfg.defaultAttributes ?? {}), ...attrs },
      });
    },
    async flush() {
      if (!cfg.exporter) return;
      if (flushing) return;
      flushing = true;
      try {
        if (queue.length === 0) return;
        const records = queue.splice(0, queue.length);
        const resource = resourceToOtlp(cfg.resource);
        const defaultAttrs = cfg.defaultAttributes ?? {};
        const payload = {
          resourceLogs: [
            {
              resource,
              scopeLogs: [
                {
                  scope: { name: '@domio/observability' },
                  logRecords: records.map((r) => ({
                    timeUnixNano: String((r.timestampMs ?? Date.now()) * 1_000_000),
                    observedTimeUnixNano: String(Date.now() * 1_000_000),
                    severityNumber: SEVERITY_TO_OTLP[r.severity],
                    severityText: r.severity,
                    body: { stringValue: r.body },
                    attributes: mergeAttrs(defaultAttrs, r.attributes ?? {}),
                    traceId: r.traceId ?? '',
                    spanId: r.spanId ?? '',
                  })),
                },
              ],
            },
          ],
        };
        await cfg.exporter.exportJson('logs', payload);
      } finally {
        flushing = false;
      }
    },
    async shutdown() {
      await this.flush();
      if (cfg.exporter) await cfg.exporter.shutdown();
    },
  };
}

function mergeAttrs(
  base: Record<string, string | number | boolean>,
  override: Record<string, string | number | boolean>,
): Array<{ key: string; value: unknown }> {
  const merged = { ...base, ...override };
  return Object.entries(merged).map(([key, value]) => ({
    key,
    value:
      typeof value === 'string'
        ? { stringValue: value }
        : typeof value === 'number'
          ? Number.isInteger(value)
            ? { intValue: String(value) }
            : { doubleValue: value }
          : { boolValue: value },
  }));
}
