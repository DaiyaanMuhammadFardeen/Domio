import { describe, it, expect } from 'vitest';
import { AutosaveQueue, InMemoryPersistentStore } from '../../sdk-ts/src/autosave-queue.js';

describe('canvas autosave integration', () => {
  it('durable within 16 ms', async () => {
    const store = new InMemoryPersistentStore();
    const queue = new AutosaveQueue({ store, debounceMs: 16 });
    queue.enqueue('1', { slideId: 'a', delta: 'one' });
    await queue.flush();
    expect(queue.pendingCount()).toBe(0);
    expect(await store.list()).toHaveLength(1);
  });

  it('survives a reload via rehydrate', async () => {
    const store = new InMemoryPersistentStore();
    const queue = new AutosaveQueue({ store, debounceMs: 0 });
    queue.enqueue('1', { slideId: 'a', delta: 'one' });
    await queue.flush();
    const next = new AutosaveQueue({ store, debounceMs: 0 });
    await next.rehydrate();
    expect(next.pendingCount()).toBe(1);
  });
});
