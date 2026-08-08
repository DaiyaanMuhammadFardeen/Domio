'use client';

/**
 * RecapClient — fetches and submits session recap summaries.
 *
 * Phase 15 W15. GET /v1/presenter/sessions/{id}/recap returns the
 * engagement/attendance/parking-lot aggregations; POST writes a recap
 * summary (the runtime calls POST when the presenter ends the session).
 *
 * For now the client hits a thin in-memory endpoint; once the unified
 * store lands in Phase 21 the responses are populated from Postgres.
 */

export interface RecapSummary {
  session_id: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number;
  per_slide_ms: Record<string, number>;
  slides_shown: string[];
  slides_skipped: string[];
  saved_annotations: string[];
  parking_lot_open: string[];
  parking_lot_pinned: string[];
  /** Audience engagement summary (populated when P16 closes the loop). */
  audience_summary?: Record<string, unknown>;
  presenter_notes?: string;
}

export class RecapClientError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'RecapClientError';
  }
}

export class RecapClient {
  constructor(private readonly opts: { baseUrl?: string; fetchImpl?: typeof fetch } = {}) {}

  async fetch(sessionId: string): Promise<RecapSummary> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const res = await fetchImpl(`${this.opts.baseUrl ?? ''}/v1/presenter/sessions/${sessionId}/recap`, {
      method: 'GET',
      credentials: 'same-origin',
    });
    if (!res.ok) {
      throw new RecapClientError(res.status, `recap fetch failed (HTTP ${res.status})`);
    }
    return (await res.json()) as RecapSummary;
  }

  async submit(sessionId: string, summary: RecapSummary): Promise<void> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const res = await fetchImpl(`${this.opts.baseUrl ?? ''}/v1/presenter/sessions/${sessionId}/recap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(summary),
      credentials: 'same-origin',
    });
    if (!res.ok) {
      throw new RecapClientError(res.status, `recap submit failed (HTTP ${res.status})`);
    }
  }
}