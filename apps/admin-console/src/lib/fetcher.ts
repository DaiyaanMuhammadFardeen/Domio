/**
 * Admin console REST fetcher.
 *
 * Typed wrapper around fetch that injects x-workspace-id and parses JSON.
 * Mirrors apps/dashboard/src/lib/fetcher.ts pattern.
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

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

export async function fetcher<T>(
  path: string,
  opts: FetcherOptions = {},
): Promise<T> {
  const url = new URL(path, API_BASE);
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
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
