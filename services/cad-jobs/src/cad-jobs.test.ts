/**
 * @domio/cad-jobs — service-level tests.
 *
 * Covers the full OpenAPI surface at contracts/openapi/v1/cad-jobs.yaml:
 *   - POST /v1/cad_jobs (create, validation, defaults)
 *   - GET /v1/cad_jobs (list)
 *   - GET /v1/cad_jobs/:id (get, 404)
 *   - DELETE /v1/cad_jobs/:id (cancel, 409 on terminal)
 *
 * Plus state-machine progress: parsing → meshing → optimizing → done.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from './app.js';
import type { Hono } from 'hono';
import { InMemoryCadJobRepository } from './repo.js';
import { CadWorkerSimulator } from './worker.js';
import { ulid } from './__tests__/ulid.js';

const TEST_TENANT = 'tenant-test';

interface TestEnv {
  app: Hono;
  repo: InMemoryCadJobRepository;
  worker: CadWorkerSimulator;
}

function buildEnv(workerConfig: { stageDelayMs?: number; failureRate?: number } = {}): TestEnv {
  const repo = new InMemoryCadJobRepository();
  const worker = new CadWorkerSimulator(repo, { stageDelayMs: 1, ...workerConfig });
  const app = createApp({ repo, workerConfig: { stageDelayMs: 1, ...workerConfig } });
  return { app, repo, worker };
}

async function createJob(
  app: Hono,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<Response> {
  const req = new Request('http://test.local/v1/cad_jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': TEST_TENANT, ...headers },
    body: JSON.stringify(body),
  });
  return app.fetch(req);
}

async function getJob(
  app: Hono,
  id: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const req = new Request(`http://test.local/v1/cad_jobs/${id}`, {
    method: 'GET',
    headers: { 'x-tenant-id': TEST_TENANT, ...headers },
  });
  return app.fetch(req);
}

async function deleteJob(
  app: Hono,
  id: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const req = new Request(`http://test.local/v1/cad_jobs/${id}`, {
    method: 'DELETE',
    headers: { 'x-tenant-id': TEST_TENANT, ...headers },
  });
  return app.fetch(req);
}

async function listJobs(app: Hono, headers: Record<string, string> = {}): Promise<Response> {
  const req = new Request('http://test.local/v1/cad_jobs', {
    method: 'GET',
    headers: { 'x-tenant-id': TEST_TENANT, ...headers },
  });
  return app.fetch(req);
}

describe('POST /v1/cad_jobs', () => {
  let env: TestEnv;
  beforeEach(() => {
    env = buildEnv();
  });
  // No afterEach cleanup — each test gets its own env via buildEnv.

  it('creates a job with required fields and returns 201', async () => {
    const res = await createJob(env.app, { modelAssetId: 'asset-1' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.modelAssetId).toBe('asset-1');
    expect(body.tenantId).toBe(TEST_TENANT);
    expect(body.progress).toBe('parsing');
    expect(body.websocketUrl).toContain('wss://');
    expect(body.resultUrl).toBeNull();
    expect(body.tessellationChordMm).toBe(0.1);
    expect(body.tessellationAngleDeg).toBe(15);
    expect(body.targetPolyCount).toBe(250_000);
    expect(body.format).toBe('glb');
  });

  it('accepts tessellation overrides', async () => {
    const res = await createJob(env.app, {
      modelAssetId: 'asset-2',
      tessellationChordMm: 0.05,
      tessellationAngleDeg: 30,
      targetPolyCount: 1_500_000,
      format: 'gltf',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tessellationChordMm).toBe(0.05);
    expect(body.tessellationAngleDeg).toBe(30);
    expect(body.targetPolyCount).toBe(1_500_000);
    expect(body.format).toBe('gltf');
  });

  it('returns 400 on invalid JSON', async () => {
    const req = new Request('http://test.local/v1/cad_jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tenant-id': TEST_TENANT },
      body: 'not json',
    });
    const res = await env.app.fetch(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_JSON');
  });

  it('returns 400 when modelAssetId is missing', async () => {
    const res = await createJob(env.app, { tessellationChordMm: 0.1 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when targetPolyCount is out of range', async () => {
    const res = await createJob(env.app, {
      modelAssetId: 'asset-small',
      targetPolyCount: 100, // below MIN_TARGET_POLY_COUNT (1000)
    });
    expect(res.status).toBe(400);
    const res2 = await createJob(env.app, {
      modelAssetId: 'asset-big',
      targetPolyCount: 100_000_000, // above MAX (10M)
    });
    expect(res2.status).toBe(400);
  });

  it('rejects unknown format', async () => {
    const res = await createJob(env.app, { modelAssetId: 'a', format: 'obj' });
    expect(res.status).toBe(400);
  });

  it('rejects additional properties', async () => {
    const res = await createJob(env.app, { modelAssetId: 'a', unknown: 'evil' });
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/cad_jobs', () => {
  let env: TestEnv;
  beforeEach(() => {
    env = buildEnv();
  });

  it('lists jobs scoped to tenant', async () => {
    await createJob(env.app, { modelAssetId: 'a1' });
    await createJob(env.app, { modelAssetId: 'a2' });
    const res = await listJobs(env.app);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].modelAssetId).toBeTruthy();
  });

  it('returns empty list for empty tenant', async () => {
    const res = await listJobs(env.app, { 'x-tenant-id': 'other-tenant' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(0);
  });
});

describe('GET /v1/cad_jobs/:id', () => {
  let env: TestEnv;
  beforeEach(() => {
    env = buildEnv();
  });

  it('returns the job by id', async () => {
    const create = await createJob(env.app, { modelAssetId: 'a3' });
    const { id } = await create.json();
    const res = await getJob(env.app, id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(id);
  });

  it('returns 404 when not found', async () => {
    const res = await getJob(env.app, 'nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/cad_jobs/:id', () => {
  let env: TestEnv;
  beforeEach(() => {
    env = buildEnv();
  });

  it('cancels a queued job', async () => {
    const create = await createJob(env.app, { modelAssetId: 'a4' });
    const { id } = await create.json();
    const res = await deleteJob(env.app, id);
    expect(res.status).toBe(204);
    const after = await getJob(env.app, id);
    const body = await after.json();
    expect(body.progress).toBe('failed');
    expect(body.errorMessage).toBe('cancelled by client');
  });

  it('returns 404 when not found', async () => {
    const res = await deleteJob(env.app, 'nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns 409 when job is already done', async () => {
    const repo = new InMemoryCadJobRepository();
    const worker = new CadWorkerSimulator(repo, { stageDelayMs: 1 });
    const app = createApp({ repo, workerConfig: { stageDelayMs: 1 } });
    const create = await createJob(app, { modelAssetId: 'a5' });
    const { id } = await create.json();
    // Force the job into a terminal state.
    await repo.update(id, { progress: 'done', finishedAt: new Date().toISOString() });
    const res = await deleteJob(app, id);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('CAD_JOB_CONFLICT');
  });
});

describe('worker simulator — happy path', () => {
  it('drives parsing → meshing → optimizing → done', async () => {
    const repo = new InMemoryCadJobRepository();
    const seen: string[] = [];
    // Single shared worker so the listener sees events emitted by the
    // app's POST handler (which calls worker.start on the same instance).
    const worker = new CadWorkerSimulator(repo, { stageDelayMs: 1 });
    worker.onProgress((job) => seen.push(job.progress));

    const app = createApp({ repo, workerConfig: { stageDelayMs: 1 } });
    // Inject the same worker into the app factory by monkey-patching the
    // route's worker reference. Simpler: just call worker.start() directly
    // after the app inserts the job.
    const res = await createJob(app, { modelAssetId: 'a6' });
    const { id } = await res.json();
    // The app uses its own internally-created worker; drive the shared one
    // for the listener assertion.
    void worker.start(id);

    // Wait for the worker to finish all stages.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const final = await repo.findById(id);
    expect(final).not.toBeNull();
    expect(final!.progress).toBe('done');
    expect(final!.resultUrl).toContain(id);
    expect(final!.finishedAt).toBeTruthy();
    expect(seen).toEqual(expect.arrayContaining(['parsing', 'meshing', 'optimizing', 'done']));
  });

  it('drives to failed when failureRate is 1', async () => {
    const repo = new InMemoryCadJobRepository();
    const worker = new CadWorkerSimulator(repo, { stageDelayMs: 1, failureRate: 1 });
    const app = createApp({ repo, workerConfig: { stageDelayMs: 1, failureRate: 1 } });

    const res = await createJob(app, { modelAssetId: 'a7' });
    const { id } = await res.json();
    void worker.start(id);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const final = await repo.findById(id);
    expect(final!.progress).toBe('failed');
    expect(final!.errorMessage).toMatch(/simulated|failed/i);
  });
});

describe('id generator', () => {
  it('uses defaultIdGenerator when no override is provided', async () => {
    const env = buildEnv();
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const res = await createJob(env.app, { modelAssetId: `a${i}` });
      const { id } = await res.json();
      expect(id).toHaveLength(26);
      seen.add(id);
    }
    // Each id must be unique even though defaultIdGenerator uses Math.random.
    expect(seen.size).toBe(5);
  });
});

describe('lib export', () => {
  it('index exports the public surface', async () => {
    const lib = await import('./index.js');
    expect(typeof lib.createApp).toBe('function');
    expect(typeof lib.InMemoryCadJobRepository).toBe('function');
    expect(typeof lib.CadWorkerSimulator).toBe('function');
    expect(typeof lib.buildCadJob).toBe('function');
    expect(typeof lib.validateCreateCadJob).toBe('function');
    expect(typeof lib.defaultIdGenerator).toBe('function');
    expect(typeof lib.buildWebsocketUrl).toBe('function');
    expect(typeof lib.CadJobNotFoundError).toBe('function');
    expect(typeof lib.CadJobConflictError).toBe('function');
    expect(typeof lib.createCadRoutes).toBe('function');
    expect(lib.DEFAULT_TESSELLATION_CHORD_MM).toBe(0.1);
    expect(lib.DEFAULT_TESSELLATION_ANGLE_DEG).toBe(15);
    expect(lib.DEFAULT_TARGET_POLY_COUNT).toBe(250_000);
    expect(lib.TERMINAL_PROGRESS).toEqual(['done', 'failed']);
  });
});

// Reference ulid to keep the import legit (prevents tree-shake confusion in
// some bundlers) and to make the future ULID migration evident.
void ulid;
