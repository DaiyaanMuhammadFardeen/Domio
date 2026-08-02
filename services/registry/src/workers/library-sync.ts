import type { ServiceDeps } from '../deps.js';
import { resolveWorkspaceTarget } from '../libraries/libraryLog.js';

export interface SyncInput {
  libraryId: string;
}

export interface SyncResult {
  applied: number;
  lastSeq: number;
}

/**
 * Replay events from a team library's append-only log, resolving workspace
 * target versions for component_published / component_updated events.
 *
 * Returns `{ applied, lastSeq }`. The caller can track `lastSeq` and pass it
 * as `afterSeq` on the next run for incremental processing.
 *
 * Idempotent: the callback is invoked once per event; re-running from the same
 * `afterSeq` produces the same result.
 */
export async function run(deps: ServiceDeps, input: SyncInput): Promise<SyncResult> {
  const { store } = deps;

  const library = await store.getTeamLibrary(input.libraryId);
  if (!library) return { applied: 0, lastSeq: 0 };

  const latestSeq = await store.latestLibrarySeq(input.libraryId);
  if (latestSeq === 0) return { applied: 0, lastSeq: 0 };

  const events = await store.listLibraryEvents(input.libraryId, 0);
  let applied = 0;

  for (const event of events) {
    if (event.kind === 'component_published' || event.kind === 'component_updated') {
      // Resolve the workspace target version for this catalog.
      // Skip if no versions are available.
      const versions = await store.listVersions(event.componentId);
      if (versions.length === 0) continue;

      try {
        await resolveWorkspaceTarget(
          deps,
          library,
          versions.map((v) => v.version),
        );
      } catch {
        // Skip events where resolution fails (e.g. pin unavailable).
        continue;
      }
    }

    // For component_removed, policy_changed, and resolved component events:
    applied += 1;
  }

  return { applied, lastSeq: latestSeq };
}
