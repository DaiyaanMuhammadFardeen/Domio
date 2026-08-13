/**
 * Asset API — Hono app factory (Phase 11).
 *
 * Creates the Hono app with all routes wired, in-memory repos seeded,
 * and error handling. Exported for tests via app.request().
 */

import { Hono } from 'hono';
import {
  InMemoryModelAssetRepository,
  InMemorySceneRepository,
  InMemoryCameraKeyframeRepository,
  InMemoryShaderRepository,
  InMemoryLicenseRepository,
  InMemoryAudioAssetRepository,
  InMemoryVideoAssetRepository,
  InMemoryLottieAssetRepository,
} from './dal.js';
import type { License } from './dal.js';
import { AssetService } from './service.js';
import { modelRoutes } from './routes/models.js';
import { sceneRoutes } from './routes/scenes.js';
import { cameraKeyframeRoutes } from './routes/camera-keyframes.js';
import { shaderRoutes } from './routes/shaders.js';
import { licenseRoutes } from './routes/licenses.js';
import { audioRoutes } from './routes/audio.js';
import { videoRoutes } from './routes/video.js';
import { lottieRoutes } from './routes/lottie.js';

// ---------------------------------------------------------------------------
// Service deps
// ---------------------------------------------------------------------------

export interface AssetApiDeps {
  readonly service: AssetService;
}

// ---------------------------------------------------------------------------
// Default licenses
// ---------------------------------------------------------------------------

function createDefaultLicenses(workspaceId: string, clock: () => Date): License[] {
  const now = clock();
  return [
    {
      id: '01J0DEFAULT0000LICENSE01',
      workspaceId,
      name: 'User Upload License',
      source: 'user-upload',
      metadata: {},
      createdAt: now,
    },
    {
      id: '01J0DEFAULT0000LICENSE02',
      workspaceId,
      name: 'Unsplash License',
      source: 'unsplash',
      termsUrl: 'https://unsplash.com/license',
      metadata: {},
      createdAt: now,
    },
    {
      id: '01J0DEFAULT0000LICENSE03',
      workspaceId,
      name: 'Pexels License',
      source: 'pexels',
      termsUrl: 'https://www.pexels.com/license/',
      metadata: {},
      createdAt: now,
    },
  ];
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

export function createApp(
  deps?: Partial<{
    idGenerator: () => string;
    clock: () => Date;
    maxUploadBytes: number;
    defaultWorkspaceId: string;
  }>,
): Hono {
  const idGenerator = deps?.idGenerator;
  const clock = deps?.clock ?? (() => new Date());
  const defaultWorkspaceId = deps?.defaultWorkspaceId ?? 'default-workspace';

  const models = new InMemoryModelAssetRepository();
  const scenes = new InMemorySceneRepository();
  const cameraKeyframes = new InMemoryCameraKeyframeRepository();
  const shaders = new InMemoryShaderRepository();
  const licenses = new InMemoryLicenseRepository(
    models,
    createDefaultLicenses(defaultWorkspaceId, clock),
  );
  const audios = new InMemoryAudioAssetRepository();
  const videos = new InMemoryVideoAssetRepository();
  const lotties = new InMemoryLottieAssetRepository();

  const service = new AssetService({
    models,
    scenes,
    cameraKeyframes,
    shaders,
    licenses,
    audios,
    videos,
    lotties,
    ...(idGenerator !== undefined ? { idGenerator } : {}),
    clock,
    ...(deps?.maxUploadBytes !== undefined ? { maxUploadBytes: deps.maxUploadBytes } : {}),
  });

  const app = new Hono();

  // ---- Global error handler ----
  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = (err as { status?: number }).status ?? 500;
    return c.json({ error: message, code: 'INTERNAL_ERROR' }, status as 400 | 404 | 500);
  });

  // ---- Health ----
  app.get('/healthz', (c) => c.json({ ok: true }));

  // ---- Mount routes ----
  app.route('/', modelRoutes(service));
  app.route('/', sceneRoutes(service));
  app.route('/', cameraKeyframeRoutes(service));
  app.route('/', shaderRoutes(service));
  app.route('/', licenseRoutes(service));
  app.route('/', audioRoutes(service));
  app.route('/', videoRoutes(service));
  app.route('/', lottieRoutes(service));

  return app;
}

// ---------------------------------------------------------------------------
// Types for tests
// ---------------------------------------------------------------------------

export type { AssetService } from './service.js';
