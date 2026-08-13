/**
 * Phase 17 — ClickHouse migration runner.
 *
 * Applies migrations idempotently. Uses the @clickhouse/client HTTP driver
 * (port 8123) for both DDL and DDL-tracker inserts. Multi-statement .sql
 * files are split on `;` so we can attribute errors to the offending
 * statement and record statement counts in the tracker row.
 */

import type { ClickHouseClient } from '@clickhouse/client';
import { readFileSync, existsSync } from 'node:fs';
import { splitStatements, type MigrationFile } from './discovery.js';
import {
  detectDrift,
  ensureTrackerTable,
  fetchAppliedMigrations,
  recordAppliedMigration,
  shortChecksum,
} from './tracker.js';

export interface RunResult {
  ordinal: string;
  slug: string;
  status: 'applied' | 'skipped' | 'failed' | 'reverted';
  statements: number;
  duration_ms: number;
  message?: string;
}

export interface RunOptions {
  /** Target ordinal — apply only this migration and below. */
  upTo?: string;
  /** Down exactly this migration and only this one. */
  downOne?: string;
  /** Allow down on a missing migration (no-op). */
  allowMissingDown?: boolean;
}

export async function runUp(
  client: ClickHouseClient,
  database: string,
  files: readonly MigrationFile[],
  options: RunOptions = {},
): Promise<RunResult[]> {
  await ensureTrackerTable(client, database);
  const applied = await fetchAppliedMigrations(client, database);
  const drift = detectDrift(applied, files);
  if (drift.length > 0) {
    const drifted = drift.map((d) => `${d.file.ordinal} (${d.reason})`).join(', ');
    throw new Error(
      `[clickhouse-migrator] drift detected on already-applied migrations: ${drifted}. ` +
        `Revert the on-disk file or apply a follow-up migration.`,
    );
  }

  const results: RunResult[] = [];
  for (const file of files) {
    if (applied.has(file.ordinal)) {
      results.push({
        ordinal: file.ordinal,
        slug: file.slug,
        status: 'skipped',
        statements: 0,
        duration_ms: 0,
      });
      continue;
    }
    if (options.upTo && file.ordinal > options.upTo) break;

    const statements = splitStatements(readFileSync(file.path, 'utf8'));
    const startedAt = Date.now();
    try {
      for (const stmt of statements) {
        await client.exec({ query: stmt });
      }
      const duration_ms = Date.now() - startedAt;
      await recordAppliedMigration(client, database, file, statements.length, duration_ms);
      results.push({
        ordinal: file.ordinal,
        slug: file.slug,
        status: 'applied',
        statements: statements.length,
        duration_ms,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push({
        ordinal: file.ordinal,
        slug: file.slug,
        status: 'failed',
        statements: 0,
        duration_ms: Date.now() - startedAt,
        message: errMsg,
      });
      throw new Error(
        `[clickhouse-migrator] failed to apply ${file.ordinal}_${file.slug}: ${errMsg}`,
      );
    }
  }
  return results;
}

export async function runDown(
  client: ClickHouseClient,
  database: string,
  files: readonly MigrationFile[],
  options: RunOptions = {},
): Promise<RunResult[]> {
  if (!options.downOne) {
    throw new Error(`[clickhouse-migrator] down requires --one=<ordinal>`);
  }
  await ensureTrackerTable(client, database);
  const applied = await fetchAppliedMigrations(client, database);
  const target = files.find((f) => f.ordinal === options.downOne);
  if (!target) {
    throw new Error(`[clickhouse-migrator] unknown migration ordinal: ${options.downOne}`);
  }
  if (!applied.has(target.ordinal)) {
    return [
      {
        ordinal: target.ordinal,
        slug: target.slug,
        status: 'skipped',
        statements: 0,
        duration_ms: 0,
        message: 'not applied',
      },
    ];
  }

  // The down script is the companion file. Its existence is optional; if
  // missing we treat the migration as irreversible.
  const downPath = target.path.replace(/\.sql$/, '.down.sql');
  const down = existsSync(downPath) ? readFileSync(downPath, 'utf8') : null;
  if (down === null) {
    throw new Error(
      `[clickhouse-migrator] ${target.ordinal}_${target.slug} is irreversible (no .down.sql companion)`,
    );
  }

  const statements = splitStatements(down);
  const startedAt = Date.now();
  try {
    for (const stmt of statements) {
      await client.exec({ query: stmt });
    }
    const duration_ms = Date.now() - startedAt;
    // Remove the tracker row so the next `up` re-applies.
    await client.exec({
      query: `ALTER TABLE ${database}.__migrations DELETE WHERE ordinal = '${escapeSql(target.ordinal)}'`,
    });
    return [
      {
        ordinal: target.ordinal,
        slug: target.slug,
        status: 'reverted',
        statements: statements.length,
        duration_ms,
      },
    ];
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[clickhouse-migrator] failed to revert ${target.ordinal}_${target.slug}: ${errMsg}`,
    );
  }
}

export async function runStatus(
  client: ClickHouseClient,
  database: string,
  files: readonly MigrationFile[],
): Promise<
  Array<{ ordinal: string; slug: string; checksum: string; status: Applied | Pending | Drift }>
> {
  await ensureTrackerTable(client, database);
  const applied = await fetchAppliedMigrations(client, database);
  const drift = detectDrift(applied, files);
  const driftOrds = new Set(drift.map((d) => d.file.ordinal));
  return files.map((f) => {
    const a = applied.get(f.ordinal);
    if (!a)
      return {
        ordinal: f.ordinal,
        slug: f.slug,
        checksum: shortChecksum(f.checksum),
        status: 'pending' as const,
      };
    if (driftOrds.has(f.ordinal))
      return {
        ordinal: f.ordinal,
        slug: f.slug,
        checksum: shortChecksum(f.checksum),
        status: 'drift' as const,
      };
    return {
      ordinal: f.ordinal,
      slug: f.slug,
      checksum: shortChecksum(f.checksum),
      status: 'applied' as const,
    };
  });
}

type Applied = 'applied';
type Pending = 'pending';
type Drift = 'drift';

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}
