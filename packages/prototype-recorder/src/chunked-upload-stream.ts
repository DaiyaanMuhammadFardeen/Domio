/**
 * Chunked upload stream — wraps an array of buffered events into 1 MB
 * chunks and POSTs them serially. Used by the recorder fallback path
 * when `navigator.sendBeacon` is unavailable.
 */

import type { RecorderEvent } from './types.js';

const DEFAULT_CHUNK_BYTES = 1 * 1024 * 1024;

export interface ChunkedUploadStreamOptions {
  readonly chunkBytes?: number;
  readonly fetchImpl?: typeof fetch;
  readonly headers?: Record<string, string>;
}

export class ChunkedUploadStream {
  private readonly chunkBytes: number;
  private readonly fetchImpl: typeof fetch;
  private readonly headers: Record<string, string>;
  private stats = { chunks: 0, bytesSent: 0, errors: 0 };

  constructor(opts: ChunkedUploadStreamOptions = {}) {
    this.chunkBytes = opts.chunkBytes ?? DEFAULT_CHUNK_BYTES;
    this.fetchImpl = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : (() => Promise.reject(new Error('no fetch'))) as typeof fetch);
    this.headers = opts.headers ?? { 'Content-Type': 'application/json' };
  }

  /**
   * Stream the events in chunks. Returns true if all chunks succeed.
   */
  async upload(url: string, events: readonly RecorderEvent[]): Promise<boolean> {
    const chunks = chunkByBytes(events, this.chunkBytes);
    for (const c of chunks) {
      const body = JSON.stringify({ events: c });
      const bytes = body.length * 2;
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          body,
          headers: this.headers,
        });
        if (!res.ok) {
          this.stats.errors += 1;
          return false;
        }
        this.stats.chunks += 1;
        this.stats.bytesSent += bytes;
      } catch {
        this.stats.errors += 1;
        return false;
      }
    }
    return true;
  }

  snapshot(): Readonly<{ chunks: number; bytesSent: number; errors: number }> {
    return { ...this.stats };
  }
}

function chunkByBytes(events: readonly RecorderEvent[], limit: number): RecorderEvent[][] {
  const out: RecorderEvent[][] = [];
  let current: RecorderEvent[] = [];
  let bytes = 0;
  for (const e of events) {
    const eBytes = JSON.stringify(e).length * 2 + 16; // brackets + comma
    if (bytes + eBytes > limit && current.length > 0) {
      out.push(current);
      current = [];
      bytes = 0;
    }
    current.push(e);
    bytes += eBytes;
  }
  if (current.length > 0) out.push(current);
  return out;
}
