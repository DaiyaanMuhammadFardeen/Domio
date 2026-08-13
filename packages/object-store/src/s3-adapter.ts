/**
 * @domio/object-store — S3/MinIO HTTP adapter.
 *
 * Talks the S3 REST API over fetch. Works against AWS S3 and MinIO.
 * MinIO is configured by setting OBJECT_STORE_ENDPOINT to the MinIO host
 * (e.g. http://minio:9000) and OBJECT_STORE_FORCE_PATH_STYLE=true.
 *
 * We intentionally do not depend on @aws-sdk/client-s3 — the surface we
 * need (put/get/head/delete/exists/list/presign) is small enough that the
 * ~150 lines of fetch + SigV4 here replace ~3 MB of AWS SDK.
 */

import { signRequest, presignUrl } from './sigv4.js';
import type {
  ObjectStore,
  ObjectStoreEnv,
  ObjectStoreGetResult,
  ObjectStoreHeadResult,
  PresignedUrlOptions,
} from './types.js';
import { ObjectStoreKeyError } from './memory-adapter.js';

interface HttpResponse {
  status: number;
  body: Uint8Array;
  headers: Headers;
}

export interface S3AdapterOptions {
  readonly env: ObjectStoreEnv;
  readonly fetchImpl?: typeof fetch;
  /** Override the host (e.g. for tests against a local mock). */
  readonly hostOverride?: string;
}

export class S3Adapter implements ObjectStore {
  readonly backend: 's3' | 'minio';
  private readonly host: string;
  private readonly usePathStyle: boolean;
  private readonly useHttp: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: S3AdapterOptions) {
    const env = opts.env;
    this.backend = env.OBJECT_STORE === 's3' ? 's3' : 'minio';
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);

    if (env.OBJECT_STORE === 's3') {
      this.host = `${this.backend}.${env.OBJECT_STORE_REGION}.amazonaws.com`;
      this.usePathStyle = false;
      this.useHttp = false;
    } else {
      const endpoint = env.OBJECT_STORE_ENDPOINT ?? 'http://minio:9000';
      this.host = opts.hostOverride ?? new URL(endpoint).host;
      this.usePathStyle = (env.OBJECT_STORE_FORCE_PATH_STYLE ?? 'true') !== 'false';
      this.useHttp = new URL(endpoint).protocol === 'http:';
    }
  }

  async put(
    key: string,
    body: Uint8Array,
    opts: {
      contentType?: string;
      metadata?: Readonly<Record<string, string>>;
      cacheControl?: string;
    } = {},
  ): Promise<void> {
    const headers: Record<string, string> = {
      'content-type': opts.contentType ?? 'application/octet-stream',
      'content-length': String(body.byteLength),
    };
    if (opts.cacheControl) headers['cache-control'] = opts.cacheControl;
    for (const [k, v] of Object.entries(opts.metadata ?? {})) headers[`x-amz-meta-${k}`] = v;

    const signed = signRequest(
      {
        method: 'PUT',
        host: this.host,
        region: this.opts.env.OBJECT_STORE_REGION,
        service: 's3',
        path: this.objectPath(key),
        headers,
        body,
      },
      {
        accessKey: this.opts.env.OBJECT_STORE_ACCESS_KEY,
        secretKey: this.opts.env.OBJECT_STORE_SECRET_KEY,
      },
    );

    const res = await this.request(signed, body);
    if (res.status >= 300) {
      throw new ObjectStoreError(`S3 PUT ${key} failed: ${res.status}`, res.status);
    }
  }

  async get(key: string): Promise<ObjectStoreGetResult> {
    const signed = signRequest(
      {
        method: 'GET',
        host: this.host,
        region: this.opts.env.OBJECT_STORE_REGION,
        service: 's3',
        path: this.objectPath(key),
      },
      {
        accessKey: this.opts.env.OBJECT_STORE_ACCESS_KEY,
        secretKey: this.opts.env.OBJECT_STORE_SECRET_KEY,
      },
    );
    const res = await this.request(signed);
    if (res.status === 404) throw new ObjectStoreKeyError(key, 'NoSuchKey');
    if (res.status >= 300)
      throw new ObjectStoreError(`S3 GET ${key} failed: ${res.status}`, res.status);
    return {
      body: res.body,
      contentType: res.headers.get('content-type'),
      contentLength: Number.parseInt(
        res.headers.get('content-length') ?? `${res.body.byteLength}`,
        10,
      ),
      metadata: extractMetadata(res.headers),
      etag: res.headers.get('etag'),
      lastModified: parseHttpDate(res.headers.get('last-modified')),
    };
  }

  async head(key: string): Promise<ObjectStoreHeadResult> {
    const signed = signRequest(
      {
        method: 'HEAD',
        host: this.host,
        region: this.opts.env.OBJECT_STORE_REGION,
        service: 's3',
        path: this.objectPath(key),
      },
      {
        accessKey: this.opts.env.OBJECT_STORE_ACCESS_KEY,
        secretKey: this.opts.env.OBJECT_STORE_SECRET_KEY,
      },
    );
    const res = await this.request(signed);
    if (res.status === 404) throw new ObjectStoreKeyError(key, 'NoSuchKey');
    if (res.status >= 300)
      throw new ObjectStoreError(`S3 HEAD ${key} failed: ${res.status}`, res.status);
    return {
      contentLength: Number.parseInt(res.headers.get('content-length') ?? '0', 10),
      contentType: res.headers.get('content-type'),
      metadata: extractMetadata(res.headers),
      etag: res.headers.get('etag'),
      lastModified: parseHttpDate(res.headers.get('last-modified')),
    };
  }

  async delete(key: string): Promise<void> {
    const signed = signRequest(
      {
        method: 'DELETE',
        host: this.host,
        region: this.opts.env.OBJECT_STORE_REGION,
        service: 's3',
        path: this.objectPath(key),
      },
      {
        accessKey: this.opts.env.OBJECT_STORE_ACCESS_KEY,
        secretKey: this.opts.env.OBJECT_STORE_SECRET_KEY,
      },
    );
    const res = await this.request(signed);
    if (res.status >= 300 && res.status !== 404) {
      throw new ObjectStoreError(`S3 DELETE ${key} failed: ${res.status}`, res.status);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.head(key);
      return true;
    } catch (err) {
      if (err instanceof ObjectStoreKeyError) return false;
      throw err;
    }
  }

  async presignGet(key: string, opts: PresignedUrlOptions = {}): Promise<string> {
    const expires = opts.expiresInSeconds ?? 900;
    const headers: Record<string, string> = {};
    if (opts.responseContentType) headers['response-content-type'] = opts.responseContentType;
    if (opts.responseContentDisposition)
      headers['response-content-disposition'] = opts.responseContentDisposition;
    const { url } = presignUrl(
      {
        method: 'GET',
        host: this.host,
        region: this.opts.env.OBJECT_STORE_REGION,
        service: 's3',
        path: this.objectPath(key),
        query: headers,
      },
      {
        accessKey: this.opts.env.OBJECT_STORE_ACCESS_KEY,
        secretKey: this.opts.env.OBJECT_STORE_SECRET_KEY,
      },
      expires,
    );
    return this.prependScheme(url);
  }

  async presignPut(key: string, opts: PresignedUrlOptions = {}): Promise<string> {
    const expires = opts.expiresInSeconds ?? 900;
    const { url } = presignUrl(
      {
        method: 'PUT',
        host: this.host,
        region: this.opts.env.OBJECT_STORE_REGION,
        service: 's3',
        path: this.objectPath(key),
      },
      {
        accessKey: this.opts.env.OBJECT_STORE_ACCESS_KEY,
        secretKey: this.opts.env.OBJECT_STORE_SECRET_KEY,
      },
      expires,
    );
    return this.prependScheme(url);
  }

  async list(
    prefix: string,
    opts: { maxKeys?: number; cursor?: string } = {},
  ): Promise<{ keys: readonly string[]; nextCursor: string | null }> {
    const query: Record<string, string> = {
      'list-type': '2',
      prefix: prefix,
      'max-keys': String(opts.maxKeys ?? 1000),
    };
    if (opts.cursor) query['continuation-token'] = opts.cursor;

    const signed = signRequest(
      {
        method: 'GET',
        host: this.host,
        region: this.opts.env.OBJECT_STORE_REGION,
        service: 's3',
        path: '/',
        query,
      },
      {
        accessKey: this.opts.env.OBJECT_STORE_ACCESS_KEY,
        secretKey: this.opts.env.OBJECT_STORE_SECRET_KEY,
      },
    );
    const res = await this.request(signed);
    if (res.status >= 300)
      throw new ObjectStoreError(`S3 LIST ${prefix} failed: ${res.status}`, res.status);
    const xml = new TextDecoder().decode(res.body);
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1] ?? '');
    const nextToken =
      /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] ?? null;
    return { keys, nextCursor: nextToken };
  }

  private objectPath(key: string): string {
    const bucket = this.opts.env.OBJECT_STORE_BUCKET;
    return this.usePathStyle ? `/${bucket}/${encodeURI(key)}` : `/${encodeURI(key)}`;
  }

  private prependScheme(url: string): string {
    if (url.startsWith('http')) return url;
    return `${this.useHttp ? 'http' : 'https'}:${url}`;
  }

  private async request(
    req: ReturnType<typeof signRequest>,
    body?: Uint8Array,
  ): Promise<HttpResponse> {
    const scheme = this.useHttp ? 'http' : 'https';
    const url = `${scheme}://${req.host}${req.path}${req.query ? '?' + new URLSearchParams(req.query as Record<string, string>).toString() : ''}`;
    const init: globalThis.RequestInit = { method: req.method, headers: req.headers };
    if (req.method !== 'GET' && req.method !== 'HEAD' && body !== undefined) {
      (init as { body?: Uint8Array }).body = body;
    }
    const res = await this.fetchImpl(url, init);
    const buf = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, body: buf, headers: res.headers };
  }
}

export class ObjectStoreError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ObjectStoreError';
  }
}

function extractMetadata(headers: Headers): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    if (k.startsWith('x-amz-meta-')) out[k.slice('x-amz-meta-'.length)] = v;
  });
  return out;
}

function parseHttpDate(s: string | null): Date | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}
