/**
 * @domio/cad-jobs — Hono app factory.
 *
 * Wires the in-memory repository, the in-process worker simulator, and
 * the route handlers. Production deployments swap the repo for a
 * Postgres-backed implementation and the worker for the Go pool.
 */

import { Hono } from 'hono';
import { InMemoryCadJobRepository } from './repo.js';
import type { CadJobRepository } from './repo.js';
import { CadWorkerSimulator, type WorkerSimulatorConfig } from './worker.js';
import { createCadRoutes } from './routes.js';

export interface AppDeps {
  readonly repo?: CadJobRepository;
  readonly workerConfig?: WorkerSimulatorConfig;
}

export function createApp(deps: AppDeps = {}): Hono {
  const repo = deps.repo ?? new InMemoryCadJobRepository();
  const worker = new CadWorkerSimulator(repo, deps.workerConfig ?? {});

  const app = new Hono();

  app.route('/', createCadRoutes({ repo, worker }));

  // Health check
  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  return app;
}
