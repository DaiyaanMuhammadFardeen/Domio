/**
 * @domio/recording-extensions — tests for the uploader adapters.
 */

import { describe, it, expect } from 'vitest';
import { ObjectStoreUploader, InMemoryUploader } from './object-store-uploader.js';
import { MemoryObjectStore } from '@domio/object-store';

describe('ObjectStoreUploader', () => {
  it('uploads chunks with stable keys + sha256 metadata', async () => {
    const store = new MemoryObjectStore({ OBJECT_STORE_BUCKET: 'b' });
    const uploader = new ObjectStoreUploader({ store });
    const body = new Uint8Array([1, 2, 3]);
    const result = await uploader.upload({
      workspace_id: 'ws-1',
      recording_session_id: 'sess-1',
      track_kind: 'screen',
      sequence: 0,
      body,
    });
    expect(result.sha256).toBe('039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
    expect(result.byte_size).toBe(3);
    expect(result.storage_key).toBe('recordings/ws-1/sess-1/screen/00000.webm');
    expect(await store.exists(result.storage_key)).toBe(true);
  });

  it('uses track-specific default extensions', async () => {
    const store = new MemoryObjectStore({ OBJECT_STORE_BUCKET: 'b' });
    const uploader = new ObjectStoreUploader({ store });
    const r1 = await uploader.upload({ workspace_id: 'w', recording_session_id: 's', track_kind: 'microphone', sequence: 0, body: new Uint8Array([0]) });
    const r2 = await uploader.upload({ workspace_id: 'w', recording_session_id: 's', track_kind: 'annotations', sequence: 0, body: new Uint8Array([0]) });
    expect(r1.storage_key.endsWith('.webm')).toBe(true);
    expect(r2.storage_key.endsWith('.json')).toBe(true);
  });
});

describe('InMemoryUploader', () => {
  it('records uploads for assertions', async () => {
    const uploader = new InMemoryUploader();
    await uploader.upload({ workspace_id: 'w', recording_session_id: 's', track_kind: 'screen', sequence: 0, body: new Uint8Array([1, 2]) });
    await uploader.upload({ workspace_id: 'w', recording_session_id: 's', track_kind: 'screen', sequence: 1, body: new Uint8Array([3, 4]) });
    expect(uploader.uploads.length).toBe(2);
    expect(uploader.uploads[0]?.sequence).toBe(0);
    expect(uploader.uploads[1]?.sequence).toBe(1);
    expect(uploader.uploads[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(uploader.uploads[1]?.body).toEqual(new Uint8Array([3, 4]));
  });
});