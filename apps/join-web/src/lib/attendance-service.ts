/**
 * attendance-service — DSAR / GDPR delete endpoint client.
 *
 * Per Wave 5 §S5.4 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Calls `POST /v1/audience/{participant_id}/delete-data` on the
 * audience-service to honor a participant's data-deletion request.
 */

export interface DsarDeleteOptions {
  readonly participantId: string;
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
  readonly signal?: AbortSignal;
}

export class DsarDeleteError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'DsarDeleteError';
  }
}

const DEFAULT_BASE: string =
  typeof process !== 'undefined' ? (process.env['JOIN_WEB_API_BASE_URL'] ?? '') : '';

/**
 * POST to /v1/audience/{participant_id}/delete-data. Throws
 * DsarDeleteError on non-2xx so the caller can surface a meaningful
 * UI error.
 */
export async function deleteAudienceData(opts: DsarDeleteOptions): Promise<void> {
  const base = opts.baseUrl ?? DEFAULT_BASE;
  const fetchImpl = opts.fetchFn ?? fetch;
  const url = `${base}/v1/audience/${encodeURIComponent(opts.participantId)}/delete-data`;
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({}),
  };
  if (opts.signal !== undefined) init.signal = opts.signal;
  const res = await fetchImpl(url, init);
  if (!res.ok) {
    throw new DsarDeleteError(res.status, `dsar delete failed: ${res.status}`);
  }
}
