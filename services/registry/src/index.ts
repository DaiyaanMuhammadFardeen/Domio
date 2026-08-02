/**
 * Registry-service entry point.
 *
 * Reads PORT from env (default 8787), builds defaultDeps with InMemoryStore,
 * serves the Hono app.
 */

import { InMemoryStore } from './store/memory.js';
import { defaultDeps } from './deps.js';
import { buildApp } from './server.js';

function main() {
  const port = Number(process.env.PORT) || 8787;
  const store = new InMemoryStore();
  const deps = defaultDeps(store);
  const app = buildApp(deps);

  // Use node:http for compatibility (no Bun/Deno needed)
  import('node:http').then(({ createServer }) => {
    const server = createServer((req, res) => {
      // Convert node:http request to web Request
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            for (const v of value) headers.set(key, v);
          } else {
            headers.set(key, value);
          }
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
      console.log(`Registry service listening on http://localhost:${port}`);
    });
  });
}

main();
