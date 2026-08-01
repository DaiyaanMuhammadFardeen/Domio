import { describe, it, expect } from 'vitest';
import { AutosaveQueue, InMemoryPersistentStore, type PersistentStore } from './autosave-queue.js';

interface Edit {
  slideId: string;
  delta: string;
}

class FakeClock {
  private current = 0;
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

describe('AutosaveQueue', () => {
  it('debounces enqueues inside the 16 ms window', async () => {
    const clock = new FakeClock();
    const flushed: Edit[][] = [];
    const store: PersistentStore = {
      async put(entry) {
        flushed.push([entry.payload as Edit]);
      },
      async list() {
        return [];
      },
      async clear() {
        flushed.length = 0;
      },
    };
    const queue = new AutosaveQueue<Edit>({ store, now: clock.now, debounceMs: 16 });
    queue.enqueue('1', { slideId: 'a', delta: 'one' });
    queue.enqueue('2', { slideId: 'b', delta: 'two' });
    expect(queue.pendingCount()).toBe(2);
    clock.advance(16);
    await queue.flush();
    expect(queue.pendingCount()).toBe(0);
    expect(flushed.flat()).toHaveLength(2);
  });

  it('coalesces rapid edits to the same id', async () => {
    const store = new InMemoryPersistentStore();
    const queue = new AutosaveQueue<Edit>({ store, debounceMs: 0 });
    queue.enqueue('same', { slideId: 'a', delta: 'one' });
    queue.enqueue('same', { slideId: 'a', delta: 'two' });
    await queue.flush();
    expect(queue.pendingCount()).toBe(0);
    expect((await store.list())[0]?.payload).toEqual({ slideId: 'a', delta: 'two' });
  });

  it('flush() is idempotent while a flush is already in flight', async () => {
    let putCalls = 0;
    let released: () => void = () => {};
    const releasedPromise = new Promise<void>((resolve) => {
      released = resolve;
    });
    const slowStore: PersistentStore = {
      async put() {
        putCalls += 1;
        if (putCalls === 1) {
          await releasedPromise;
        }
      },
      async list() {
        return [];
      },
      async clear() {},
    };
    const queue = new AutosaveQueue<Edit>({ store: slowStore, debounceMs: 0 });
    queue.enqueue('1', { slideId: 'a', delta: 'one' });
    const first = queue.flush();
    const second = queue.flush();
    released();
    await Promise.all([first, second]);
    expect(putCalls).toBe(1);
  });

  it('handles quota exceeded gracefully', async () => {
    const quotaStore: PersistentStore = {
      async put() {
        throw Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' });
      },
      async list() {
        return [];
      },
      async clear() {},
    };
    let quotaError: unknown = null;
    const queue = new AutosaveQueue<Edit>({ store: quotaStore, debounceMs: 0 });
    queue.onQuotaExceeded((error) => {
      quotaError = error;
    });
    queue.enqueue('1', { slideId: 'a', delta: 'one' });
    await queue.flush();
    expect(quotaError).toBeInstanceOf(Error);
    expect((quotaError as Error).name).toBe('QuotaExceededError');
  });

  it('rehydrates pending edits from the persistent store', async () => {
    const store = new InMemoryPersistentStore();
    const queue = new AutosaveQueue<Edit>({ store, debounceMs: 0 });
    queue.enqueue('1', { slideId: 'a', delta: 'one' });
    await queue.flush();
    expect(queue.pendingCount()).toBe(0);

    const nextQueue = new AutosaveQueue<Edit>({ store, debounceMs: 0 });
    expect(nextQueue.pendingCount()).toBe(0);
    await nextQueue.rehydrate();
    expect(nextQueue.pendingCount()).toBe(1);
  });

  it('respects the batch size when flushing', async () => {
    const writes: unknown[] = [];
    const store: PersistentStore = {
      async put(entry) {
        writes.push(entry.payload);
      },
      async list() {
        return [];
      },
      async clear() {},
    };
    const queue = new AutosaveQueue<Edit>({ store, debounceMs: 0, batchSize: 2 });
    queue.enqueue('1', { slideId: 'a', delta: 'one' });
    queue.enqueue('2', { slideId: 'a', delta: 'two' });
    queue.enqueue('3', { slideId: 'a', delta: 'three' });
    await queue.flush();
    expect(writes).toHaveLength(2);
    expect(queue.pendingCount()).toBe(1);
    await queue.flush();
    expect(writes).toHaveLength(3);
  });
});