/**
 * @domio/object-store — factory.
 *
 * createObjectStore(env) is the single entry point. It reads OBJECT_STORE
 * and returns the right adapter. Mirrors services/stt-provider/src/index.ts
 * factory pattern so callers can do:
 *
 *   const store = createObjectStore(process.env);
 *   await store.put(key, body, { contentType: 'video/mp4' });
 */

import { MemoryObjectStore } from './memory-adapter.js';
import { S3Adapter } from './s3-adapter.js';
import type { ObjectStore, ObjectStoreEnv } from './types.js';

export function createObjectStore(env: Partial<ObjectStoreEnv>): ObjectStore {
  const backend = env.OBJECT_STORE ?? 'memory';
  if (backend === 'memory') {
    const bucket = env.OBJECT_STORE_BUCKET ?? 'domio-local';
    return new MemoryObjectStore({ OBJECT_STORE_BUCKET: bucket });
  }
  const full = env as ObjectStoreEnv;
  if (!full.OBJECT_STORE_BUCKET || !full.OBJECT_STORE_REGION || !full.OBJECT_STORE_ACCESS_KEY || !full.OBJECT_STORE_SECRET_KEY) {
    throw new Error(
      `createObjectStore: backend=${backend} requires OBJECT_STORE_BUCKET, OBJECT_STORE_REGION, OBJECT_STORE_ACCESS_KEY, OBJECT_STORE_SECRET_KEY`,
    );
  }
  return new S3Adapter({ env: full });
}

export function readObjectStoreEnv(src: NodeJS.ProcessEnv = process.env): Partial<ObjectStoreEnv> {
  const out: Record<string, string> = {};
  if (src.OBJECT_STORE === 'minio' || src.OBJECT_STORE === 's3' || src.OBJECT_STORE === 'memory') {
    out['OBJECT_STORE'] = src.OBJECT_STORE;
  }
  if (src.OBJECT_STORE_BUCKET) out['OBJECT_STORE_BUCKET'] = src.OBJECT_STORE_BUCKET;
  if (src.OBJECT_STORE_REGION) out['OBJECT_STORE_REGION'] = src.OBJECT_STORE_REGION;
  if (src.OBJECT_STORE_ENDPOINT) out['OBJECT_STORE_ENDPOINT'] = src.OBJECT_STORE_ENDPOINT;
  if (src.OBJECT_STORE_ACCESS_KEY) out['OBJECT_STORE_ACCESS_KEY'] = src.OBJECT_STORE_ACCESS_KEY;
  if (src.OBJECT_STORE_SECRET_KEY) out['OBJECT_STORE_SECRET_KEY'] = src.OBJECT_STORE_SECRET_KEY;
  if (src.OBJECT_STORE_FORCE_PATH_STYLE) out['OBJECT_STORE_FORCE_PATH_STYLE'] = src.OBJECT_STORE_FORCE_PATH_STYLE;
  return out as Partial<ObjectStoreEnv>;
}