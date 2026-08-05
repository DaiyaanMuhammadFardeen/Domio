/**
 * @domio/video-pipeline — Phase 11 video transcode pipeline service.
 *
 * Public surface:
 *  - {@link createApp} — Hono app builder.
 *  - Types and errors from `./types.js`.
 *  - Job store from `./jobs.js`.
 *  - Transcoder backends from `./transcoder.js`.
 *  - Caption/waveform extraction from `./captions.js`.
 *  - HTTP handlers from `./handlers.js`.
 */

import { Hono } from 'hono';
import type { Context as HonoContext } from 'hono';
import { InMemoryJobStore } from './jobs.js';
import { NoFfmpegBackend } from './transcoder.js';
import {
  handlers,
  type HttpRequest,
  type HttpResponse,
  type VideoPipelineContext,
} from './handlers.js';

export * from './types.js';
export * from './jobs.js';
export * from './transcoder.js';
export * from './captions.js';
export * from './handlers.js';

// ---------------------------------------------------------------------------
// Hono adapters (mirror deep-link-svc pattern)
// ---------------------------------------------------------------------------

function fromHono(c: HonoContext): HttpRequest {
  const params = c.req.param();
  const path = c.req.path;
  const method = c.req.method;
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(c.req.header())) {
    headers[k.toLowerCase()] = v as string | undefined;
  }
  let body: unknown = {};
  if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
    try {
      body = c.req.json();
    } catch {
      body = {};
    }
  }
  return {
    method,
    path,
    params: params as unknown as Record<string, string>,
    body: body as unknown,
    query: c.req.query() as Record<string, string | undefined>,
    headers,
  };
}

function toHono(res: HttpResponse): Response {
  return new Response(JSON.stringify(res.body), {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

export interface CreateAppOptions {
  readonly store?: InMemoryJobStore;
  readonly backend?: NoFfmpegBackend;
  readonly defaultWorkspaceId?: string;
  readonly clock?: () => Date;
}

/**
 * Build a Hono app that wires every handler to its route.
 * Mirrors the export-pipeline `createApp(deps)` pattern.
 */
export function createApp(opts?: CreateAppOptions): Hono {
  const app = new Hono();
  const store = opts?.store ?? new InMemoryJobStore();
  const backend = opts?.backend ?? new NoFfmpegBackend();
  const clock = opts?.clock;

  const ctx: VideoPipelineContext = {
    store,
    backend,
    ...(opts?.defaultWorkspaceId ? { defaultWorkspaceId: opts.defaultWorkspaceId } : {}),
    ...(clock ? { clock } : {}),
  };

  const wrap =
    <P, B>(fn: (req: HttpRequest<P, B>, ctx: VideoPipelineContext) => Promise<HttpResponse>) =>
    async (c: HonoContext): Promise<Response> => {
      const req = fromHono(c) as unknown as HttpRequest<P, B>;
      const res = await fn(req, ctx);
      return toHono(res);
    };

  // POST /v1/video_jobs
  app.post('/v1/video_jobs', wrap(handlers.createJob));

  // GET /v1/video_jobs (list)
  app.get('/v1/video_jobs', wrap(handlers.listJobs));

  // GET /v1/video_jobs/:id
  app.get('/v1/video_jobs/:id', wrap(handlers.getJob));

  // DELETE /v1/video_jobs/:id (cancel)
  app.delete('/v1/video_jobs/:id', wrap(handlers.cancelJob));

  return app;
}

/** Convenience for in-memory dev/test wiring. */
export function createInMemoryApp(): Hono {
  return createApp({ store: new InMemoryJobStore(), backend: new NoFfmpegBackend() });
}

export type { Hono };
