import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps } from '../deps.js';
import {
  appendLibraryEvent,
  replayLibraryEvents,
  syncLibraryToLatest,
  changeLibraryPolicy,
  resolveWorkspaceTarget,
  signWebhook,
  verifyWebhook,
  summarizeUpdates,
  policyForItem,
} from './libraryLog.js';
import type { TeamLibrary, UserLibraryItem, TeamLibraryEvent } from '../store/types.js';

async function seedLibrary(
  store: InMemoryStore,
  id = 'lib-1',
  overrides: Partial<TeamLibrary> = {},
): Promise<TeamLibrary> {
  const lib: TeamLibrary = {
    id,
    workspaceId: 'ws-1',
    name: 'Test Library',
    policyMode: 'latest',
    ownerId: 'owner-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
  await store.putTeamLibrary(lib);
  return lib;
}

function makeEvent(
  overrides: Partial<TeamLibraryEvent> & { kind: TeamLibraryEvent['kind']; componentId: string },
): TeamLibraryEvent {
  const { componentId, ...rest } = overrides;
  return {
    id: 'e1',
    libraryId: 'lib-1',
    seq: 1,
    componentId,
    actorId: 'u',
    actorKind: 'human',
    createdAt: Date.now(),
    ...rest,
  };
}

describe('libraryLog', () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  describe('appendLibraryEvent', () => {
    it('appends event to a library', async () => {
      const deps = defaultDeps(store);
      await seedLibrary(store);
      const event = await appendLibraryEvent(deps, {
        libraryId: 'lib-1',
        kind: 'component_published',
        componentId: 'comp-1',
        version: '1.0.0',
        actorId: 'user-1',
      });
      expect(event.libraryId).toBe('lib-1');
      expect(event.seq).toBe(1);
      expect(event.kind).toBe('component_published');
      expect(event.componentId).toBe('comp-1');
    });

    it('increments seq on multiple events', async () => {
      const deps = defaultDeps(store);
      await seedLibrary(store);
      const e1 = await appendLibraryEvent(deps, {
        libraryId: 'lib-1',
        kind: 'component_published',
        componentId: 'a',
        actorId: 'u',
      });
      const e2 = await appendLibraryEvent(deps, {
        libraryId: 'lib-1',
        kind: 'component_removed',
        componentId: 'b',
        actorId: 'u',
      });
      expect(e1.seq).toBe(1);
      expect(e2.seq).toBe(2);
    });

    it('includes optional fields when provided', async () => {
      const deps = defaultDeps(store);
      await seedLibrary(store);
      const event = await appendLibraryEvent(deps, {
        libraryId: 'lib-1',
        kind: 'component_updated',
        componentId: 'c',
        version: '2.0.0',
        payloadRef: 'ref-1',
        actorId: 'agent-1',
        actorKind: 'agent',
      });
      expect(event.version).toBe('2.0.0');
      expect(event.payloadRef).toBe('ref-1');
      expect(event.actorKind).toBe('agent');
    });

    it('defaults actorKind to human', async () => {
      const deps = defaultDeps(store);
      await seedLibrary(store);
      const event = await appendLibraryEvent(deps, {
        libraryId: 'lib-1',
        kind: 'component_published',
        componentId: 'x',
        actorId: 'u',
      });
      expect(event.actorKind).toBe('human');
    });

    it('throws ERR_NOT_FOUND for missing library', async () => {
      const deps = defaultDeps(store);
      await expect(
        appendLibraryEvent(deps, {
          libraryId: 'missing',
          kind: 'component_published',
          componentId: 'x',
          actorId: 'u',
        }),
      ).rejects.toThrow('not found');
    });
  });

  describe('replayLibraryEvents', () => {
    it('replays events from afterSeq', async () => {
      const deps = defaultDeps(store);
      await seedLibrary(store);
      await appendLibraryEvent(deps, {
        libraryId: 'lib-1',
        kind: 'component_published',
        componentId: 'a',
        actorId: 'u',
      });
      await appendLibraryEvent(deps, {
        libraryId: 'lib-1',
        kind: 'component_removed',
        componentId: 'b',
        actorId: 'u',
      });

      const result = await replayLibraryEvents(deps, 'lib-1', 0);
      expect(result.applied).toBe(2);
      expect(result.lastSeq).toBe(2);
    });

    it('returns empty result when no events after seq', async () => {
      const deps = defaultDeps(store);
      await seedLibrary(store);
      const result = await replayLibraryEvents(deps, 'lib-1', 0);
      expect(result.applied).toBe(0);
      expect(result.lastSeq).toBe(0);
    });

    it('calls onEvent for each event', async () => {
      const deps = defaultDeps(store);
      await seedLibrary(store);
      await appendLibraryEvent(deps, {
        libraryId: 'lib-1',
        kind: 'component_published',
        componentId: 'a',
        actorId: 'u',
      });

      const called: string[] = [];
      await replayLibraryEvents(deps, 'lib-1', 0, async (e) => {
        called.push(e.componentId);
      });
      expect(called).toEqual(['a']);
    });
  });

  describe('syncLibraryToLatest', () => {
    it('syncs from seq 0 and returns latest seq', async () => {
      const deps = defaultDeps(store);
      await seedLibrary(store);
      await appendLibraryEvent(deps, {
        libraryId: 'lib-1',
        kind: 'component_published',
        componentId: 'a',
        actorId: 'u',
      });

      const result = await syncLibraryToLatest(deps, 'lib-1');
      expect(result.applied).toBe(1);
      expect(result.lastSeq).toBe(1);
    });
  });

  describe('changeLibraryPolicy', () => {
    it('updates policyMode and emits audit + event', async () => {
      const deps = defaultDeps(store);
      await seedLibrary(store);
      const lib = await changeLibraryPolicy(deps, 'lib-1', 'user-1', 'pinned');
      expect(lib.policyMode).toBe('pinned');

      const events = await store.listLibraryEvents('lib-1', 0);
      const policyEvents = events.filter((e) => e.kind === 'policy_changed');
      expect(policyEvents.length).toBe(1);
      expect(policyEvents[0]!.version).toBe('pinned');
    });

    it('supports actorKind', async () => {
      const deps = defaultDeps(store);
      await seedLibrary(store);
      await changeLibraryPolicy(deps, 'lib-1', 'agent-1', 'minor', 'agent');
      const events = await store.listLibraryEvents('lib-1', 0);
      const policyEvents = events.filter((e) => e.kind === 'policy_changed');
      expect(policyEvents[0]!.actorKind).toBe('agent');
    });

    it('throws ERR_NOT_FOUND for missing library', async () => {
      const deps = defaultDeps(store);
      await expect(changeLibraryPolicy(deps, 'missing', 'u', 'latest')).rejects.toThrow(
        'not found',
      );
    });
  });

  describe('resolveWorkspaceTarget', () => {
    it('resolves a target from available versions', async () => {
      const deps = defaultDeps(store);
      const lib = { policyMode: 'latest' } as TeamLibrary;
      const target = await resolveWorkspaceTarget(deps, lib, ['1.0.0', '2.0.0']);
      expect(target).toBe('2.0.0');
    });

    it('throws ERR_PIN_UNAVAILABLE when no versions available', async () => {
      const deps = defaultDeps(store);
      const lib = { policyMode: 'latest', name: 'Empty Lib' } as TeamLibrary;
      await expect(resolveWorkspaceTarget(deps, lib, [])).rejects.toThrow('No versions available');
    });
  });

  describe('signWebhook / verifyWebhook', () => {
    it('produces valid HMAC signature', () => {
      const sig = signWebhook('secret', 'body', 1000);
      expect(sig).toBeTruthy();
      expect(typeof sig).toBe('string');
    });

    it('verifyWebhook returns true for valid signature', () => {
      const now = Date.now();
      const sig = signWebhook('secret', '{"a":1}', now);
      expect(verifyWebhook('secret', '{"a":1}', sig, now, now)).toBe(true);
    });

    it('verifyWebhook returns false when expired', () => {
      const now = Date.now();
      const sig = signWebhook('secret', 'body', now);
      expect(verifyWebhook('secret', 'body', sig, now, now + 10 * 60 * 1000)).toBe(false);
    });

    it('verifyWebhook returns false for bad signature', () => {
      const now = Date.now();
      expect(verifyWebhook('secret', 'body', 'badsig', now, now)).toBe(false);
    });

    it('verifyWebhook returns false for bad secret', () => {
      const now = Date.now();
      const sig = signWebhook('secret', 'body', now);
      expect(verifyWebhook('wrong-secret', 'body', sig, now, now)).toBe(false);
    });
  });

  describe('summarizeUpdates', () => {
    it('groups events by componentId with unique kinds', () => {
      const events = [
        makeEvent({
          id: '1',
          libraryId: 'lib-1',
          seq: 1,
          componentId: 'a',
          kind: 'component_published',
          actorId: 'u',
          actorKind: 'human',
          createdAt: 1,
        }),
        makeEvent({
          id: '2',
          libraryId: 'lib-1',
          seq: 2,
          componentId: 'a',
          kind: 'component_removed',
          actorId: 'u',
          actorKind: 'human',
          createdAt: 2,
        }),
        makeEvent({
          id: '3',
          libraryId: 'lib-1',
          seq: 3,
          componentId: 'a',
          kind: 'component_published',
          actorId: 'u',
          actorKind: 'human',
          createdAt: 3,
        }),
        makeEvent({
          id: '4',
          libraryId: 'lib-1',
          seq: 4,
          componentId: 'b',
          kind: 'component_updated',
          actorId: 'u',
          actorKind: 'human',
          createdAt: 4,
        }),
      ];
      const result = summarizeUpdates(events);
      expect(result.length).toBe(2);
      const a = result.find((r) => r.catalogId === 'a')!;
      expect(a.kinds).toEqual(['component_published', 'component_removed']);
    });

    it('returns empty array for no events', () => {
      expect(summarizeUpdates([])).toEqual([]);
    });
  });

  describe('policyForItem', () => {
    it('returns pin-version when policy is pinned', () => {
      const lib = { policyMode: 'pinned' } as TeamLibrary;
      const item = {} as UserLibraryItem;
      expect(policyForItem(lib, item)).toBe('pin-version');
    });

    it('returns workspace-managed otherwise', () => {
      const lib = { policyMode: 'latest' } as TeamLibrary;
      const item = {} as UserLibraryItem;
      expect(policyForItem(lib, item)).toBe('workspace-managed');
    });
  });
});
