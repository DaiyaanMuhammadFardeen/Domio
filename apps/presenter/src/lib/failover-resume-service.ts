/**
 * Failover resume service — phone-side resume API.
 *
 * Per Wave 4 §S4.8 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Separate from `failover-service.ts` (which lists failover peers).
 */

export interface FailoverServiceError extends Error {
  readonly status: number;
}

export class FailoverService {
  constructor(private readonly opts: { apiBaseUrl?: string; fetchImpl?: typeof fetch } = {}) {}

  async resume(token: string, slideId: string, slideIndex: number): Promise<void> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const res = await fetchImpl(
      `${this.opts.apiBaseUrl ?? ''}/v1/presenter/sessions/failover/${encodeURIComponent(token)}/resume`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slide_id: slideId, slide_index: slideIndex }),
        credentials: 'same-origin',
      },
    );
    if (!res.ok) {
      const err: FailoverServiceError = Object.assign(
        new Error(`HTTP ${res.status}`),
        { status: res.status, name: 'FailoverServiceError' },
      );
      throw err;
    }
  }
}