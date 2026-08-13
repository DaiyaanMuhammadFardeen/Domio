/**
 * @domio/object-store — memory adapter + factory tests.
 */

import { describe, it, expect } from 'vitest';
import { MemoryObjectStore, ObjectStoreKeyError } from './memory-adapter.js';
import { createObjectStore, readObjectStoreEnv } from './factory.js';

describe('MemoryObjectStore', () => {
  it('round-trips a put/get with metadata', async () => {
    const store = new MemoryObjectStore({ OBJECT_STORE_BUCKET: 'domio-test' });
    const body = new Uint8Array([1, 2, 3, 4]);
    await store.put('recordings/ws-1/sess/00001.bin', body, {
      contentType: 'application/octet-stream',
      metadata: { session_id: 'sess' },
    });
    const got = await store.get('recordings/ws-1/sess/00001.bin');
    expect(got.body).toEqual(body);
    expect(got.contentType).toBe('application/octet-stream');
    expect(got.contentLength).toBe(4);
    expect(got.metadata.session_id).toBe('sess');
    expect(got.etag).toBeTruthy();
  });

  it('reports missing keys with ObjectStoreKeyError', async () => {
    const store = new MemoryObjectStore({ OBJECT_STORE_BUCKET: 'domio-test' });
    await expect(store.get('missing')).rejects.toBeInstanceOf(ObjectStoreKeyError);
    expect(await store.exists('missing')).toBe(false);
    expect(await store.exists('recordings/ws-1/sess/00001.bin')).toBe(false);
  });

  it('deletes keys', async () => {
    const store = new MemoryObjectStore({ OBJECT_STORE_BUCKET: 'domio-test' });
    await store.put('k', new Uint8Array([1]));
    expect(await store.exists('k')).toBe(true);
    await store.delete('k');
    expect(await store.exists('k')).toBe(false);
  });

  it('lists by prefix with cursor', async () => {
    const store = new MemoryObjectStore({ OBJECT_STORE_BUCKET: 'domio-test' });
    for (let i = 0; i < 5; i++) await store.put(`recs/${i}.bin`, new Uint8Array([i]));
    const all = await store.list('recs/', { maxKeys: 3 });
    expect(all.keys).toEqual(['recs/0.bin', 'recs/1.bin', 'recs/2.bin']);
    expect(all.nextCursor).toBe('3');
    const rest = await store.list('recs/', { maxKeys: 3, cursor: '3' });
    expect(rest.keys).toEqual(['recs/3.bin', 'recs/4.bin']);
    expect(rest.nextCursor).toBeNull();
  });

  it('presignGet returns a data: URL containing the body', async () => {
    const store = new MemoryObjectStore({ OBJECT_STORE_BUCKET: 'domio-test' });
    await store.put('k', new Uint8Array([72, 101, 108, 108, 111]), { contentType: 'text/plain' });
    const url = await store.presignGet('k');
    expect(url.startsWith('data:text/plain;base64,')).toBe(true);
    expect(
      Buffer.from(
        url.slice('data:text/plain;base64,'.length).split('#')[0] ?? '',
        'base64',
      ).toString(),
    ).toBe('Hello');
  });
});

describe('createObjectStore factory', () => {
  it('defaults to memory backend when OBJECT_STORE is unset', () => {
    const store = createObjectStore({});
    expect(store.backend).toBe('memory');
  });

  it('returns MemoryObjectStore when OBJECT_STORE=memory', () => {
    const store = createObjectStore({ OBJECT_STORE: 'memory' });
    expect(store.backend).toBe('memory');
  });

  it('throws when s3 backend is missing required env', () => {
    expect(() => createObjectStore({ OBJECT_STORE: 's3' })).toThrow(/OBJECT_STORE_BUCKET/);
    expect(() =>
      createObjectStore({
        OBJECT_STORE: 's3',
        OBJECT_STORE_BUCKET: 'b',
        OBJECT_STORE_REGION: 'us-east-1',
        OBJECT_STORE_ACCESS_KEY: 'ak',
      }),
    ).toThrow(/OBJECT_STORE_SECRET_KEY/);
  });

  it('returns S3Adapter when full s3 env is provided', () => {
    const store = createObjectStore({
      OBJECT_STORE: 's3',
      OBJECT_STORE_BUCKET: 'b',
      OBJECT_STORE_REGION: 'us-east-1',
      OBJECT_STORE_ACCESS_KEY: 'ak',
      OBJECT_STORE_SECRET_KEY: 'sk',
    });
    expect(store.backend).toBe('s3');
  });

  it('returns S3Adapter marked minio for OBJECT_STORE=minio', () => {
    const store = createObjectStore({
      OBJECT_STORE: 'minio',
      OBJECT_STORE_BUCKET: 'b',
      OBJECT_STORE_REGION: 'us-east-1',
      OBJECT_STORE_ACCESS_KEY: 'ak',
      OBJECT_STORE_SECRET_KEY: 'sk',
      OBJECT_STORE_ENDPOINT: 'http://minio:9000',
    });
    expect(store.backend).toBe('minio');
  });
});

describe('readObjectStoreEnv', () => {
  it('reads only defined keys from process.env', () => {
    const out = readObjectStoreEnv({
      OBJECT_STORE: 'minio',
      OBJECT_STORE_BUCKET: 'b',
      OBJECT_STORE_REGION: 'us-east-1',
      OBJECT_STORE_ACCESS_KEY: 'ak',
      OBJECT_STORE_SECRET_KEY: 'sk',
      OBJECT_STORE_ENDPOINT: 'http://x',
      OBJECT_STORE_FORCE_PATH_STYLE: 'true',
      UNRELATED: 'ignored',
    });
    expect(out.OBJECT_STORE).toBe('minio');
    expect(out.OBJECT_STORE_BUCKET).toBe('b');
    expect(out.OBJECT_STORE_FORCE_PATH_STYLE).toBe('true');
    expect((out as Record<string, unknown>).UNRELATED).toBeUndefined();
  });
});
