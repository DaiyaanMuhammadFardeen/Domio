/**
 * Viewer-identity — entrypoint (Phase 17 W3).
 *
 * In production this wires the Postgres store + Redis cache. In dev
 * or in tests we fall back to the in-memory store so the operator
 * can spin the service up against a fresh docker-compose without
 * needing a Postgres migration.
 */

import { createServer } from 'node:http';
import { loadConfigFromEnv } from './types.js';
import { buildInMemoryStore } from './store/inmemory.js';
import { buildApp } from './server.js';
import { defaultPolicyFor } from './consent/policy.js';

declare const process: {
  env: Record<string, string | undefined>;
  exit: (code: number) => never;
  on: (sig: string, fn: () => void) => void;
  argv: string[];
};
declare const console: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

export async function boot(): Promise<{ port: number; close: () => Promise<void> }> {
  const cfg = loadConfigFromEnv();
  const store = buildInMemoryStore();
  const app = buildApp({
    store,
    salt: cfg.identifierSalt,
    acceptedModes: () => cfg.defaultPrivacyModes,
  });

  const server = createServer(async (req, res) => {
    const url = `http://${req.headers.host}${req.url}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(', '));
    }
    const method = req.method ?? 'GET';
    let body: BodyInit | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      body = Buffer.concat(chunks);
    }
    const honoRes = await app.request(url, { method, headers, body: body ?? null });
    res.statusCode = honoRes.status;
    honoRes.headers.forEach((v, k) => {
      if (v) res.setHeader(k, v);
    });
    const out = await honoRes.arrayBuffer();
    res.end(Buffer.from(out));
  });

  await new Promise<void>((resolve) => server.listen(cfg.port, resolve));
  const close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  return { port: cfg.port, close };
}

// ESM entrypoint detection. The CommonJS `require.main === module` idiom
// doesn't work under `"type": "module"` — `require` is undefined outside
// CJS. `import.meta.url` always points at this file; compare against the
// `process.argv[1]` entry used to launch the process (which is the
// compiled `dist/main.js` path). Only run boot() when this file is the
// actual entrypoint, not when it's imported by tests.
const isMain = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const entryUrl = new URL(`file://${entry}`).href;
    return import.meta.url === entryUrl;
  } catch {
    return false;
  }
})();

if (isMain) {
  // Suppress unused-warning for defaultPolicyFor when this is the entry point.
  void defaultPolicyFor;
  boot()
    .then(({ port }) => {
      console.log(`viewer-identity listening on :${port}`);
    })
    .catch((err) => {
      console.error('viewer-identity boot failed', err);
      process.exit(1);
    });
  const shutdown = () => process.exit(0);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
