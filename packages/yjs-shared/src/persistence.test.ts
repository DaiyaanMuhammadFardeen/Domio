import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { createMemoryStore, PersistenceProvider, mergeChunks } from './persistence.js';

describe('createMemoryStore', () => {
  it('get/set/delete/keys round-trip', async () => {
    const store = createMemoryStore();
    const data = new Uint8Array([1, 2, 3, 4]);

    await store.set('a', data);
    expect(await store.get('a')).toEqual(data);
    expect(await store.keys()).toEqual(['a']);

    await store.delete('a');
    expect(await store.get('a')).toBeNull();
    expect(await store.keys()).toEqual([]);
  });

  it('quotaUsedBytes tracks writes and deletes', async () => {
    const store = createMemoryStore();
    await store.set('a', new Uint8Array(100));
    expect(await store.quotaUsedBytes!()).toBe(100);

    await store.set('a', new Uint8Array(200));
    expect(await store.quotaUsedBytes!()).toBe(200);

    await store.delete('a');
    expect(await store.quotaUsedBytes!()).toBe(0);
  });
});

describe('PersistenceProvider', () => {
  it('persist and load round-trip', async () => {
    const store = createMemoryStore();
    const provider = new PersistenceProvider(store);

    const doc1 = new Y.Doc();
    const update1 = Y.encodeStateAsUpdate(doc1);
    await provider.persistSubDocUpdate('slide-1', update1);

    const doc2 = new Y.Doc();
    const update2 = Y.encodeStateAsUpdate(doc2);
    await provider.persistSubDocUpdate('slide-1', update2);

    const chunks = await provider.loadAll('slide-1');
    expect(chunks).toHaveLength(2);

    // Merged updates should produce equivalent docs
    const merged = mergeChunks(chunks);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, merged);

    // Both docs are empty, so state vectors should match
    expect(Y.encodeStateVector(doc1)).toEqual(Y.encodeStateVector(restored));

    doc1.destroy();
    doc2.destroy();
    restored.destroy();
  });

  it('ring buffer eviction keeps only the last N chunks', async () => {
    const store = createMemoryStore();
    const provider = new PersistenceProvider(store, { slideOpRingBuffer: 3 });

    for (let i = 0; i < 5; i++) {
      const doc = new Y.Doc();
      doc.getText('content').insert(0, `chunk-${i}`);
      const update = Y.encodeStateAsUpdate(doc);
      await provider.persistSubDocUpdate('slide-1', update);
      doc.destroy();
    }

    const chunks = await provider.loadAll('slide-1');
    expect(chunks).toHaveLength(3);

    // The merged result should contain the last 3 inserts.
    // When we merge, the later updates win for concurrent edits at position 0.
    const merged = mergeChunks(chunks);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, merged);
    const text = restored.getText('content').toString();
    // After merge of 3 concurrent inserts at position 0, all should be present
    // (Yjs RGA keeps all concurrent inserts, ordering by clientID + clock).
    expect(text.length).toBeGreaterThan(0);
    restored.destroy();
  });

  it('clear removes all data when no key specified', async () => {
    const store = createMemoryStore();
    const provider = new PersistenceProvider(store);

    const doc = new Y.Doc();
    const update = Y.encodeStateAsUpdate(doc);
    await provider.persistSubDocUpdate('slide-1', update);
    await provider.persistSubDocUpdate('slide-2', update);

    expect((await store.keys()).length).toBe(2);
    await provider.clear();
    expect((await store.keys()).length).toBe(0);
    doc.destroy();
  });

  it('clear(subDocKey) removes only that key', async () => {
    const store = createMemoryStore();
    const provider = new PersistenceProvider(store);

    const doc = new Y.Doc();
    const update = Y.encodeStateAsUpdate(doc);
    await provider.persistSubDocUpdate('slide-1', update);
    await provider.persistSubDocUpdate('slide-2', update);

    await provider.clear('slide-1');
    expect(await store.get('slide-1')).toBeNull();
    expect(await store.get('slide-2')).not.toBeNull();
    doc.destroy();
  });
});

describe('warnOnQuota', () => {
  it('fires callback when usage exceeds threshold', async () => {
    const store = createMemoryStore();
    const onWarning = vi.fn();

    // Pre-fill with data to exceed the 80% threshold of the 50 MB heuristic
    // 50 MB * 0.8 = 40 MB. We simulate this by adding 41 MB.
    // But that's too slow. Instead, mock the quotaUsedBytes.
    const mockStore = {
      ...store,
      quotaUsedBytes: async () => 41 * 1024 * 1024, // 41 MB
    };

    const provider = new PersistenceProvider(mockStore, {
      onQuotaWarning: onWarning,
    });

    await provider.warnOnQuota(0.8);
    expect(onWarning).toHaveBeenCalledOnce();
    expect(onWarning).toHaveBeenCalledWith(41 * 1024 * 1024, expect.any(Number));
  });

  it('does not fire callback below threshold', async () => {
    const store = createMemoryStore();
    const onWarning = vi.fn();

    const mockStore = {
      ...store,
      quotaUsedBytes: async () => 10 * 1024 * 1024, // 10 MB
    };

    const provider = new PersistenceProvider(mockStore, {
      onQuotaWarning: onWarning,
    });

    await provider.warnOnQuota(0.8);
    expect(onWarning).not.toHaveBeenCalled();
  });
});

describe('mergeChunks', () => {
  it('returns empty Uint8Array for empty input', () => {
    const result = mergeChunks([]);
    expect(result.length).toBe(0);
  });

  it('merges multiple Yjs updates into one', () => {
    const doc1 = new Y.Doc();
    doc1.getText('t').insert(0, 'hello');
    const u1 = Y.encodeStateAsUpdate(doc1);

    const doc2 = new Y.Doc();
    doc2.getText('t').insert(0, ' world');
    const u2 = Y.encodeStateAsUpdate(doc2);

    const merged = mergeChunks([u1, u2]);
    const result = new Y.Doc();
    Y.applyUpdate(result, merged);
    const text = result.getText('t').toString();

    // Both inserts should be present (order may vary by client ID)
    expect(text).toContain('hello');
    expect(text).toContain(' world');

    doc1.destroy();
    doc2.destroy();
    result.destroy();
  });
});
