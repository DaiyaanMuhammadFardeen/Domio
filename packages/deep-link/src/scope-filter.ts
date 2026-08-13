/**
 * Scope filter — strips variables the requesting viewer is not
 * allowed to see BEFORE the payload is signed. This protects
 * `private` and `server_only` entries from being leaked into the
 * token blob (and thus into any URL, browser history, or shared
 * chat).
 *
 * Rules:
 *   - `deck_public` → always included.
 *   - `private`     → included only if the requesting viewer is
 *                      the authoring viewer (`requesting_viewer_id`
 *                      matches `authoring_viewer_id`).
 *   - `server_only` → always stripped (cannot round-trip through a
 *                      public token regardless of viewer).
 *   - session/viewer-scoped vars are also stripped when the link's
 *     `viewer_scope` is `public`, because the snapshot would
 *     leak per-viewer state into a public URL.
 */

import type { DeepLinkVarEntry, DeepLinkViewerScope } from './types.js';

export interface ScopeFilterOptions {
  /** The viewer who minted the link (typically the editor session). */
  readonly authoring_viewer_id?: string;
  /** The viewer requesting resolution (the recipient of the link). */
  readonly requesting_viewer_id?: string;
  /** Visibility scope of the link itself. */
  readonly viewer_scope: DeepLinkViewerScope;
}

/**
 * Returns a filtered, immutable copy of the snapshot. The order is
 * preserved so deterministic tests can reason about it.
 */
export function scopeFilter(
  entries: readonly DeepLinkVarEntry[],
  opts: ScopeFilterOptions,
): readonly DeepLinkVarEntry[] {
  const filtered: DeepLinkVarEntry[] = [];
  for (const entry of entries) {
    if (entry.visibility === 'server_only') continue;
    if (entry.scope === 'session' || entry.scope === 'viewer') {
      if (opts.viewer_scope === 'public') continue;
      // For tenant / private scopes, only the authoring viewer may
      // round-trip session/viewer-scoped values.
      if (opts.requesting_viewer_id !== opts.authoring_viewer_id) {
        continue;
      }
    }
    if (entry.visibility === 'private') {
      if (opts.requesting_viewer_id !== opts.authoring_viewer_id) continue;
    }
    filtered.push(entry);
  }
  return filtered;
}
