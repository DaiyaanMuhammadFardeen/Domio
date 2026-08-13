/**
 * @domio/object-store — in-memory adapter.
 *
 * Used by tests and by the local dev stack when no OBJECT_STORE is configured.
 * Persists nothing; survives only as long as the process. Presigned URLs are
 * returned as data: URLs of the form `data:<mime>;base64,<body>` so a caller
 * holding the URL can read the body, but only if they already have the URL.
 * This is sufficient for e2e tests and for the local docker-compose run.
 */

import type {
  ObjectStore,
  ObjectStoreEnv,
  ObjectStoreGetResult,
  ObjectStoreHeadResult,
  PresignedUrlOptions,
} from './types.js';

interface MemoryEntry {
  body: Uint8Array;
  contentType: string | null;
  metadata: Record<string, string>;
  lastModified: Date;
}

export class MemoryObjectStore implements ObjectStore {
  readonly backend = 'memory' as const;
  private readonly entries = new Map<string, MemoryEntry>();

  constructor(private readonly env: Pick<ObjectStoreEnv, 'OBJECT_STORE_BUCKET'>) {}

  async put(
    key: string,
    body: Uint8Array,
    opts: { contentType?: string; metadata?: Readonly<Record<string, string>> } = {},
  ): Promise<void> {
    const entry: MemoryEntry = {
      body: new Uint8Array(body),
      contentType: opts.contentType ?? 'application/octet-stream',
      metadata: { ...(opts.metadata ?? {}) },
      lastModified: new Date(),
    };
    this.entries.set(key, entry);
  }

  async get(key: string): Promise<ObjectStoreGetResult> {
    const entry = this.entries.get(key);
    if (!entry) throw new ObjectStoreKeyError(key, 'NoSuchKey');
    return {
      body: new Uint8Array(entry.body),
      contentType: entry.contentType,
      contentLength: entry.body.length,
      metadata: entry.metadata,
      etag: etagOf(entry.body),
      lastModified: entry.lastModified,
    };
  }

  async head(key: string): Promise<ObjectStoreHeadResult> {
    const entry = this.entries.get(key);
    if (!entry) throw new ObjectStoreKeyError(key, 'NoSuchKey');
    return {
      contentLength: entry.body.length,
      contentType: entry.contentType,
      metadata: entry.metadata,
      etag: etagOf(entry.body),
      lastModified: entry.lastModified,
    };
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.entries.has(key);
  }

  async presignGet(key: string, opts: PresignedUrlOptions = {}): Promise<string> {
    const entry = this.entries.get(key);
    if (!entry) throw new ObjectStoreKeyError(key, 'NoSuchKey');
    const expires = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? 900);
    const ct = opts.responseContentType ?? entry.contentType ?? 'application/octet-stream';
    const b64 = Buffer.from(entry.body).toString('base64');
    void expires; // documented via the URL comment below
    return `data:${ct};base64,${b64}#mock-signed-by=memory-bucket=${this.env.OBJECT_STORE_BUCKET}`;
  }

  async presignPut(key: string, opts: PresignedUrlOptions = {}): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? 900);
    return `data:application/octet-stream;base64,#mock-put-key=${encodeURIComponent(key)}&expires=${expires}`;
  }

  async list(
    prefix: string,
    opts: { maxKeys?: number; cursor?: string } = {},
  ): Promise<{ keys: readonly string[]; nextCursor: string | null }> {
    const all = [...this.entries.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = opts.cursor ? Number.parseInt(opts.cursor, 10) : 0;
    const limit = opts.maxKeys ?? 1000;
    const slice = all.slice(start, start + limit);
    const nextCursor = start + limit < all.length ? String(start + limit) : null;
    return { keys: slice, nextCursor };
  }
}

export class ObjectStoreKeyError extends Error {
  constructor(
    public readonly key: string,
    public readonly code: 'NoSuchKey' | 'AccessDenied',
  ) {
    super(`ObjectStore ${code}: ${key}`);
    this.name = 'ObjectStoreKeyError';
  }
}

/**
 * ETag: weak MD5-ish hash. We use a 32-bit FNV-1a because crypto.createHash
 * would pull in node:crypto for an in-memory adapter that doesn't need strong
 * collision resistance. Real adapters use the server's ETag.
 */
function etagOf(body: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body[i] ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return `"fnv1a-${(h >>> 0).toString(16).padStart(8, '0')}"`;
}
