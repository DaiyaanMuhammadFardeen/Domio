/**
 * @domio/object-store — type definitions.
 *
 * The ObjectStore interface abstracts S3-compatible storage so the rest of
 * the platform can target MinIO locally and AWS S3 in prod without changes.
 *
 * Every method is async; every method takes a `key` (object-store key, not
 * a URL). The store is responsible for URL signing and endpoint routing.
 */

export interface ObjectStorePutOptions {
  readonly contentType?: string;
  readonly contentEncoding?: string;
  readonly cacheControl?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  /** Pre-computed SHA-256 of the body (hex). Stored as object metadata. */
  readonly sha256?: string;
}

export interface ObjectStoreGetResult {
  readonly body: Uint8Array;
  readonly contentType: string | null;
  readonly contentLength: number;
  readonly metadata: Readonly<Record<string, string>>;
  readonly etag: string | null;
  readonly lastModified: Date | null;
}

export interface ObjectStoreHeadResult {
  readonly contentLength: number;
  readonly contentType: string | null;
  readonly metadata: Readonly<Record<string, string>>;
  readonly etag: string | null;
  readonly lastModified: Date | null;
}

export interface PresignedUrlOptions {
  /** Seconds until URL expiry. Default 900 (15 min). */
  readonly expiresInSeconds?: number;
  /** Override content-type for the response. */
  readonly responseContentType?: string;
  /** Override content-disposition for the response (e.g. attachment; filename=…). */
  readonly responseContentDisposition?: string;
}

export interface ObjectStore {
  readonly backend: 's3' | 'minio' | 'memory';
  put(key: string, body: Uint8Array, opts?: ObjectStorePutOptions): Promise<void>;
  get(key: string): Promise<ObjectStoreGetResult>;
  head(key: string): Promise<ObjectStoreHeadResult>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  presignGet(key: string, opts?: PresignedUrlOptions): Promise<string>;
  presignPut(key: string, opts?: PresignedUrlOptions): Promise<string>;
  list(prefix: string, opts?: { readonly maxKeys?: number; readonly cursor?: string }): Promise<{
    readonly keys: readonly string[];
    readonly nextCursor: string | null;
  }>;
}

/** Required environment variables for any real (S3/MinIO) backend. */
export interface ObjectStoreEnv {
  readonly OBJECT_STORE: 'minio' | 's3' | 'memory';
  readonly OBJECT_STORE_BUCKET: string;
  readonly OBJECT_STORE_REGION: string;
  readonly OBJECT_STORE_ENDPOINT?: string;
  readonly OBJECT_STORE_ACCESS_KEY: string;
  readonly OBJECT_STORE_SECRET_KEY: string;
  readonly OBJECT_STORE_FORCE_PATH_STYLE?: string;
}

/**
 * Storage key layout (locked at the package layer so all callers agree):
 *   <workspace_id>/<bucket>/<recording_session_id>/<track_kind>/<sequence>.<ext>
 *
 * Examples:
 *   ws-abc/recordings/sess-001/screen/00001.mp4
 *   ws-abc/recordings/sess-001/mic/00001.webm
 *   ws-abc/recordings/sess-001/captions/en/00001.vtt
 *   ws-abc/clips/clip-001/segments/00001.mp4
 */
export interface KeyLayout {
  readonly workspace_id: string;
  readonly bucket: 'recordings' | 'clips' | 'scorm' | 'replays' | 'thumbnails';
  readonly session_id: string;
  readonly track_kind: string;
  readonly sequence: number | string;
  readonly extension: string;
}