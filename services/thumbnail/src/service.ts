/**
 * @domio/thumbnail — orchestration service.
 *
 * Public API:
 *   - getOrRender: cache lookup → render on miss → cache write →
 *                  return a CDN-signed URL.
 *   - search:      scan an in-memory title index, return matching slide
 *                  ids within the 100 ms budget (linear scan is fine for
 *                  ≤500 slides).
 *   - invalidate:  drop cached thumbs for a deck or a deck-version.
 *   - batchGet:    get N refs in one round-trip — used by the jump grid
 *                  hydration.
 *
 * The URL builder takes a base URL (CDN host) plus an HMAC signature
 * derived from (workspace_id, deck_version_id, slide_id, size, expiry).
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type {
  RenderInput,
  ThumbnailRecord,
  ThumbnailRef,
  ThumbnailSize,
} from './types.js';
import {
  THUMBNAIL_SIZES,
  ThumbnailRenderError,
} from './types.js';
import type { ThumbnailCache } from './cache.js';
import type { RenderProducer } from './render.js';

export interface ThumbnailServiceOptions {
  readonly cache: ThumbnailCache;
  readonly producer: RenderProducer;
  readonly clock?: (() => number) | undefined;
  /** Base URL for the CDN — e.g. https://cdn.domio.app/thumbs. */
  readonly cdnBaseUrl?: string;
  /** HMAC key used to sign CDN URLs (32 bytes). Optional — when absent,
   *  URLs are returned unsigned (development mode). */
  readonly cdnSignKey?: Uint8Array;
  /** Default URL TTL in ms (default: 1 hour). */
  readonly urlTtlMs?: number;
  /** Optional in-memory title index — used by search(). */
  readonly titleIndex?: TitleIndex | undefined;
}

export interface TitleIndexEntry {
  slide_id: string;
  title: string;
  /** Lowercase tokens derived from title for fast prefix search. */
  tokens: string[];
}

export class TitleIndex {
  private readonly entries: TitleIndexEntry[] = [];
  private byId = new Map<string, TitleIndexEntry>();

  set(entries: TitleIndexEntry[]): void {
    this.entries.length = 0;
    this.byId.clear();
    for (const e of entries) {
      this.entries.push(e);
      this.byId.set(e.slide_id, e);
    }
  }

  put(entry: TitleIndexEntry): void {
    if (!this.byId.has(entry.slide_id)) this.entries.push(entry);
    this.byId.set(entry.slide_id, entry);
  }

  get(slide_id: string): TitleIndexEntry | null {
    return this.byId.get(slide_id) ?? null;
  }

  /** Substring match — returns ids in original order. Case-insensitive. */
  search(query: string, limit = 50): string[] {
    if (!query) return this.entries.slice(0, limit).map((e) => e.slide_id);
    const needle = query.toLowerCase();
    const out: string[] = [];
    for (const e of this.entries) {
      if (e.tokens.some((t) => t.includes(needle))) {
        out.push(e.slide_id);
        if (out.length >= limit) break;
      }
    }
    return out;
  }
}

export class ThumbnailService {
  private readonly cache: ThumbnailCache;
  private readonly producer: RenderProducer;
  private readonly clock: () => number;
  private readonly cdnBaseUrl: string;
  private readonly cdnSignKey: Uint8Array | undefined;
  private readonly urlTtlMs: number;
  private readonly titleIndex: TitleIndex | undefined;

  constructor(opts: ThumbnailServiceOptions) {
    if (!opts.cache) throw new Error('ThumbnailService: cache is required');
    if (!opts.producer) throw new Error('ThumbnailService: producer is required');
    this.cache = opts.cache;
    this.producer = opts.producer;
    this.clock = opts.clock ?? (() => Date.now());
    this.cdnBaseUrl = opts.cdnBaseUrl ?? 'https://cdn.domio.app/thumbs';
    this.cdnSignKey = opts.cdnSignKey;
    this.urlTtlMs = opts.urlTtlMs ?? 60 * 60 * 1000;
    this.titleIndex = opts.titleIndex;
  }

  // -------------------------------------------------------------------------
  // getOrRender — the hot path for the jump grid
  // -------------------------------------------------------------------------

  async getOrRender(input: RenderInput): Promise<ThumbnailRef> {
    const cached = await this.cache.get({
      deck_version_id: input.deck_version_id,
      slide_id: input.slide_id,
      size: input.size,
    });
    let record: ThumbnailRecord;
    if (cached) {
      record = cached;
    } else {
      record = await this.renderAndCache(input);
    }
    return this.toRef(record);
  }

  /** Render a fresh thumbnail even if a cached one exists. Used by the
   *  pre-generation job triggered on deck.updated. */
  async render(input: RenderInput): Promise<ThumbnailRef> {
    const record = await this.renderAndCache(input);
    return this.toRef(record);
  }

  private async renderAndCache(input: RenderInput): Promise<ThumbnailRecord> {
    const rendered = await this.producer.render(input);
    const record: ThumbnailRecord = {
      workspace_id: input.workspace_id,
      deck_id: input.deck_id,
      deck_version_id: input.deck_version_id,
      slide_id: input.slide_id,
      size: input.size,
      bytes: rendered.bytes,
      content_type: rendered.content_type,
      rendered_at_ms: this.clock(),
      source_hash: rendered.source_hash,
    };
    await this.cache.put(record);
    return record;
  }

  // -------------------------------------------------------------------------
  // batchGet — used by the jump-grid hydration
  // -------------------------------------------------------------------------

  async batchGet(args: {
    workspace_id: string;
    deck_id: string;
    deck_version_id: string;
    slide_ids: string[];
    size: ThumbnailSize;
  }): Promise<ThumbnailRef[]> {
    const out: ThumbnailRef[] = [];
    for (const slide_id of args.slide_ids) {
      try {
        const ref = await this.getOrRender({
          workspace_id: args.workspace_id,
          deck_id: args.deck_id,
          deck_version_id: args.deck_version_id,
          slide_id,
          size: args.size,
          scene_graph: { slide_id },
        });
        out.push(ref);
      } catch (e) {
        if (e instanceof ThumbnailRenderError) continue;
        throw e;
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // search
  // -------------------------------------------------------------------------

  search(query: string, limit?: number): string[] {
    if (!this.titleIndex) return [];
    return this.titleIndex.search(query, limit);
  }

  // -------------------------------------------------------------------------
  // invalidate
  // -------------------------------------------------------------------------

  async invalidate(args: { deck_id?: string; deck_version_id?: string }): Promise<void> {
    await this.cache.invalidate(args);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private toRef(record: ThumbnailRecord): ThumbnailRef {
    const spec = THUMBNAIL_SIZES[record.size];
    if (!spec) throw new ThumbnailRenderError(`unknown size: ${record.size}`);
    const url = this.buildUrl(record);
    return {
      workspace_id: record.workspace_id,
      deck_id: record.deck_id,
      deck_version_id: record.deck_version_id,
      slide_id: record.slide_id,
      size: record.size,
      url,
      content_type: record.content_type,
      width: spec.width,
      height: spec.height,
      rendered_at_ms: record.rendered_at_ms,
    };
  }

  private buildUrl(record: ThumbnailRecord): string {
    const expires = this.clock() + this.urlTtlMs;
    const base = `${this.cdnBaseUrl}/${record.workspace_id}/${record.deck_id}/${record.deck_version_id}/${record.slide_id}/${record.size}`;
    if (!this.cdnSignKey) return `${base}?expires=${expires}`;
    const sig = this.signUrl(record, expires);
    return `${base}?expires=${expires}&sig=${sig}`;
  }

  private signUrl(record: ThumbnailRecord, expires: number): string {
    if (!this.cdnSignKey) return '';
    const msg = [
      record.workspace_id,
      record.deck_id,
      record.deck_version_id,
      record.slide_id,
      record.size,
      String(expires),
    ].join('\n');
    return createHmac('sha256', Buffer.from(this.cdnSignKey))
      .update(msg)
      .digest('hex');
  }
}

/** Helper for the URL signer — used by the gateway to verify CDN
 *  signatures without re-rendering. */
export function verifyCdnSignature(args: {
  key: Uint8Array;
  workspace_id: string;
  deck_id: string;
  deck_version_id: string;
  slide_id: string;
  size: ThumbnailSize;
  expires: number;
  signature: string;
  now_ms?: number;
}): { ok: boolean; reason?: string } {
  if (args.expires < (args.now_ms ?? Date.now())) {
    return { ok: false, reason: 'expired' };
  }
  const msg = [
    args.workspace_id,
    args.deck_id,
    args.deck_version_id,
    args.slide_id,
    args.size,
    String(args.expires),
  ].join('\n');
  const expected = createHmac('sha256', Buffer.from(args.key))
    .update(msg)
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  let b: Buffer;
  try {
    b = Buffer.from(args.signature, 'hex');
  } catch {
    return { ok: false, reason: 'malformed signature' };
  }
  if (a.length !== b.length) return { ok: false, reason: 'signature length mismatch' };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}

/** Stable hash of a scene-graph for invalidation checks. */
export function sceneGraphHash(scene_graph: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(scene_graph)).digest('hex');
}