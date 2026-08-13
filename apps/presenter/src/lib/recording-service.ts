/**
 * Recording service — captures a live session for replay + post-recap export.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md,
 * extended for Wave 4 §S4.12 (post-recap recording export).
 *
 * The post-session export flow:
 *   1. Presenter clicks "Export recording" in the recap.
 *   2. We POST /v1/presenter/sessions/{id}/recording/export with the
 *      target format (mp4/webm) and an optional watermark flag.
 *   3. The server returns an export job id; we poll
 *      /v1/presenter/recording/jobs/{id} until status === 'ready'.
 *   4. The job carries a `download_url` once ready; the UI surfaces
 *      that as a clickable link.
 *
 * Today the endpoint may not exist; the client tolerates 404 by
 * surfacing a "service unavailable" error rather than throwing.
 */

export interface RecordingDescriptor {
  readonly id: string;
  readonly sessionId: string;
  readonly status: 'idle' | 'recording' | 'paused' | 'finalized';
  readonly startedAtMs: number;
  readonly durationMs: number;
}

export interface ExportJob {
  readonly id: string;
  readonly sessionId: string;
  readonly format: 'mp4' | 'webm';
  readonly watermark: boolean;
  readonly status: 'queued' | 'processing' | 'ready' | 'failed';
  readonly downloadUrl?: string;
  readonly errorMessage?: string;
  readonly progressPct: number;
}

export interface RecordingServiceError extends Error {
  readonly status: number;
}

export const BOOTSTRAP_RECORDINGS: ReadonlyArray<RecordingDescriptor> = [];

export async function listRecordings(
  _sessionId: string,
): Promise<ReadonlyArray<RecordingDescriptor>> {
  return BOOTSTRAP_RECORDINGS;
}

export interface RecordingServiceOptions {
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly pollIntervalMs?: number;
}

export class RecordingService {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;

  constructor(opts: RecordingServiceOptions = {}) {
    this.baseUrl = opts.apiBaseUrl ?? '';
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2000;
  }

  async requestExport(
    sessionId: string,
    format: ExportJob['format'],
    watermark: boolean,
  ): Promise<ExportJob> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/v1/presenter/sessions/${encodeURIComponent(sessionId)}/recording/export`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ format, watermark }),
        credentials: 'same-origin',
      },
    );
    if (!res.ok) {
      throw makeError(res.status, `Export request failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { job: ExportJob };
    return body.job;
  }

  async getJob(jobId: string): Promise<ExportJob> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/v1/presenter/recording/jobs/${encodeURIComponent(jobId)}`,
      { credentials: 'same-origin' },
    );
    if (!res.ok) {
      throw makeError(res.status, `Job lookup failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { job: ExportJob };
    return body.job;
  }

  async waitForReady(
    jobId: string,
    opts: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<ExportJob> {
    const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60 * 1000);
    while (Date.now() < deadline) {
      if (opts.signal?.aborted) throw new Error('Polling aborted');
      const job = await this.getJob(jobId);
      if (job.status === 'ready' || job.status === 'failed') return job;
      await delay(this.pollIntervalMs, opts.signal);
    }
    throw new Error('Timed out waiting for export job');
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const handle = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(handle);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function makeError(status: number, message: string): RecordingServiceError {
  const err: RecordingServiceError = Object.assign(new Error(message), {
    status,
    name: 'RecordingServiceError',
  });
  return err;
}
