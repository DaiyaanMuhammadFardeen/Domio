/**
 * team-library-service — typed client for the editor's Library +
 * marketplace surface.
 *
 * Per Wave 2 §S2.6 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Wraps `/v1/library/{publish, items, versions}` and surfaces a
 * bootstrap mode that reads from `localStorage` (matching the existing
 * `lib/library.ts`) so the editor keeps working when the backend is
 * offline. Once the backend ships, this becomes a thin SDK wrapper.
 */

import {
  getLibraryItems,
  removeFromLibrary as localRemove,
  updateLibraryItem as localUpdate,
  type LibraryItem,
} from './library';

// ─── Shared types ───────────────────────────────────────────────────────────

export type LibraryScope = 'personal' | 'team';

export interface RemoteLibraryEntry {
  readonly catalogId: string;
  readonly name: string;
  readonly version: string;
  readonly latestVersion?: string;
  readonly scope: LibraryScope;
  readonly brandLocked: boolean;
  readonly teamId?: string;
  readonly description?: string;
  readonly posterRef?: string;
  readonly publishedAtMs: number;
}

export interface PublishRequest {
  readonly catalogId: string;
  readonly name: string;
  readonly version: string;
  readonly scope: LibraryScope;
  readonly teamId?: string | undefined;
  readonly brandLocked?: boolean | undefined;
  readonly description?: string | undefined;
}

export interface PublishResponse {
  readonly catalogId: string;
  readonly version: string;
  readonly publishedAtMs: number;
}

// ─── HTTP plumbing ──────────────────────────────────────────────────────────

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

// ─── Bootstrap → localStorage adapter ───────────────────────────────────────

/**
 * Map a local `LibraryItem` into the richer `RemoteLibraryEntry` shape
 * the UI consumes. Brand lock is read from a parallel
 * `domio.brand-lock` key (any catalog listed there is brand-locked).
 */
function fromLocal(entry: LibraryItem): RemoteLibraryEntry {
  let brandLocked = false;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('domio.brand-lock');
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        brandLocked = Array.isArray(arr) && arr.includes(entry.catalogId);
      }
    } catch {
      brandLocked = false;
    }
  }
  return {
    catalogId: entry.catalogId,
    name: entry.name,
    version: entry.version,
    scope: 'personal',
    brandLocked,
    publishedAtMs: entry.addedAt,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * List everything the editor's library panel renders (personal +
 * team). When the backend is unreachable, falls back to localStorage
 * entries mapped through `fromLocal`.
 */
export async function listLibraryEntries(
  scope: LibraryScope,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<readonly RemoteLibraryEntry[]> {
  try {
    const remote = await getJson<readonly RemoteLibraryEntry[]>(
      `${baseUrl}/v1/library/items?scope=${scope}`,
    );
    if (Array.isArray(remote)) return remote;
  } catch {
    // fall through to bootstrap
  }
  if (scope === 'personal') {
    return getLibraryItems().map(fromLocal);
  }
  // No team lib in bootstrap.
  return [];
}

/**
 * Get a single entry by id. Returns `null` if not found.
 */
export async function fetchLibraryEntry(
  catalogId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<RemoteLibraryEntry | null> {
  try {
    const remote = await getJson<RemoteLibraryEntry>(
      `${baseUrl}/v1/library/items/${encodeURIComponent(catalogId)}`,
    );
    if (remote && remote.catalogId === catalogId) return remote;
  } catch {
    // ignore
  }
  const local = getLibraryItems().find((i) => i.catalogId === catalogId);
  return local ? fromLocal(local) : null;
}

/**
 * Return a list of catalog ids with newer versions available than the
 * locally-pinned version. Drives the "Update" CTA in the library
 * panel.
 */
export async function listUpdateCandidates(
  baseUrl: string = DEFAULT_API_BASE,
): Promise<ReadonlyMap<string, string>> {
  try {
    const remote = await getJson<Array<{ catalogId: string; latest: string }>>(
      `${baseUrl}/v1/library/updates`,
    );
    if (Array.isArray(remote)) {
      const out = new Map<string, string>();
      for (const u of remote) out.set(u.catalogId, u.latest);
      return out;
    }
  } catch {
    // ignore
  }
  return new Map();
}

/**
 * POST /v1/library/publish — promote a component to the library.
 * When the backend is unreachable, falls back to `addToLibrary` so
 * designers can keep working offline.
 */
export async function publishToLibrary(
  req: PublishRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<PublishResponse> {
  try {
    return await postJson<PublishResponse>(`${baseUrl}/v1/library/publish`, req);
  } catch {
    // Bootstrap fallback — write to localStorage so the panel reflects
    // the publish in this session + next reload.
    if (typeof localStorage !== 'undefined') {
      const items = getLibraryItems();
      const existing = items.find((i) => i.catalogId === req.catalogId);
      if (existing) {
        localUpdate(req.catalogId, { version: req.version });
      } else {
        const raw = localStorage.getItem('domio.my-library') ?? '[]';
        const arr = JSON.parse(raw) as LibraryItem[];
        arr.push({
          catalogId: req.catalogId,
          name: req.name,
          version: req.version,
          pinMode: 'track',
          pinValue: '',
          addedAt: Date.now(),
        });
        localStorage.setItem('domio.my-library', JSON.stringify(arr));
      }
      if (req.brandLocked) {
        const raw = localStorage.getItem('domio.brand-lock') ?? '[]';
        const arr = JSON.parse(raw) as string[];
        if (!arr.includes(req.catalogId)) arr.push(req.catalogId);
        localStorage.setItem('domio.brand-lock', JSON.stringify(arr));
      }
    }
    return {
      catalogId: req.catalogId,
      version: req.version,
      publishedAtMs: Date.now(),
    };
  }
}

/**
 * Apply a version bump in the local cache + remote when reachable.
 */
export async function updateLibraryVersion(
  catalogId: string,
  version: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<void> {
  try {
    await postJson<{ ok: true }>(
      `${baseUrl}/v1/library/items/${encodeURIComponent(catalogId)}/update`,
      { version },
    );
  } catch {
    // ignore
  }
  localUpdate(catalogId, { version });
}

/**
 * Remove an entry from the library — locally always, remotely when
 * reachable.
 */
export async function removeFromLibraryService(
  catalogId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<void> {
  try {
    await postJson<{ ok: true }>(
      `${baseUrl}/v1/library/items/${encodeURIComponent(catalogId)}/remove`,
      {},
    );
  } catch {
    // ignore
  }
  localRemove(catalogId);
}

/**
 * Whether the given catalogId is brand-locked. Brand-locked components
 * refuse to be edited/overridden. When in doubt, returns `false`.
 */
export async function isBrandLocked(catalogId: string): Promise<boolean> {
  const entry = await fetchLibraryEntry(catalogId);
  return entry?.brandLocked ?? false;
}

// Re-export so consumers don't reach into the local module.
export { getLibraryItems, localRemove, localUpdate };
export type { LibraryItem };
