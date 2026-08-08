/**
 * Phase 17 — ClickHouse migrator CLI.
 *
 * Subcommands:
 *   up                  apply all pending migrations
 *   up --to=0042        apply up to and including the named ordinal
 *   down --one=0042     revert a single migration (requires .down.sql)
 *   status              print applied vs pending
 *   verify              fail if any applied migration has drifted
 *
 * Env:
 *   CLICKHOUSE_URL      (default http://localhost:8123)
 *   CLICKHOUSE_USER     (default domio)
 *   CLICKHOUSE_PASSWORD (default domio)
 *   CLICKHOUSE_DB       (default domio_analytics)
 *   CLICKHOUSE_INIT_DIR (default ./infrastructure/clickhouse/init)
 */

import { createClient } from '@clickhouse/client';
import { loadConfig, type MigratorConfig } from './config.js';
import { discoverMigrations } from './discovery.js';
import { runDown, runStatus, runUp } from './runner.js';

const HELP = `
@domio/clickhouse-migrator

Usage:
  clickhouse-migrator up [--to=NNNN]
  clickhouse-migrator down --one=NNNN
  clickhouse-migrator status
  clickhouse-migrator verify

Env:
  CLICKHOUSE_URL        (default http://localhost:8123)
  CLICKHOUSE_USER       (default domio)
  CLICKHOUSE_PASSWORD   (default domio)
  CLICKHOUSE_DB         (default domio_analytics)
  CLICKHOUSE_INIT_DIR   (default ./infrastructure/clickhouse/init)
`.trim();

async function main(argv: string[]): Promise<void> {
  const cmd = argv[0];
  if (!cmd || cmd === '-h' || cmd === '--help') {
    process.stdout.write(HELP + '\n');
    return;
  }

  const config = loadConfig();
  const client = createClient({
    url: config.url,
    username: config.username,
    password: config.password,
    database: config.database,
  });

  const pairs = discoverMigrations(config.initDir);
  const ups = pairs.map((p) => p.up);

  try {
    switch (cmd) {
      case 'up': {
        const to = flagValue(argv, '--to');
        const results = await runUp(client, config.database, ups, { upTo: to });
        printResults(results);
        break;
      }
      case 'down': {
        const one = flagValue(argv, '--one');
        if (!one) throw new Error(`down requires --one=NNNN`);
        const results = await runDown(client, config.database, ups, { downOne: one });
        printResults(results);
        break;
      }
      case 'status': {
        const rows = await runStatus(client, config.database, ups);
        printStatus(rows);
        break;
      }
      case 'verify': {
        const rows = await runStatus(client, config.database, ups);
        const drifted = rows.filter((r) => r.status === 'drift');
        if (drifted.length > 0) {
          process.stderr.write(`drift detected:\n`);
          for (const d of drifted) process.stderr.write(`  ${d.ordinal} ${d.slug}\n`);
          process.exitCode = 1;
        } else {
          process.stdout.write('ok: no drift\n');
        }
        break;
      }
      default:
        process.stderr.write(`unknown subcommand: ${cmd}\n${HELP}\n`);
        process.exitCode = 2;
    }
  } finally {
    await client.close();
  }
}

function flagValue(argv: string[], flag: string): string | undefined {
  for (const a of argv) {
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
  }
  return undefined;
}

function printResults(results: Array<{ ordinal: string; slug: string; status: string; statements: number; duration_ms: number; message?: string }>): void {
  for (const r of results) {
    const tag = r.status.toUpperCase().padEnd(8);
    const stat = r.statements > 0 ? ` ${r.statements} stmts` : '';
    const dur = r.duration_ms > 0 ? ` ${r.duration_ms}ms` : '';
    process.stdout.write(`${tag} ${r.ordinal} ${r.slug}${stat}${dur}\n`);
    if (r.message) process.stdout.write(`         ${r.message}\n`);
  }
}

function printStatus(rows: Array<{ ordinal: string; slug: string; checksum: string; status: string }>): void {
  for (const r of rows) {
    process.stdout.write(`${r.status.padEnd(8)} ${r.ordinal} ${r.slug}  ${r.checksum}\n`);
  }
}

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
