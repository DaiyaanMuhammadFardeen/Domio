/**
 * @domio/cad-jobs — Phase 11 CAD conversion job service.
 *
 * Public surface:
 *   - {@link createApp} — Hono app factory with injectable deps.
 *   - {@link InMemoryCadJobRepository} — dev/test fallback repo.
 *   - {@link CadWorkerSimulator} — in-process worker that drives the
 *     parsing → meshing → optimizing → done state machine for tests.
 *   - {@link buildCadJob} — pure factory for creating a CadJob from a
 *     validated request.
 *   - {@link validateCreateCadJob} — Ajv-backed request validation.
 *
 * Production deployments swap the in-memory repo for a Postgres-backed
 * implementation and the worker simulator for the Go-based
 * `workers/cad-pipeline/` pool.
 */

export { createApp, type AppDeps } from './app.js';
export {
  InMemoryCadJobRepository,
  defaultIdGenerator,
  buildCadJob,
  buildWebsocketUrl,
  CadJobNotFoundError,
  CadJobConflictError,
  type CadJobRepository,
  type CreateCadJobDeps,
} from './repo.js';
export { CadWorkerSimulator, type WorkerSimulatorConfig, type ProgressListener } from './worker.js';
export { createCadRoutes, type CadRouteDeps } from './routes.js';
export { validateCreateCadJob, type ValidationResult } from './schemas.js';
export * from './types.js';
