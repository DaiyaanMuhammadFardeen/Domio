#!/usr/bin/env node
/**
 * event-ingest replay CLI.
 *
 * Usage:
 *   pnpm --filter @domio/event-ingest replay [options]
 *
 * Options:
 *   --dir <path>           DLQ directory (default INGEST_DLQ_DIR or /var/lib/domio/event-ingest/dlq)
 *   --reason <reason>      Filter by reason (schema|pii|consent|parse|unknown); may repeat
 *   --since <unix_ms>      Only replay records after this timestamp
 *   --dry-run              Print what would be replayed without writing
 *   --limit <n>            Cap on records to replay (default 1000)
 *
 * Events are read from the on-disk DLQ, converted back to
 * AnalyticsEvent shape, and re-published via the same Kafka publisher
 * the live service uses. Replayed events keep their original event_id
 * so the columnar loader can dedupe.
 *
 * Implementation note: this CLI imports the same modules the live
 * service uses, so it's a useful integration test of the full pipeline.
 */

import { buildDiskDlq, dlqRecordToEvent } from '../src/dlq.js';
import { buildKafkaPublisher, buildInMemoryKafkaPublisher } from '../src/kafka.js';
import { loadConfigFromEnv } from '../src/types.js';

interface CliArgs {
  dir: string;
  reasons: string[];
  sinceMs: number | null;
  dryRun: boolean;
  limit: number;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    dir: process.env['INGEST_DLQ_DIR'] ?? '/var/lib/domio/event-ingest/dlq',
    reasons: [],
    sinceMs: null,
    dryRun: false,
    limit: 1000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') {
      args.dir = argv[++i] ?? args.dir;
    } else if (a === '--reason') {
      args.reasons.push(argv[++i] ?? '');
    } else if (a === '--since') {
      args.sinceMs = Number(argv[++i] ?? 0);
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--limit') {
      args.limit = Number(argv[++i] ?? 1000);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dlq = await buildDiskDlq(args.dir);
  const records = await dlq.filter({
    reasons:
      args.reasons.length > 0
        ? (args.reasons as ('schema' | 'pii' | 'consent' | 'parse' | 'unknown')[])
        : undefined,
    sinceMs: args.sinceMs ?? undefined,
  });
  const sliced = records.slice(0, args.limit);

  if (args.dryRun) {
    process.stdout.write(
      JSON.stringify({ count: sliced.length, sample: sliced.slice(0, 5) }, null, 2) + '\n',
    );
    return;
  }

  const events = sliced.map(dlqRecordToEvent).filter((e): e is NonNullable<typeof e> => e !== null);
  if (events.length === 0) {
    process.stdout.write(JSON.stringify({ ok: true, replayed: 0 }) + '\n');
    return;
  }

  const cfg = loadConfigFromEnv();
  const publisher = await buildKafkaPublisher(cfg.kafkaBrokers).catch(() =>
    buildInMemoryKafkaPublisher(),
  );
  try {
    const offsets = await publisher.publishMany(events);
    process.stdout.write(JSON.stringify({ ok: true, replayed: events.length, offsets }) + '\n');
  } finally {
    await publisher.disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(`replay failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
