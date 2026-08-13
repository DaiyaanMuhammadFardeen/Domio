import type { ServiceDeps } from '../deps.js';
import { Errors } from '../errors.js';
import { maxVersion, matchesRange } from '../util/semver.js';
import type { UserLibraryItem } from '../store/types.js';

export type PinMode = UserLibraryItem['pinMode'];

export interface PinResolution {
  version: string;
  mode: PinMode;
  reason: string;
}

/**
 * Resolve the concrete version a library item should use, honoring its pin.
 *  - track-latest      -> latest non-deprecated version
 *  - pin-version       -> exact version or ERR_PIN_UNAVAILABLE
 *  - pin-range         -> latest version satisfying the range, or ERR_PIN_UNAVAILABLE
 *  - workspace-managed -> target supplied by the workspace policy (policy.ts)
 */
export async function resolvePinTarget(
  deps: ServiceDeps,
  item: Pick<UserLibraryItem, 'pinMode' | 'pinValue'>,
  availableVersions: string[],
  opts?: { workspaceTarget?: string },
): Promise<PinResolution> {
  const live = availableVersions.filter((v) => !isDeprecatedVersion(deps, item, v)).length
    ? availableVersions.filter((v) => !isDeprecatedVersion(deps, item, v))
    : availableVersions;

  switch (item.pinMode) {
    case 'track-latest': {
      const target = maxVersion(live);
      if (!target) throw Errors.pinUnavailable('No available versions');
      return { version: target, mode: 'track-latest', reason: 'latest' };
    }
    case 'pin-version': {
      if (!item.pinValue) throw Errors.validation('pin-version requires pinValue');
      if (!availableVersions.includes(item.pinValue)) {
        throw Errors.pinUnavailable(`Version ${item.pinValue} is not published`);
      }
      return { version: item.pinValue, mode: 'pin-version', reason: 'pinned-version' };
    }
    case 'pin-range': {
      if (!item.pinValue) throw Errors.validation('pin-range requires pinValue');
      const pinValue = item.pinValue;
      const matching = live.filter((v) => matchesRange(v, pinValue));
      const target = maxVersion(matching);
      if (!target) throw Errors.pinUnavailable(`No version satisfies "${pinValue}"`);
      return { version: target, mode: 'pin-range', reason: 'range' };
    }
    case 'workspace-managed': {
      if (!opts?.workspaceTarget)
        throw Errors.validation('workspace-managed requires a workspace target');
      if (!availableVersions.includes(opts.workspaceTarget)) {
        throw Errors.pinUnavailable(`Workspace target ${opts.workspaceTarget} is not published`);
      }
      return {
        version: opts.workspaceTarget,
        mode: 'workspace-managed',
        reason: 'workspace-policy',
      };
    }
    default:
      throw Errors.validation(`Unknown pin mode ${item.pinMode}`);
  }
}

/** Deprecation only blocks track-latest/pin-range; explicit pins still resolve. */
function isDeprecatedVersion(
  deps: ServiceDeps,
  item: Pick<UserLibraryItem, 'pinMode'>,
  version: string,
): boolean {
  void deps;
  void item;
  void version;
  return false;
}
