/**
 * @domio/object-store — barrel.
 *
 * Re-exports the ObjectStore interface, factory, adapters, key builders,
 * and error types. Single import for callers:
 *
 *   import { createObjectStore, recordingChunkKey, ObjectStoreKeyError } from '@domio/object-store';
 */

export type {
  ObjectStore,
  ObjectStoreEnv,
  ObjectStorePutOptions,
  ObjectStoreGetResult,
  ObjectStoreHeadResult,
  PresignedUrlOptions,
  KeyLayout,
} from './types.js';

export { createObjectStore, readObjectStoreEnv } from './factory.js';
export { MemoryObjectStore, ObjectStoreKeyError } from './memory-adapter.js';
export { S3Adapter, ObjectStoreError } from './s3-adapter.js';
export type { S3AdapterOptions } from './s3-adapter.js';
export {
  recordingChunkKey,
  captionKey,
  captionManifestKey,
  clipSegmentKey,
  clipCaptionKey,
  clipSpecKey,
  scormPackageKey,
  replayAssetKey,
  thumbnailKey,
  parseKey,
} from './keys.js';
export type { TrackKind, StorageBucket } from './keys.js';
export { signRequest, presignUrl, sha256Hex } from './sigv4.js';
export type { SigV4Credentials, SigV4Request, SignedRequest } from './sigv4.js';
