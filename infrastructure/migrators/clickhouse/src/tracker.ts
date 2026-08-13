/**
 * Phase 17 — ClickHouse migration tracker.
 *
 * Records every applied migration in `domio_analytics.__migrations` so that
 * the migrator is idempotent (re-running `migrate:up` is a no-op).
 *
 * This table is intentionally NOT a MergeTree — it's a tiny Log table that
 * we don't query analytically. We avoid competing with the rest of the
 * analytics schema for partition slots.
 */

import { createHash } from 'node:crypto';
import type { ClickHouseClient } from '@clickhouse/client';
import type { MigrationFile } from './discovery.js';

export interface AppliedMigration {
  ordinal: string;
  slug: string;
  checksum: string;
  applied_at: string;
  statements: number;
  duration_ms: number;
}

export const MIGRATIONS_TABLE = '__migrations';

export const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE}
(
    ordinal      String,
    slug         String,
    checksum     String,
    applied_at   DateTime DEFAULT now(),
    statements   UInt32,
    duration_ms  UInt32
)
ENGINE = MergeTree
ORDER BY (ordinal)
`.trim();

export async function ensureTrackerTable(
  client: ClickHouseClient,
  database: string,
): Promise<void> {
  await client.exec({ query: `CREATE DATABASE IF NOT EXISTS ${database}` });
  await client.exec({ query: MIGRATIONS_TABLE_SQL });
}

export async function fetchAppliedMigrations(
  client: ClickHouseClient,
  database: string,
): Promise<Map<string, AppliedMigration>> {
  const result = await client.query({
    query: `SELECT ordinal, slug, checksum, applied_at, statements, duration_ms FROM ${database}.${MIGRATIONS_TABLE} FINAL ORDER BY ordinal ASC`,
    format: 'JSONEachRow',
  });
  const rows = (await result.json()) as Array<{
    ordinal: string;
    slug: string;
    checksum: string;
    applied_at: string;
    statements: string | number;
    duration_ms: string | number;
  }>;
  const map = new Map<string, AppliedMigration>();
  for (const row of rows) {
    map.set(row.ordinal, {
      ordinal: row.ordinal,
      slug: row.slug,
      checksum: row.checksum,
      applied_at: row.applied_at,
      statements: Number(row.statements),
      duration_ms: Number(row.duration_ms),
    });
  }
  return map;
}

export async function recordAppliedMigration(
  client: ClickHouseClient,
  database: string,
  file: MigrationFile,
  statements: number,
  duration_ms: number,
): Promise<void> {
  await client.insert({
    table: `${database}.${MIGRATIONS_TABLE}`,
    values: [
      [file.ordinal, file.slug, file.checksum, new Date().toISOString(), statements, duration_ms],
    ],
    format: ['ordinal', 'slug', 'checksum', 'applied_at', 'statements', 'duration_ms'],
  });
}

/**
 * Verifies that every applied migration's checksum still matches the file
 * on disk. Catches drift from a developer editing a migration after it has
 * been applied in another environment.
 */
export function detectDrift(
  applied: Map<string, AppliedMigration>,
  discovered: readonly MigrationFile[],
): Array<{ file: MigrationFile; reason: 'modified' | 'deleted' }> {
  const drifts: Array<{ file: MigrationFile; reason: 'modified' | 'deleted' }> = [];
  for (const file of discovered) {
    const a = applied.get(file.ordinal);
    if (!a) continue;
    if (a.checksum !== file.checksum) {
      drifts.push({ file, reason: 'modified' });
    }
  }
  return drifts;
}

export function shortChecksum(checksum: string): string {
  return createHash('sha256').update(checksum).digest('hex').slice(0, 12);
}
