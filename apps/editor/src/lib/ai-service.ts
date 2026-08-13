/**
 * AI service — typed client wrapping the AI Copilot endpoints.
 *
 * Per Wave 6 §S6.1, S6.2, S6.6 of
 * docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Endpoints wrapped:
 *   - POST /v1/ai/jobs       — start a planner (outline) job
 *   - GET  /v1/ai/jobs       — list recent jobs (for history)
 *   - GET  /v1/ai/jobs/{id}  — poll a single job's status + phase
 *   - POST /v1/ai/ingest            — ingest an uploaded file (PDF/doc/transcript)
 *   - POST /v1/ai/data-story        — start a data-story generation job
 *   - POST /v1/ai/voice-to-deck     — start a voice-to-deck job
 *   - POST /v1/ai/outline/approve   — approve a draft outline (S6.2)
 *   - POST /v1/ai/cite/{id}/open    — open a citation paragraph (S6.2)
 *   - POST /v1/ai/notes             — generate speaker notes for a slide (S6.6)
 *
 * The shape of each response mirrors the gateway's REST contract
 * (see contracts/openapi/v1/ai.yaml). All endpoints are typed; there
 * are no raw `fetch` calls anywhere in the UI.
 */

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type JobPhase = 'planning' | 'outlining' | 'designing' | 'citing';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface JobRecord {
  readonly id: string;
  readonly intent: string;
  readonly status: JobStatus;
  readonly phase: JobPhase;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  /** Optional outline id once planning/outlining completes. */
  readonly outlineId?: string;
  /** Optional citation ids referenced by this job. */
  readonly citationIds?: ReadonlyArray<string>;
}

export interface AiCitation {
  readonly id: string;
  readonly sourceLabel: string;
  readonly url: string;
  readonly snippet?: string;
}

export interface OutlineApprovalSlide {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly citationIds: ReadonlyArray<string>;
}

export interface OutlineApprovalPayload {
  readonly outlineId: string;
  readonly slides: ReadonlyArray<OutlineApprovalSlide>;
}

export type NotesStyle = 'bullets' | 'paragraph' | 'story';

export interface NotesRequest {
  readonly slideId: string;
  readonly style: NotesStyle;
  /** Optional feedback from the user (regeneration). */
  readonly feedback?: string;
  /** Prior notes for regeneration continuity. */
  readonly previousNotes?: string;
}

export interface NotesResponse {
  readonly slideId: string;
  readonly style: NotesStyle;
  readonly notes: string;
  readonly citationIds: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export interface AiFetchOptions {
  readonly method: 'GET' | 'POST';
  readonly body?: unknown;
  readonly baseUrl?: string;
  readonly signal?: AbortSignal;
}

async function aiFetch<TResponse>(path: string, opts: AiFetchOptions): Promise<TResponse> {
  const { method, body, baseUrl = DEFAULT_API_BASE, signal } = opts;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  if (signal !== undefined) {
    init.signal = signal;
  }
  const res = await fetch(`${baseUrl}${path}`, init);
  if (!res.ok) {
    throw new Error(`AI API ${res.status} ${res.statusText} (${method} ${path})`);
  }
  return (await res.json()) as TResponse;
}

// ---------------------------------------------------------------------------
// Planner / jobs (S6.1)
// ---------------------------------------------------------------------------

export interface CreateJobRequest {
  readonly prompt: string;
  /** Optional pre-attached source (file id returned by ingest). */
  readonly fileId?: string;
  /** Optional pre-attached voice transcript. */
  readonly voiceTranscript?: string;
  /** Optional pre-attached data story hint. */
  readonly dataStoryHint?: string;
}

export async function createPlannerJob(
  req: CreateJobRequest,
  baseUrl: string = DEFAULT_API_BASE,
  signal?: AbortSignal,
): Promise<JobRecord> {
  const opts: AiFetchOptions =
    signal !== undefined
      ? { method: 'POST', body: req, baseUrl, signal }
      : { method: 'POST', body: req, baseUrl };
  return aiFetch<JobRecord>('/v1/ai/jobs', opts);
}

export async function getJob(
  id: string,
  baseUrl: string = DEFAULT_API_BASE,
  signal?: AbortSignal,
): Promise<JobRecord> {
  const opts: AiFetchOptions =
    signal !== undefined ? { method: 'GET', baseUrl, signal } : { method: 'GET', baseUrl };
  return aiFetch<JobRecord>(`/v1/ai/jobs/${encodeURIComponent(id)}`, opts);
}

export async function listJobs(
  limit: number = 20,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<ReadonlyArray<JobRecord>> {
  return aiFetch<ReadonlyArray<JobRecord>>(
    `/v1/ai/jobs?limit=${encodeURIComponent(String(limit))}`,
    { method: 'GET', baseUrl },
  );
}

// ---------------------------------------------------------------------------
// Ingest / data-story / voice-to-deck (S6.1)
// ---------------------------------------------------------------------------

export type IngestKind = 'pdf' | 'doc' | 'transcript' | 'note';

export interface IngestRequest {
  readonly kind: IngestKind;
  readonly filename: string;
  /** Base64-encoded payload. */
  readonly data: string;
}

export interface IngestResponse {
  readonly fileId: string;
  readonly kind: IngestKind;
  readonly extractedTextPreview: string;
  readonly citationIds: ReadonlyArray<string>;
}

export async function ingestFile(
  req: IngestRequest,
  baseUrl: string = DEFAULT_API_BASE,
  signal?: AbortSignal,
): Promise<IngestResponse> {
  const opts: AiFetchOptions =
    signal !== undefined
      ? { method: 'POST', body: req, baseUrl, signal }
      : { method: 'POST', body: req, baseUrl };
  return aiFetch<IngestResponse>('/v1/ai/ingest', opts);
}

export interface DataStoryRequest {
  readonly prompt: string;
  readonly sourceRef: string;
}

export interface DataStoryJobRef {
  readonly jobId: string;
}

export async function startDataStory(
  req: DataStoryRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<DataStoryJobRef> {
  return aiFetch<DataStoryJobRef>('/v1/ai/data-story', {
    method: 'POST',
    body: req,
    baseUrl,
  });
}

export interface VoiceToDeckRequest {
  readonly audioFileId: string;
  readonly hint?: string;
}

export interface VoiceToDeckJobRef {
  readonly jobId: string;
}

export async function startVoiceToDeck(
  req: VoiceToDeckRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<VoiceToDeckJobRef> {
  return aiFetch<VoiceToDeckJobRef>('/v1/ai/voice-to-deck', {
    method: 'POST',
    body: req,
    baseUrl,
  });
}

// ---------------------------------------------------------------------------
// Outline approval (S6.2)
// ---------------------------------------------------------------------------

export interface ApproveOutlineRequest {
  readonly outlineId: string;
  readonly slides: ReadonlyArray<OutlineApprovalSlide>;
}

export interface ApproveOutlineResponse {
  readonly outlineId: string;
  readonly approvedAtMs: number;
}

export async function approveOutline(
  req: ApproveOutlineRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<ApproveOutlineResponse> {
  return aiFetch<ApproveOutlineResponse>('/v1/ai/outline/approve', {
    method: 'POST',
    body: req,
    baseUrl,
  });
}

export async function openCitation(
  citationId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<AiCitation> {
  return aiFetch<AiCitation>(`/v1/ai/cite/${encodeURIComponent(citationId)}/open`, {
    method: 'POST',
    baseUrl,
  });
}

// ---------------------------------------------------------------------------
// Speaker notes (S6.6)
// ---------------------------------------------------------------------------

export async function generateNotes(
  req: NotesRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<NotesResponse> {
  return aiFetch<NotesResponse>('/v1/ai/notes', {
    method: 'POST',
    body: req,
    baseUrl,
  });
}
