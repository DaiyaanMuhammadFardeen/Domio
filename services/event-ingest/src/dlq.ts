/**
 * Event-ingest — DLQ + replay CLI (Phase 17 W1).
 *
 * The DLQ holds events that failed validation or PII stripping. We
 * write to a separate Kafka topic (`events.ingest.dlq`) and also keep
 * a structured NDJSON log on disk for the replay CLI to consume.
 *
 * The replay CLI (bin/replay.ts) reads the disk log, lets the operator
 * filter by reason/time, and re-injects selected events into the
 * normal pipeline. Replayed events keep their original event_id so
 * downstream consumers can dedupe.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnalyticsEvent } from './types.js';

export type DlqReason = 'schema' | 'pii' | 'consent' | 'parse' | 'unknown';

export interface DlqRecord {
  recorded_at_ms: number;
  reason: DlqReason;
  message: string;
  raw: unknown;
  original_event_id?: string | undefined;
}

export interface DlqWriter {
  write(record: DlqRecord): Promise<void>;
  /** Read all records (for the replay CLI). */
  readAll(): Promise<DlqRecord[]>;
  /** Read records filtered by reason / since. */
  filter(opts: { reasons?: readonly DlqReason[]; sinceMs?: number }): Promise<DlqRecord[]>;
}

/**
 * NDJSON-on-disk DLQ. One file per day under cfg.spoolDir/dlq/.
 */
export async function buildDiskDlq(dir: string): Promise<DlqWriter> {
  await mkdir(dir, { recursive: true });
  function fileForDay(ms: number): string {
    const d = new Date(ms);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return join(dir, `${yyyy}-${mm}-${dd}.ndjson`);
  }

  async function readAll(): Promise<DlqRecord[]> {
    // Lazy require to avoid loading on hot path.
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(dir);
    const out: DlqRecord[] = [];
    for (const name of entries) {
      if (!name.endsWith('.ndjson')) continue;
      const text = await readFile(join(dir, name), 'utf-8');
      for (const line of text.split('\n')) {
        if (!line) continue;
        try {
          out.push(JSON.parse(line) as DlqRecord);
        } catch {
          // skip malformed lines; they will be repaired manually
        }
      }
    }
    return out;
  }

  return {
    async write(record) {
      const path = fileForDay(record.recorded_at_ms);
      await appendFile(path, JSON.stringify(record) + '\n', 'utf-8');
    },
    async readAll() {
      return readAll();
    },
    async filter(opts) {
      const all = await readAll();
      return all.filter((r: DlqRecord) => {
        if (opts.reasons && !opts.reasons.includes(r.reason)) return false;
        if (opts.sinceMs !== undefined && r.recorded_at_ms < opts.sinceMs) return false;
        return true;
      });
    },
  };
}

/** In-memory DLQ for tests. */
export function buildInMemoryDlq(): DlqWriter {
  const records: DlqRecord[] = [];
  return {
    async write(record) {
      records.push(record);
    },
    async readAll() {
      return [...records];
    },
    async filter(opts) {
      return records.filter((r) => {
        if (opts.reasons && !opts.reasons.includes(r.reason)) return false;
        if (opts.sinceMs !== undefined && r.recorded_at_ms < opts.sinceMs) return false;
        return true;
      });
    },
  };
}

/**
 * Synthesize a partial AnalyticsEvent from a DLQ record so it can be
 * replayed. Returns null when the original raw was unparseable.
 */
export function dlqRecordToEvent(record: DlqRecord): AnalyticsEvent | null {
  if (typeof record.raw !== 'object' || record.raw === null) return null;
  const raw = record.raw as Record<string, unknown>;
  const id = typeof raw['event_id'] === 'string' ? (raw['event_id'] as string) : null;
  if (!id) return null;
  return {
    ...(raw as unknown as AnalyticsEvent),
    event_id: id,
  };
}
