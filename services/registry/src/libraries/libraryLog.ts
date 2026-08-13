import type { ServiceDeps } from '../deps.js';
import { nowMs } from '../deps.js';
import { Errors } from '../errors.js';
import { createHmac } from 'node:crypto';
import type {
  LibraryEventKind,
  TeamLibrary,
  TeamLibraryEvent,
  UserLibraryItem,
} from '../store/types.js';
import { resolvePolicyTarget } from '../util/semver.js';

export interface AppendEventInput {
  libraryId: string;
  kind: LibraryEventKind;
  componentId: string;
  version?: string;
  payloadRef?: string;
  actorId: string;
  actorKind?: 'human' | 'agent';
}

/**
 * Append an event to a library's append-only log. The `seq` is derived from
 * the latest stored seq so replays are deterministic and idempotent.
 */
export async function appendLibraryEvent(
  deps: ServiceDeps,
  input: AppendEventInput,
): Promise<TeamLibraryEvent> {
  const lib = await deps.store.getTeamLibrary(input.libraryId);
  if (!lib) throw Errors.notFound(`team library ${input.libraryId}`);

  const latest = await deps.store.latestLibrarySeq(input.libraryId);
  const event: TeamLibraryEvent = {
    id: deps.ulid ? deps.ulid() : `${input.libraryId}:${latest + 1}`,
    libraryId: input.libraryId,
    seq: latest + 1,
    kind: input.kind,
    componentId: input.componentId,
    ...(input.version ? { version: input.version } : {}),
    ...(input.payloadRef ? { payloadRef: input.payloadRef } : {}),
    actorId: input.actorId,
    actorKind: input.actorKind ?? 'human',
    createdAt: nowMs(deps),
  };
  await deps.store.appendLibraryEvent(event);
  return event;
}

export interface ReplayResult {
  applied: number;
  lastSeq: number;
}

/**
 * Replay events from a given seq, applying each exactly once. Idempotent by
 * construction: the subscriber tracks `afterSeq` and events are immutable.
 */
export async function replayLibraryEvents(
  deps: ServiceDeps,
  libraryId: string,
  afterSeq: number,
  onEvent?: (event: TeamLibraryEvent) => Promise<void>,
): Promise<ReplayResult> {
  const events = await deps.store.listLibraryEvents(libraryId, afterSeq);
  let applied = 0;
  for (const event of events) {
    if (onEvent) await onEvent(event);
    applied += 1;
  }
  return { applied, lastSeq: events.length ? events[events.length - 1]!.seq : afterSeq };
}

/** Synchronize a library to the latest seq (worker entry). */
export async function syncLibraryToLatest(
  deps: ServiceDeps,
  libraryId: string,
  onEvent?: (event: TeamLibraryEvent) => Promise<void>,
): Promise<ReplayResult> {
  const latest = await deps.store.latestLibrarySeq(libraryId);
  const start = 0;
  return replayLibraryEvents(deps, libraryId, start, onEvent).then((r) => ({
    ...r,
    lastSeq: latest,
  }));
}

export async function changeLibraryPolicy(
  deps: ServiceDeps,
  libraryId: string,
  actorId: string,
  newPolicy: TeamLibrary['policyMode'],
  actorKind?: 'human' | 'agent',
): Promise<TeamLibrary> {
  const lib = await deps.store.getTeamLibrary(libraryId);
  if (!lib) throw Errors.notFound(`team library ${libraryId}`);
  const prev = lib.policyMode;
  lib.policyMode = newPolicy;
  lib.updatedAt = nowMs(deps);
  await deps.store.putTeamLibrary(lib);
  await appendLibraryEvent(deps, {
    libraryId,
    kind: 'policy_changed',
    componentId: 'policy',
    version: newPolicy,
    actorId,
    ...(actorKind ? { actorKind } : {}),
  });
  // Audit the policy change (agents must be traceable).
  await deps.store.appendAudit({
    id: deps.ulid ? deps.ulid() : `${libraryId}:policy`,
    actorId,
    actorKind: actorKind ?? 'human',
    action: 'library.policy_changed',
    resourceType: 'team_library',
    resourceId: libraryId,
    detail: { from: prev, to: newPolicy },
    createdAt: nowMs(deps),
  });
  return lib;
}

export interface PolicyInput {
  mode: TeamLibrary['policyMode'];
  pinValue?: string;
}

/** Compute the workspace-managed target version for a catalog. */
export async function resolveWorkspaceTarget(
  _deps: ServiceDeps,
  library: TeamLibrary,
  availableVersions: string[],
): Promise<string> {
  const target = resolvePolicyTarget(availableVersions, library.policyMode);
  if (!target) throw Errors.pinUnavailable(`No versions available for library "${library.name}"`);
  return target;
}

export interface WebhookPayload {
  libraryId: string;
  event: TeamLibraryEvent;
}

/** HMAC-SHA256 webhook signing with replay protection (timestamp window). */
export function signWebhook(secret: string, payload: string, now: number): string {
  return createHmac('sha256', secret).update(`${now}|${payload}`).digest('hex');
}

export function verifyWebhook(
  secret: string,
  body: string,
  signature: string,
  timestamp: number,
  now: number,
  maxAgeMs = 5 * 60 * 1000,
): boolean {
  if (Math.abs(now - timestamp) > maxAgeMs) return false;
  const expected = signWebhook(secret, body, timestamp);
  return expected === signature;
}

export function summarizeUpdates(
  events: TeamLibraryEvent[],
): { catalogId: string; kinds: LibraryEventKind[] }[] {
  const byId = new Map<string, LibraryEventKind[]>();
  for (const e of events) {
    const list = byId.get(e.componentId) ?? [];
    if (!list.includes(e.kind)) list.push(e.kind);
    byId.set(e.componentId, list);
  }
  return [...byId.entries()].map(([catalogId, kinds]) => ({ catalogId, kinds }));
}

export function policyForItem(
  lib: TeamLibrary,
  _item: UserLibraryItem,
): UserLibraryItem['pinMode'] {
  return lib.policyMode === 'pinned' ? 'pin-version' : 'workspace-managed';
}
