/**
 * Lightweight fetch client for the collaboration endpoints.
 *
 * Uses a small in-memory cache keyed by URL.  No auth flow — the control
 * plane sets identity via the x-actor-id header.  The actor ID is read
 * from NEXT_PUBLIC_ACTOR_ID at module scope.
 */

import type {
  Comment,
  ApprovalRequest,
  ApprovalDecision,
  Assignment,
  AssignmentStatus,
} from '../collab/types.js';

// ----- Configuration -----

const API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL as string | undefined)
    : undefined) ?? 'http://localhost:8080';

const ACTOR_ID: string =
  (typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_ACTOR_ID as string | undefined)
    : undefined) ?? 'actor-local';

// ----- Cache -----

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 5_000;

function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < CACHE_TTL_MS) {
    return Promise.resolve(hit.data as T);
  }
  return fetcher().then((data) => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

function invalidate(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

// ----- Fetch helpers -----

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-actor-id': ACTOR_ID,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

// ----- Comments (#179) -----

export async function listComments(deckId: string): Promise<Comment[]> {
  return cached(`comments:${deckId}`, () => apiFetch<Comment[]>(`/v1/decks/${deckId}/comments`));
}

export async function resolveComment(commentId: string): Promise<Comment> {
  invalidate('comments:');
  return apiFetch<Comment>(`/v1/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'resolved' }),
  });
}

export async function addReaction(commentId: string, emoji: string): Promise<Comment> {
  invalidate('comments:');
  return apiFetch<Comment>(`/v1/comments/${commentId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

// ----- Approvals (#180) -----

export async function listApprovalRequests(deckId: string): Promise<ApprovalRequest[]> {
  return cached(`approvals:${deckId}`, () =>
    apiFetch<ApprovalRequest[]>(`/v1/decks/${deckId}/approval-requests`),
  );
}

export async function postDecision(
  requestId: string,
  decision: ApprovalDecision,
): Promise<ApprovalRequest> {
  invalidate('approvals:');
  return apiFetch<ApprovalRequest>(`/v1/approval-requests/${requestId}/decisions`, {
    method: 'POST',
    body: JSON.stringify(decision),
  });
}

// ----- Assignments (#181) -----

export async function listAssignments(deckId: string): Promise<Assignment[]> {
  return cached(`assignments:${deckId}`, () =>
    apiFetch<Assignment[]>(`/v1/decks/${deckId}/assignments`),
  );
}

export async function patchAssignment(
  assignmentId: string,
  patch: { status?: AssignmentStatus; blocked_reason?: string },
): Promise<Assignment> {
  invalidate('assignments:');
  return apiFetch<Assignment>(`/v1/assignments/${assignmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}
