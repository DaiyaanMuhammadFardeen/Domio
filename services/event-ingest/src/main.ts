/**
 * Event-ingest — service entry point (Phase 17 W1).
 *
 * Reads env, builds defaultDeps, starts the disk-spool flusher, and
 * serves the Hono app via node:http.
 */

import { loadConfigFromEnv } from './types.js';
import { buildApp } from './server.js';
import { defaultDeps } from './default_deps.js';
import { buildFlusher } from './spool.js';

async function main() {
  const cfg = loadConfigFromEnv();
  const deps = await defaultDeps(cfg);
  const app = buildApp(deps);

  // Start the spool flusher.
  const stopFlusher = buildFlusher(deps.spool, deps.publisher);

  // Graceful shutdown.
  const shutdown = async (signal: NodeJS.Signals) => {
    process.stdout.write(`event-ingest: received ${signal}, shutting down\n`);
    stopFlusher();
    await deps.publisher.disconnect();
    await deps.nats.stop();
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
      process.stdout.write(`event-ingest listening on http://localhost:${port}\n`);
    });
  });
}

main().catch((err) => {
  process.stderr.write(`event-ingest: startup failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});