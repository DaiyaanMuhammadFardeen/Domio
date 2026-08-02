import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import { run } from './library-sync.js';
import type { TeamLibrary } from '../store/types.js';

function makeDeps(store: InMemoryStore): ServiceDeps {
  return defaultDeps(store, { ulid: () => `ulid-${Date.now()}-${Math.random().toString(36).slice(2)}` });
}

describe('library-sync worker', () => {
  it('returns 0 applied for non-existent library', async () => {
    const store = new InMemoryStore();
    const deps = makeDeps(store);
    const result = await run(deps, { libraryId: 'nonexistent' });
    expect(result.applied).toBe(0);
    expect(result.lastSeq).toBe(0);
  });

  it('returns 0 applied when no events exist', async () => {
    const store = new InMemoryStore();
    const deps = makeDeps(store);

    const lib: TeamLibrary = {
      id: 'lib-1',
      workspaceId: 'ws-1',
      name: 'Design System',
      policyMode: 'latest',
      ownerId: 'user-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.putTeamLibrary(lib);

    const result = await run(deps, { libraryId: 'lib-1' });
    expect(result.applied).toBe(0);
    expect(result.lastSeq).toBe(0);
  });

  it('applies component_published events when versions exist', async () => {
    const store = new InMemoryStore();
    const deps = makeDeps(store);

    const lib: TeamLibrary = {
      id: 'lib-1',
      workspaceId: 'ws-1',
      name: 'Design System',
      policyMode: 'latest',
      ownerId: 'user-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.putTeamLibrary(lib);

    // Publish a component so it has versions
    await store.putPackage({
      id: 'pkg-1',
      catalogId: 'ui-button',
      version: '1.0.0',
      kind: 'component',
      name: 'Button',
      description: '',
      propsSchema: {},
      variants: [],
      files: {},
      packageHash: 'hash1',
      sizeBudgetBytes: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Append events
    await store.appendLibraryEvent({
      id: 'evt-1',
      libraryId: 'lib-1',
      seq: 1,
      kind: 'component_published',
      componentId: 'ui-button',
      version: '1.0.0',
      actorId: 'user-1',
      actorKind: 'human',
      createdAt: Date.now(),
    });

    const result = await run(deps, { libraryId: 'lib-1' });
    expect(result.applied).toBe(1);
    expect(result.lastSeq).toBe(1);
  });

  it('skips component events with no available versions', async () => {
    const store = new InMemoryStore();
    const deps = makeDeps(store);

    const lib: TeamLibrary = {
      id: 'lib-1',
      workspaceId: 'ws-1',
      name: 'Design System',
      policyMode: 'latest',
      ownerId: 'user-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.putTeamLibrary(lib);

    // Event for a component with no versions
    await store.appendLibraryEvent({
      id: 'evt-1',
      libraryId: 'lib-1',
      seq: 1,
      kind: 'component_published',
      componentId: 'nonexistent-component',
      actorId: 'user-1',
      actorKind: 'human',
      createdAt: Date.now(),
    });

    const result = await run(deps, { libraryId: 'lib-1' });
    expect(result.applied).toBe(0); // skipped — no versions
  });

  it('applies mixed event kinds', async () => {
    const store = new InMemoryStore();
    const deps = makeDeps(store);

    const lib: TeamLibrary = {
      id: 'lib-1',
      workspaceId: 'ws-1',
      name: 'Design System',
      policyMode: 'latest',
      ownerId: 'user-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.putTeamLibrary(lib);

    await store.appendLibraryEvent({
      id: 'evt-1',
      libraryId: 'lib-1',
      seq: 1,
      kind: 'policy_changed',
      componentId: 'policy',
      version: 'minor',
      actorId: 'user-1',
      actorKind: 'human',
      createdAt: Date.now(),
    });

    await store.appendLibraryEvent({
      id: 'evt-2',
      libraryId: 'lib-1',
      seq: 2,
      kind: 'component_removed',
      componentId: 'ui-old',
      actorId: 'user-1',
      actorKind: 'human',
      createdAt: Date.now(),
    });

    const result = await run(deps, { libraryId: 'lib-1' });
    expect(result.applied).toBe(2); // policy_changed + component_removed
    expect(result.lastSeq).toBe(2);
  });

  it('second run is idempotent (same applied count)', async () => {
    const store = new InMemoryStore();
    const deps = makeDeps(store);

    const lib: TeamLibrary = {
      id: 'lib-1',
      workspaceId: 'ws-1',
      name: 'Design System',
      policyMode: 'latest',
      ownerId: 'user-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.putTeamLibrary(lib);

    await store.appendLibraryEvent({
      id: 'evt-1',
      libraryId: 'lib-1',
      seq: 1,
      kind: 'component_published',
      componentId: 'ui-button',
      actorId: 'user-1',
      actorKind: 'human',
      createdAt: Date.now(),
    });

    const result1 = await run(deps, { libraryId: 'lib-1' });
    const result2 = await run(deps, { libraryId: 'lib-1' });

    expect(result1.applied).toBe(result2.applied);
    expect(result1.lastSeq).toBe(result2.lastSeq);
  });
});
