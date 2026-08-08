/**
 * @domio/thumbnail — in-memory cache.
 *
 * Production uses CDN-backed storage; this is a single-process cache for
 * tests/dev. The cache key is the (deck_version_id, slide_id, size)
 * triple — the version aspect guarantees correct hits even when slide
 * content mutates across versions.
 */

import type { ThumbnailRecord } from './types.js';

export interface ThumbnailCache {
  get(args: {
    deck_version_id: string;
    slide_id: string;
    size: string;
  }): Promise<ThumbnailRecord | null>;
  put(record: ThumbnailRecord): Promise<void>;
  invalidate(args: { deck_version_id?: string; deck_id?: string }): Promise<void>;
}

export class InMemoryThumbnailCache implements ThumbnailCache {
  private readonly entries = new Map<string, ThumbnailRecord>();

  private key(deck_version_id: string, slide_id: string, size: string): string {
    return `${deck_version_id}::${slide_id}::${size}`;
  }

  async get(args: { deck_version_id: string; slide_id: string; size: string }): Promise<ThumbnailRecord | null> {
    return this.entries.get(this.key(args.deck_version_id, args.slide_id, args.size)) ?? null;
  }

  async put(record: ThumbnailRecord): Promise<void> {
    this.entries.set(
      this.key(record.deck_version_id, record.slide_id, record.size),
      record,
    );
  }

  async invalidate(args: { deck_version_id?: string; deck_id?: string }): Promise<void> {
    if (args.deck_version_id) {
      const prefix = `${args.deck_version_id}::`;
      for (const k of [...this.entries.keys()]) {
        if (k.startsWith(prefix)) this.entries.delete(k);
      }
    }
    if (args.deck_id) {
      for (const [k, v] of this.entries) {
        if (v.deck_id === args.deck_id) this.entries.delete(k);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

/** A null cache — every render is forced. */
export class NullThumbnailCache implements ThumbnailCache {
  async get(): Promise<ThumbnailRecord | null> { return null; }
  async put(): Promise<void> { /* no-op */ }
  async invalidate(): Promise<void> { /* no-op */ }
}