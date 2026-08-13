/**
 * Team-analytics — service entry point (Phase 17 W9).
 *
 * Reads env, builds the ClickHouse client + DAO, starts the rollup
 * cron, and serves the Hono app via node:http (mirroring the
 * event-ingest pattern).
 */

import { loadConfigFromEnv } from './types.js';
import { buildApp } from './server.js';
import { buildClickHouseClient } from './store/clickhouse.js';
import { buildTemplateDao } from './store/templates.js';
import { buildRollup, type RollupHandle } from './rollup/rollup.js';

async function main() {
  const cfg = loadConfigFromEnv();
  const ch = buildClickHouseClient(cfg);
  const dao = buildTemplateDao(ch);
  const app = buildApp({ ch, dao });

  let rollup: RollupHandle | null = null;
  if (cfg.rollupEnabled) {
    rollup = buildRollup(ch, cfg.rollupIntervalMs);
    rollup.start();
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    process.stdout.write(`team-analytics: received ${signal}, shutting down\n`);
    if (rollup) rollup.stop();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const port = cfg.port;
  import('node:http').then(({ createServer }) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (!value) continue;
        if (Array.isArray(value)) {
          for (const v of value) headers.set(key, v);
        } else {
          headers.set(key, value);
        }
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
        const init: RequestInit = {
          method: req.method ?? 'GET',
          headers,
          ...(body ? { body } : {}),
        };
        const request = new Request(url.toString(), init);
        const response = await app.fetch(request);
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        const responseBody = await response.arrayBuffer();
        res.end(Buffer.from(responseBody));
      });
    });
    server.listen(port, () => {
      process.stdout.write(`team-analytics listening on http://localhost:${port}\n`);
    });
  });
}

main().catch((err) => {
  process.stderr.write(
    `team-analytics: startup failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
