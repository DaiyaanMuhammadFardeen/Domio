/**
 * LibraryService — integration tests (Phase 18 Wave 3).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LibraryService } from './service.js';
import { InMemoryLibraryStore } from './store/mem_store.js';
import type { LibraryEventEmitter } from './types.js';
import { FeatureDisabledError } from './types.js';

const fixedDate = new Date('2026-01-15T10:00:00Z');

function makeEventEmitter(): LibraryEventEmitter & { events: Array<{ subject: string; payload: Record<string, unknown> }> } {
  const events: Array<{ subject: string; payload: Record<string, unknown> }> = [];
  return {
    events,
    async publish(subject: string, payload: Record<string, unknown>): Promise<void> {
      events.push({ subject, payload });
    },
  };
}

describe('LibraryService', () => {
  let store: InMemoryLibraryStore;
  let emitter: ReturnType<typeof makeEventEmitter>;
  let service: LibraryService;

  beforeEach(() => {
    store = new InMemoryLibraryStore();
    emitter = makeEventEmitter();
    service = new LibraryService({
      store,
      eventEmitter: emitter,
      now: () => fixedDate,
    });
  });

  describe('feature flag', () => {
    it('returns 503 when collab.library is disabled', async () => {
      process.env.FEATURE_COLLAB_LIBRARY_DISABLED = 'true';
      try {
        await expect(service.listEntries('ws-1')).rejects.toThrow(FeatureDisabledError);
      } finally {
        delete process.env.FEATURE_COLLAB_LIBRARY_DISABLED;
      }
    });

    it('returns 503 when collab.autoupdate is disabled', async () => {
      process.env.FEATURE_COLLAB_AUTOUPDATE_DISABLED = 'true';
      try {
        await expect(service.listBindings('ws-1')).rejects.toThrow(FeatureDisabledError);
      } finally {
        delete process.env.FEATURE_COLLAB_AUTOUPDATE_DISABLED;
      }
    });
  });

  describe('createEntry', () => {
    it('creates an entry and version, emits event', async () => {
      const { entry, version } = await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Hero Template',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: { type: 'slide', elements: [] } },
        },
        'user-1',
      );

      expect(entry.status).toBe('draft');
      expect(entry.title).toBe('Hero Template');
      expect(version.version_num).toBe(1);

      expect(emitter.events).toHaveLength(1);
      expect(emitter.events[0]!.subject).toBe('library.entry_created');
    });
  });

  describe('addVersion', () => {
    it('increments version_num', async () => {
      const { entry } = await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Template',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
      );

      const v2 = await service.addVersion(entry.id, { slide_snapshot: { v: 2 } }, 'user-1');
      expect(v2.version_num).toBe(2);

      const v3 = await service.addVersion(entry.id, { slide_snapshot: { v: 3 } }, 'user-1');
      expect(v3.version_num).toBe(3);
    });

    it('rejects adding version to retired entry', async () => {
      const { entry } = await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Template',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
      );

      // Add a second entry so we can retire without leaving no head
      await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Template 2',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
      );

      await service.retireEntry(entry.id, undefined, 'user-1');

      await expect(
        service.addVersion(entry.id, { slide_snapshot: {} }, 'user-1'),
      ).rejects.toThrow();
    });
  });

  describe('publishEntry', () => {
    it('publishes draft to approved', async () => {
      const { entry } = await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Template',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
      );

      const published = await service.publishEntry(entry.id, 'user-1');
      expect(published.status).toBe('approved');

      expect(emitter.events.some((e) => e.subject === 'library.entry_published')).toBe(true);
    });
  });

  describe('retireEntry', () => {
    it('retires entry with superseded_by', async () => {
      const { entry: e1 } = await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Old Template',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
      );

      const { entry: e2 } = await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'New Template',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
      );

      const retired = await service.retireEntry(e1.id, e2.id, 'user-1');
      expect(retired.status).toBe('retired');
      expect(retired.superseded_by).toBe(e2.id);

      expect(emitter.events.some((e) => e.subject === 'library.entry_retired')).toBe(true);
    });
  });

  describe('insertFromLibrary', () => {
    it('reference mode creates binding', async () => {
      const { entry } = await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Template',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: { data: 'hello' } },
        },
        'user-1',
      );
      await service.publishEntry(entry.id, 'user-1');

      const result = await service.insertFromLibrary(
        entry.id,
        'reference',
        'deck-1',
        'slide-1',
        'ws-1',
        'user-1',
      );

      expect(result.version_id).toBeDefined();
      expect(result.binding).toBeDefined();
      expect(result.binding!.mode).toBe('immediate');
      expect(result.binding!.library_entry_id).toBe(entry.id);
    });

    it('copy mode does not create binding', async () => {
      const { entry } = await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Template',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
      );
      await service.publishEntry(entry.id, 'user-1');

      const result = await service.insertFromLibrary(
        entry.id,
        'copy',
        'deck-1',
        'slide-1',
        'ws-1',
        'user-1',
      );

      expect(result.version_id).toBeDefined();
      expect(result.binding).toBeUndefined();
    });
  });

  describe('auto-update bindings', () => {
    it('createBinding and listBindings', async () => {
      const { entry } = await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Template',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
      );

      const binding = await service.createBinding(
        {
          workspace_id: 'ws-1',
          consumer_deck_id: 'deck-1',
          consumer_slide_id: 'slide-1',
          library_entry_id: entry.id,
          mode: 'immediate',
        },
        'user-1',
      );

      expect(binding.mode).toBe('immediate');
      expect(binding.library_entry_id).toBe(entry.id);

      const bindings = await service.listBindings('ws-1');
      expect(bindings).toHaveLength(1);
      expect(bindings[0]!.id).toBe(binding.id);
    });

    it('updateBinding and deleteBinding', async () => {
      const { entry } = await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Template',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
      );

      const binding = await service.createBinding(
        {
          workspace_id: 'ws-1',
          consumer_deck_id: 'deck-1',
          consumer_slide_id: 'slide-1',
          library_entry_id: entry.id,
          mode: 'manual',
        },
        'user-1',
      );

      const updated = await service.updateBinding(binding.id, { mode: 'frozen' }, 'user-1');
      expect(updated.mode).toBe('frozen');

      await service.deleteBinding(binding.id);
      const bindings = await service.listBindings('ws-1');
      expect(bindings).toHaveLength(0);
    });
  });

  describe('getPropagationCandidates + applyBinding', () => {
    it('returns candidates and applies', async () => {
      const { entry } = await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Template',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
      );
      await service.publishEntry(entry.id, 'user-1');

      await service.createBinding(
        {
          workspace_id: 'ws-1',
          consumer_deck_id: 'deck-1',
          consumer_slide_id: 'slide-1',
          library_entry_id: entry.id,
          mode: 'immediate',
        },
        'user-1',
      );

      const candidates = await service.getPropagationCandidates(Date.now());
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.binding.library_entry_id).toBe(entry.id);

      const result = await service.applyBinding(
        candidates[0]!.binding.id,
        candidates[0]!.latestVersion,
        Date.now(),
      );
      expect(result.applied).toBe(true);

      expect(emitter.events.some((e) => e.subject === 'auto_update.applied')).toBe(true);
    });

    it('skips frozen bindings', async () => {
      const { entry } = await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Template',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
      );
      await service.publishEntry(entry.id, 'user-1');

      await service.createBinding(
        {
          workspace_id: 'ws-1',
          consumer_deck_id: 'deck-1',
          consumer_slide_id: 'slide-1',
          library_entry_id: entry.id,
          mode: 'frozen',
        },
        'user-1',
      );

      const candidates = await service.getPropagationCandidates(Date.now());
      expect(candidates).toHaveLength(0);
    });

    it('records conflict pause', async () => {
      const { entry } = await service.createEntry(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Template',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
      );
      await service.publishEntry(entry.id, 'user-1');

      const binding = await service.createBinding(
        {
          workspace_id: 'ws-1',
          consumer_deck_id: 'deck-1',
          consumer_slide_id: 'slide-1',
          library_entry_id: entry.id,
          mode: 'immediate',
        },
        'user-1',
      );

      // Simulate conflict
      await store.updateBinding(binding.id, { last_sync_status: 'conflict' });

      const result = await service.applyBinding(
        binding.id,
        (await store.listVersionsByEntry(entry.id))[0]!,
        Date.now(),
      );
      expect(result.applied).toBe(false);
      expect(result.reason).toBe('consumer_conflict');
    });
  });
});
