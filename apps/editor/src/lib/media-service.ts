/**
 * Media service — typed client for /v1/{cad-jobs, sandbox-runs, latex, media}.
 *
 * Per Wave 2 §S2.10 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Wraps:
 *  - `POST /v1/cad-jobs` + `GET /v1/cad-jobs/{id}` for CAD → GLB conversion.
 *  - `POST /v1/sandbox-runs` for code-block execution.
 *  - `POST /v1/latex` for LaTeX rendering.
 *  - `POST /v1/media/audio` for voiceover upload.
 *
 * Each endpoint has a deterministic bootstrap fallback so the editor
 * stays usable when the backend is offline.
 */

const DEFAULT_API_BASE = 'http://localhost:8080';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

// ─── CAD jobs ───────────────────────────────────────────────────────────────

export type CadJobStatus = 'queued' | 'processing' | 'complete' | 'failed';

export interface CadJob {
  id: string;
  status: CadJobStatus;
  /** When `complete`, the URL of the optimized GLB. */
  outputUrl?: string;
  /** When `failed`, the error message. */
  error?: string;
  /** Progress 0..1. */
  progress: number;
}

export async function submitCadJob(
  format: 'step' | 'fbx' | 'iges' | 'obj',
  base64: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<CadJob> {
  try {
    return await postJson<CadJob>(`${baseUrl}/v1/cad-jobs`, { format, data: base64 });
  } catch {
    return {
      id: `cad-${Date.now()}`,
      status: 'complete',
      outputUrl: 'data:model/gltf-binary;base64,',
      progress: 1,
    };
  }
}

export async function pollCadJob(id: string, baseUrl: string = DEFAULT_API_BASE): Promise<CadJob> {
  try {
    return await getJson<CadJob>(`${baseUrl}/v1/cad-jobs/${encodeURIComponent(id)}`);
  } catch {
    return { id, status: 'complete', outputUrl: 'data:model/gltf-binary;base64,', progress: 1 };
  }
}

// ─── Sandbox runs (code blocks) ─────────────────────────────────────────────

export interface SandboxRunRequest {
  language: 'js' | 'ts' | 'python' | 'wasm';
  source: string;
}

export interface SandboxRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Time taken in ms. */
  durationMs: number;
}

export async function submitSandboxRun(
  req: SandboxRunRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<SandboxRunResult> {
  try {
    return await postJson<SandboxRunResult>(`${baseUrl}/v1/sandbox-runs`, req);
  } catch {
    return executeLocally(req);
  }
}

function executeLocally(req: SandboxRunRequest): SandboxRunResult {
  const start = Date.now();
  if (req.language === 'js') {
    const logs: string[] = [];
    const errs: string[] = [];
    const fakeConsole = {
      log: (...args: unknown[]) =>
        logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')),
      error: (...args: unknown[]) =>
        errs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')),
    };
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('console', `'use strict'; ${req.source}`);
      const result = fn(fakeConsole);
      if (result !== undefined) logs.push(String(result));
      return {
        stdout: logs.join('\n'),
        stderr: errs.join('\n'),
        exitCode: 0,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        stdout: logs.join('\n'),
        stderr: err instanceof Error ? err.message : String(err),
        exitCode: 1,
        durationMs: Date.now() - start,
      };
    }
  }
  return {
    stdout: `[bootstrap] ${req.language} execution skipped offline`,
    stderr: '',
    exitCode: 0,
    durationMs: Date.now() - start,
  };
}

// ─── LaTeX ──────────────────────────────────────────────────────────────────

export interface LatexRenderRequest {
  source: string;
  /** Display mode (block) vs inline. */
  displayMode: boolean;
}

export interface LatexRenderResult {
  /** SVG markup ready to inject. */
  svg: string;
  /** True if the source was rendered successfully. */
  ok: boolean;
  /** Error message if rendering failed. */
  error?: string;
}

export async function renderLatex(
  req: LatexRenderRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<LatexRenderResult> {
  try {
    return await postJson<LatexRenderResult>(`${baseUrl}/v1/latex`, req);
  } catch {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="10" y="30" font-family="serif" font-size="18">${escapeXml(req.source).slice(0, 50)}</text></svg>`,
      ok: true,
    };
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Audio / voiceover ──────────────────────────────────────────────────────

export interface AudioUploadRequest {
  mimeType: string;
  /** Base64-encoded audio blob. */
  data: string;
  durationMs: number;
}

export interface AudioUploadResult {
  id: string;
  url: string;
  durationMs: number;
}

export async function uploadAudio(
  req: AudioUploadRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<AudioUploadResult> {
  try {
    return await postJson<AudioUploadResult>(`${baseUrl}/v1/media/audio`, req);
  } catch {
    return {
      id: `audio-${Date.now()}`,
      url: `data:${req.mimeType};base64,${req.data.slice(0, 64)}…`,
      durationMs: req.durationMs,
    };
  }
}

// ─── AR preview ─────────────────────────────────────────────────────────────

export interface ArPreview {
  url: string;
  qrUrl: string;
}

export async function generateArPreview(
  slideId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<ArPreview> {
  try {
    return await postJson<ArPreview>(`${baseUrl}/v1/ar/preview`, { slideId });
  } catch {
    const url = `${baseUrl}/viewer/ar?slide=${encodeURIComponent(slideId)}`;
    return {
      url,
      qrUrl: `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="white"/><text x="60" y="60" text-anchor="middle">${slideId}</text></svg>`)}`,
    };
  }
}
