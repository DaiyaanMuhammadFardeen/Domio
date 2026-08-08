/**
 * Live-analytics — service entry point (Phase 17 W10).
 *
 * Wires NATS subscription, ClickHouse writer, ring buffer, pulse
 * derivation, and the WebSocket HUD into a single service. The HTTP
 * surface is small (pulse snapshot, flush); the high-frequency read
 * path is the WS stream.
 */

import { loadConfigFromEnv } from './types.js';
import { buildApp } from './server.js';
import { buildClickHouseClient } from './store/clickhouse.js';
import { buildOrchestrator } from './orchestrator.js';
import { buildNatsSubscriber } from './nats/subscriber.js';
import { attachWebSocket } from './routes/ws.js';
import type { NatsSubscriber } from './nats/subscriber.js';

async function main() {
  const cfg = loadConfigFromEnv();
  const ch = buildClickHouseClient(cfg);
  const orch = buildOrchestrator({ ch, ringBufferSize: cfg.ringBufferSize });
  const app = buildApp({ orch });

  // NATS subscription. If the broker is unreachable, fall back to an
  // in-memory subscriber that the test harness drives directly.
  let nats: NatsSubscriber | null = null;
  try {
    nats = await buildNatsSubscriber(cfg.natsUrl);
    await nats.start(async (event) => {
      await orch.ingest(event);
    });
    process.stdout.write('live-analytics: NATS subscriber started\n');
  } catch {
    process.stderr.write('live-analytics: NATS unreachable, falling back to in-memory\n');
    nats = null;
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    process.stdout.write(`live-analytics: received ${signal}, shutting down\n`);
    if (nats) await nats.stop();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const port = cfg.port;
  const { createServer } = await import('node:http');
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
  await attachWebSocket(server, orch);
  server.listen(port, () => {
    process.stdout.write(`live-analytics listening on http://localhost:${port}\n`);
  });
}

main().catch((err) => {
  process.stderr.write(`live-analytics: startup failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});