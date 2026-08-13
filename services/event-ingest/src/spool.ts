/**
 * Event-ingest — disk spool (Phase 17 W1).
 *
 * When Kafka is unavailable, the publisher writes events to NDJSON
 * files under cfg.spoolDir. A background flusher (buildFlusher)
 * periodically tries to drain the spool back to Kafka. The flusher is
 * a separate type so the spool itself stays simple.
 *
 * File layout:
 *   ${spoolDir}/<partitionKey>.ndjson
 *
 * One file per partition key means a single FIFO per (workspace,
 * viewer) pair — preserves the ordering invariant for replay.
 */

import { mkdir, appendFile, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnalyticsEvent } from './types.js';
import { KAFKA_TOPIC_RAW } from './types.js';
import type { KafkaPublisher } from './kafka.js';

export interface Spool {
  /** Write an event to the spool. Returns the path it landed in. */
  write(event: AnalyticsEvent): Promise<string>;
  /** List the files in the spool directory, sorted oldest first. */
  list(): Promise<string[]>;
  /** Read all events from a spool file (consumes it on success). */
  drain(path: string): Promise<AnalyticsEvent[]>;
  /** Delete a spool file after successful replay. */
  remove(path: string): Promise<void>;
  /** Total bytes across all spool files. */
  size(): Promise<number>;
}

function safeFileName(key: string): string {
  // Kafka partition keys are workspace_id:viewer_id_key. Replace any
  // character that is unsafe for filenames (anything besides
  // [A-Za-z0-9._-]).
  return key.replace(/[^A-Za-z0-9._-]/g, '_') + '.ndjson';
}

export async function buildDiskSpool(dir: string): Promise<Spool> {
  await mkdir(dir, { recursive: true });
  return {
    async write(event) {
      const key = `${event.workspace_id}:${event.viewer_id_key}`;
      const path = join(dir, safeFileName(key));
      const line = JSON.stringify(event) + '\n';
      await appendFile(path, line, 'utf-8');
      return path;
    },
    async list() {
      const entries = await readdir(dir);
      const withStats = await Promise.all(
        entries
          .filter((name) => name.endsWith('.ndjson'))
          .map(async (name) => {
            const path = join(dir, name);
            const s = await stat(path).catch(() => null);
            return s ? { path, mtime: s.mtimeMs } : null;
          }),
      );
      return withStats
        .filter((x): x is { path: string; mtime: number } => x !== null)
        .sort((a, b) => a.mtime - b.mtime)
        .map((x) => x.path);
    },
    async drain(path) {
      const { readFile } = await import('node:fs/promises');
      const raw = await readFile(path, 'utf-8');
      const lines = raw.split('\n').filter((line) => line.length > 0);
      return lines.map((line) => JSON.parse(line) as AnalyticsEvent);
    },
    async remove(path) {
      await unlink(path);
    },
    async size() {
      const entries = await readdir(dir);
      let total = 0;
      for (const name of entries) {
        if (!name.endsWith('.ndjson')) continue;
        const s = await stat(join(dir, name)).catch(() => null);
        if (s) total += s.size;
      }
      return total;
    },
  };
}

/**
 * In-memory spool for tests. Same shape as the disk spool so route
 * tests don't care which one is wired in.
 */
export function buildInMemorySpool(): Spool {
  const buckets = new Map<string, AnalyticsEvent[]>();
  const order: string[] = [];
  return {
    async write(event) {
      const key = `${event.workspace_id}:${event.viewer_id_key}`;
      const list = buckets.get(key) ?? [];
      list.push(event);
      buckets.set(key, list);
      if (!order.includes(key)) order.push(key);
      return `mem://${key}`;
    },
    async list() {
      return [...order].map((k) => `mem://${k}`);
    },
    async drain(path) {
      const key = path.replace(/^mem:\/\//, '');
      const list = buckets.get(key) ?? [];
      return [...list];
    },
    async remove(path) {
      const key = path.replace(/^mem:\/\//, '');
      buckets.delete(key);
      const idx = order.indexOf(key);
      if (idx >= 0) order.splice(idx, 1);
    },
    async size() {
      let total = 0;
      for (const list of buckets.values()) {
        for (const ev of list) total += JSON.stringify(ev).length + 1;
      }
      return total;
    },
  };
}

/**
 * Periodically drain the spool back to Kafka. Returns a stop() function
 * that cancels the interval.
 */
export function buildFlusher(
  spool: Spool,
  publisher: KafkaPublisher,
  intervalMs = 10_000,
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async () => {
    if (running || !publisher.ready()) return;
    running = true;
    try {
      const files = await spool.list();
      for (const path of files) {
        const events = await spool.drain(path);
        if (events.length === 0) {
          await spool.remove(path);
          continue;
        }
        try {
          await publisher.publishMany(events);
          await spool.remove(path);
        } catch {
          // Leave the file in place; try again on the next tick.
          break;
        }
      }
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => {
    void tick();
  }, intervalMs);
  // Avoid blocking process exit on tests.
  if (typeof timer === 'object' && timer && 'unref' in timer && typeof timer.unref === 'function') {
    timer.unref();
  }

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export { KAFKA_TOPIC_RAW };
