/**
 * Phase 17 — ClickHouse migrator config.
 *
 * Reads connection details from env with sensible dev defaults that match
 * infrastructure/local/docker-compose.yml. Mirrors the env contract used by
 * services/analytics-warehouse (CLICKHOUSE_URL, CLICKHOUSE_USER, etc.).
 */

import { existsSync, statSync } from 'node:fs';

export interface MigratorConfig {
  url: string;
  username: string;
  password: string;
  database: string;
  /** Absolute path to the init directory containing .sql files. */
  initDir: string;
  /** Allow running on a brand-new / empty database. */
  allowCreate: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MigratorConfig {
  const url = env.CLICKHOUSE_URL ?? 'http://localhost:8123';
  const username = env.CLICKHOUSE_USER ?? 'domio';
  const password = env.CLICKHOUSE_PASSWORD ?? 'domio';
  const database = env.CLICKHOUSE_DB ?? 'domio_analytics';

  // When invoked from the repo root, the init dir is at
  // infrastructure/clickhouse/init. When invoked from the migrator package
  // dir directly, it's at ../../clickhouse/init.
  const candidates = [
    env.CLICKHOUSE_INIT_DIR,
    './infrastructure/clickhouse/init',
    '../../clickhouse/init',
    '../clickhouse/init',
  ].filter((p): p is string => Boolean(p));

  const initDir = candidates.find((candidate) => {
    try {
      return existsSync(candidate) && statSync(candidate).isDirectory();
    } catch {
      return false;
    }
  });
  if (!initDir) {
    throw new Error(
      `[clickhouse-migrator] could not locate init/ dir; set CLICKHOUSE_INIT_DIR`,
    );
  }

  return {
    url,
    username,
    password,
    database,
    initDir,
    allowCreate: (env.CLICKHOUSE_ALLOW_CREATE ?? 'true') === 'true',
  };
}
