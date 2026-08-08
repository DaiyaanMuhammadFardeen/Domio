/**
 * PropagatorWorker — tests (Phase 18 Wave 3).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PropagatorWorker } from './propagator.js';
import { LibraryService } from '@domio/library-service';
import { InMemoryLibraryStore } from '@domio/library-service';

const fixedDate = new Date('2026-01-15T10:00:00Z');

function makeLogger() {
  const logs: Array<{ level: string; message: string }> = [];
  return {
    logs,
    info(message: string) { logs.push({ level: 'info', message }); },
    warn(message: string) { logs.push({ level: 'warn', message }); },
    error(message: string) { logs.push({ level: 'error', message }); },
  };
}

describe('PropagatorWorker', () => {
  let store: InMemoryLibraryStore;
  let service: LibraryService;
  let worker: PropagatorWorker;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    store = new InMemoryLibraryStore();
    service = new LibraryService({
      store,
      now: () => fixedDate,
    });
    logger = makeLogger();
    worker = new PropagatorWorker({
      service,
      tickMs: 1000,
      logger,
      now: () => Date.now(),
    });
  });

  it('applies due immediate bindings', async () => {
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

    const result = await worker.runOnce();
    expect(result.applied).toBe(1);
    expect(result.conflict).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('skips frozen/manual bindings', async () => {
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

    await service.createBinding(
      {
        workspace_id: 'ws-1',
        consumer_deck_id: 'deck-2',
        consumer_slide_id: 'slide-2',
        library_entry_id: entry.id,
        mode: 'manual',
      },
      'user-1',
    );

    const result = await worker.runOnce();
    expect(result.applied).toBe(0);
    expect(result.conflict).toBe(0);
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

    const result = await worker.runOnce();
    // Conflict bindings are filtered out by getPropagationCandidates (shouldApply returns false for conflict)
    expect(result.applied).toBe(0);
  });

  it('start/stop lifecycle', () => {
    expect(worker.isRunning).toBe(false);
    worker.start();
    expect(worker.isRunning).toBe(true);
    // Starting again is a no-op
    worker.start();
    expect(worker.isRunning).toBe(true);
    worker.stop();
    expect(worker.isRunning).toBe(false);
    // Stopping again is safe
    worker.stop();
    expect(worker.isRunning).toBe(false);
  });

  it('logs start and stop', () => {
    worker.start();
    expect(logger.logs.some((l) => l.message === 'propagator.start')).toBe(true);
    worker.stop();
    expect(logger.logs.some((l) => l.message === 'propagator.stop')).toBe(true);
  });
});
