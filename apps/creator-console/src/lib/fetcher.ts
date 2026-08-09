/**
 * Dashboard REST fetcher (Phase 17 final).
 *
 * Tiny typed wrapper around `fetch` that injects the
 * `X-Workspace-Id` header (defaulting to `NEXT_PUBLIC_WORKSPACE_ID`)
 * and parses JSON. Used by /crm, /team, /live, and /benchmarks.
 *
 * The fetcher does NOT swallow errors — callers must catch and
 * either surface a fallback UI or `throw`. We never silently
 * pretend an upstream is healthy.
 */

export interface FetcherOptions {
  workspaceId?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  body?: unknown;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
}

export interface FetcherError extends Error {
  status: number;
  url: string;
}

function makeError(message: string, status: number, url: string): FetcherError {
  const err = new Error(message) as FetcherError;
  err.status = status;
  err.url = url;
  return err;
}

export async function fetcher<T>(
  base: string,
  path: string,
  opts: FetcherOptions = {},
): Promise<T> {
  const url = new URL(path, base);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(opts.headers ?? {}),
  };
  const workspaceId =
    opts.workspaceId ??
    process.env['NEXT_PUBLIC_WORKSPACE_ID'] ??
    'ws-demo';
  if (workspaceId) headers['x-workspace-id'] = workspaceId;

  const init: RequestInit = {
    method: opts.method ?? 'GET',
    headers,
    ...(opts.signal ? { signal: opts.signal } : {}),
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    cache: 'no-store',
  };

  const res = await fetch(url.toString(), init);
  if (!res.ok) {
    throw makeError(`${opts.method ?? 'GET'} ${url} → ${res.status}`, res.status, url.toString());
  }
  return (await res.json()) as T;
}