/**
 * apps/presenter — AnnotationClient.
 *
 * Talks to the @domio/annotation-engine HTTP surface for live presenter
 * sessions. Mutations carry the current session etag (If-Match).
 *
 * The canvas itself is local (HTMLCanvasElement); the client only
 * persists the strokes — the runtime draws them on the overlay.
 */

import type {
  AnnotationKind,
  AnnotationGeometry,
} from '@domio/annotation-engine';

export interface AnnotationLayerDto {
  id: string;
  session_id: string;
  workspace_id: string;
  slide_id: string;
  layer_id: string | null;
  kind: AnnotationKind;
  geometry: AnnotationGeometry;
  style: Record<string, unknown>;
  color: string | null;
  stroke_width: number | null;
  ephemeral: boolean;
  saved_overlay_id: string | null;
  drawn_by: string;
  drawn_by_display_name: string | null;
  created_at_ms: number;
}

export interface AnnotationCommitBody {
  slide_id: string;
  kind: AnnotationKind;
  geometry: AnnotationGeometry;
  layer_id?: string;
  style?: Record<string, unknown>;
  color?: string;
  stroke_width?: number;
  ephemeral?: boolean;
  drawn_by: string;
  drawn_by_display_name?: string;
  expected_version?: number;
}

export class AnnotationClientError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'AnnotationClientError';
  }
}

export interface AnnotationClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export class AnnotationClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private cachedEtag: string | null = null;

  constructor(opts: AnnotationClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? '';
    this.fetcher = opts.fetcher ?? fetch;
  }

  etag(): string | null { return this.cachedEtag; }
  setEtag(etag: string | null): void { this.cachedEtag = etag; }

  async list(sessionId: string, ephemeral = true): Promise<AnnotationLayerDto[]> {
    const res = await this.fetcher(`${this.baseUrl}/api/v1/annotation/${sessionId}/list?ephemeral=${ephemeral}`, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!res.ok) {
      throw new AnnotationClientError(res.status, `list annotations: ${res.status}`, await safeBody(res));
    }
    const body = (await res.json()) as { items: AnnotationLayerDto[] };
    return body.items;
  }

  async commit(sessionId: string, body: AnnotationCommitBody): Promise<AnnotationLayerDto> {
    const idempotencyKey = ensureIdempotencyKey(sessionId, body.slide_id, body.kind);
    const res = await this.fetcher(`${this.baseUrl}/api/v1/annotation/${sessionId}/commit`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(this.cachedEtag ? { 'if-match': this.cachedEtag } : {}),
        'idempotency-key': idempotencyKey,
      },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new AnnotationClientError(res.status, `commit annotation: ${res.status}`, await safeBody(res));
    }
    const etag = res.headers.get('etag');
    if (etag) this.cachedEtag = etag;
    const result = (await res.json()) as { annotation: AnnotationLayerDto };
    return result.annotation;
  }

  async rollback(sessionId: string, annotationId: string): Promise<void> {
    const idempotencyKey = ensureIdempotencyKey(sessionId, 'rollback', annotationId);
    const res = await this.fetcher(`${this.baseUrl}/api/v1/annotation/${sessionId}/rollback`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(this.cachedEtag ? { 'if-match': this.cachedEtag } : {}),
        'idempotency-key': idempotencyKey,
      },
      credentials: 'same-origin',
      body: JSON.stringify({ annotation_id: annotationId }),
    });
    if (!res.ok) {
      throw new AnnotationClientError(res.status, `rollback annotation: ${res.status}`, await safeBody(res));
    }
    const etag = res.headers.get('etag');
    if (etag) this.cachedEtag = etag;
  }

  async promote(sessionId: string, annotationId: string): Promise<AnnotationLayerDto> {
    const idempotencyKey = ensureIdempotencyKey(sessionId, 'promote', annotationId);
    const res = await this.fetcher(`${this.baseUrl}/api/v1/annotation/${sessionId}/promote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(this.cachedEtag ? { 'if-match': this.cachedEtag } : {}),
        'idempotency-key': idempotencyKey,
      },
      credentials: 'same-origin',
      body: JSON.stringify({ annotation_id: annotationId }),
    });
    if (!res.ok) {
      throw new AnnotationClientError(res.status, `promote annotation: ${res.status}`, await safeBody(res));
    }
    const etag = res.headers.get('etag');
    if (etag) this.cachedEtag = etag;
    const promoted = (await res.json()) as AnnotationLayerDto;
    return promoted;
  }
}

async function safeBody(res: Response): Promise<unknown> {
  try { return await res.json(); } catch { return null; }
}

const NS = 'domio.presenter.annotation.idem';
function ensureIdempotencyKey(sessionId: string, op: string, suffix?: string): string {
  if (typeof window === 'undefined') return `ssr-${op}-${sessionId}-${suffix ?? ''}`;
  const key = `${sessionId}::${op}::${suffix ?? ''}`;
  const existing = window.sessionStorage.getItem(`${NS}.${key}`);
  if (existing) return existing;
  const fresh = `${op}-${cryptoRandomHex(8)}`;
  window.sessionStorage.setItem(`${NS}.${key}`, fresh);
  return fresh;
}

function cryptoRandomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  let s = '';
  for (let i = 0; i < bytes; i++) s += (arr[i] as number).toString(16).padStart(2, '0');
  return s;
}