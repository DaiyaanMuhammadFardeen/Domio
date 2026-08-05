/**
 * @domio/cad-jobs — Hono route handlers.
 *
 * Mirrors contracts/openapi/v1/cad-jobs.yaml:
 *   POST   /v1/cad_jobs
 *   GET    /v1/cad_jobs
 *   GET    /v1/cad_jobs/:id
 *   DELETE /v1/cad_jobs/:id
 */

import { Hono } from 'hono';
import type { CadJobRepository } from './repo.js';
import { CadJobNotFoundError, CadJobConflictError } from './repo.js';
import {
  buildCadJob,
  type CreateCadJobDeps,
} from './repo.js';
import { validateCreateCadJob } from './schemas.js';
import { TERMINAL_PROGRESS } from './types.js';
import type { CadWorkerSimulator } from './worker.js';

export interface CadRouteDeps {
  readonly repo: CadJobRepository;
  readonly worker: CadWorkerSimulator;
  readonly createDeps?: CreateCadJobDeps;
}

export function createCadRoutes(deps: CadRouteDeps): Hono {
  const { repo, worker, createDeps } = deps;
  const app = new Hono();

  // ---------------------------------------------------------------------
  // POST /v1/cad_jobs — create a CAD conversion job
  // ---------------------------------------------------------------------
  app.post('/v1/cad_jobs', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ code: 'INVALID_JSON', message: 'Body must be valid JSON' }, 400);
    }

    const validation = validateCreateCadJob(body);
    if (!validation.valid) {
      return c.json(
        {
          code: 'VALIDATION_ERROR',
          message: validation.errors.map((e) => e.message ?? 'invalid').join('; '),
          details: validation.errors,
        },
        400,
      );
    }

    const tenantId = c.req.header('x-tenant-id') ?? 'default';
    const req = body as Parameters<typeof buildCadJob>[0];
    const job = buildCadJob({ ...req, tenantId }, createDeps);
    await repo.insert(job);

    // Kick off the worker (in-memory simulator). Production wires the
    // real Go worker pool via workers/cad-pipeline/.
    void worker.start(job.id);

    return c.json(job, 201);
  });

  // ---------------------------------------------------------------------
  // GET /v1/cad_jobs — list CAD jobs for the tenant
  // ---------------------------------------------------------------------
  app.get('/v1/cad_jobs', async (c) => {
    const tenantId = c.req.header('x-tenant-id') ?? 'default';
    const items = await repo.listByTenant(tenantId);
    return c.json({ items });
  });

  // ---------------------------------------------------------------------
  // GET /v1/cad_jobs/:id — get a CAD job by ID
  // ---------------------------------------------------------------------
  app.get('/v1/cad_jobs/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const job = await repo.findById(id);
      if (!job) {
        return c.json({ code: 'NOT_FOUND', message: `CAD job ${id} not found` }, 404);
      }
      return c.json(job);
    } catch (e) {
      if (e instanceof CadJobNotFoundError) {
        return c.json({ code: e.code, message: e.message }, 404);
      }
      throw e;
    }
  });

  // ---------------------------------------------------------------------
  // DELETE /v1/cad_jobs/:id — cancel a CAD job
  // ---------------------------------------------------------------------
  app.delete('/v1/cad_jobs/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const job = await repo.findById(id);
      if (!job) {
        return c.json({ code: 'NOT_FOUND', message: `CAD job ${id} not found` }, 404);
      }
      if (TERMINAL_PROGRESS.includes(job.progress)) {
        return c.json(
          {
            code: 'CAD_JOB_CONFLICT',
            message: `Cannot cancel job in terminal state '${job.progress}'`,
          },
          409,
        );
      }
      // Best-effort worker cancellation, then mark as failed with a
      // clear "cancelled" message so callers see the terminal state.
      worker.cancel(id);
      await repo.update(id, {
        progress: 'failed',
        errorMessage: 'cancelled by client',
        finishedAt: new Date().toISOString(),
      });
      return c.body(null, 204);
    } catch (e) {
      if (e instanceof CadJobNotFoundError) {
        return c.json({ code: e.code, message: e.message }, 404);
      }
      if (e instanceof CadJobConflictError) {
        return c.json({ code: e.code, message: e.message }, 409);
      }
      throw e;
    }
  });

  return app;
}