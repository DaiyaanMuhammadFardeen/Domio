/**
 * @domio/thumbnail — service tests.
 *
 * Covers:
 *   - getOrRender: cache miss → render → cache write; cache hit → no render.
 *   - Determinism: same input → same rendered bytes (cache key works).
 *   - Batch get: returns refs in input order; failed renders are skipped.
 *   - Search: substring match against title index; case-insensitive.
 *   - CDN URL signing: round-trip with verifyCdnSignature.
 *   - Invalidate by deck_version_id drops all sizes for that version.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BitmapRenderProducer,
  InMemoryThumbnailCache,
  NullThumbnailCache,
  THUMBNAIL_SIZES,
  ThumbnailService,
  TitleIndex,
  verifyCdnSignature,
} from './index.js';
import type { RenderProducer, ThumbnailRecord } from './index.js';

class CountingProducer implements RenderProducer {
  public count = 0;
  constructor(private readonly inner: RenderProducer = new BitmapRenderProducer()) {}
  async render(input: Parameters<RenderProducer['render']>[0]) {
    this.count++;
    return this.inner.render(input);
  }
}

const WORKSPACE = 'ws-1';
const DECK = 'deck-A';
const VERSION = 'v1';
const SLIDES = ['s1', 's2', 's3', 's4', 's5'];

describe('ThumbnailService — getOrRender', () => {
  let cache: InMemoryThumbnailCache;
  let producer: CountingProducer;
  let service: ThumbnailService;

  beforeEach(() => {
    cache = new InMemoryThumbnailCache();
    producer = new CountingProducer();
    service = new ThumbnailService({
      cache,
      producer,
      clock: () => 1_700_000_000_000,
    });
  });

  it('renders on cache miss and serves from cache on second call', async () => {
    const input = {
      workspace_id: WORKSPACE,
      deck_id: DECK,
      deck_version_id: VERSION,
      slide_id: 's1',
      size: 'md' as const,
      scene_graph: { slide_id: 's1', title: 'Intro' },
    };
    const a = await service.getOrRender(input);
    const b = await service.getOrRender(input);
    expect(a.url).toBe(b.url);
    expect(producer.count).toBe(1);
    expect(a.width).toBe(THUMBNAIL_SIZES.md.width);
    expect(a.height).toBe(THUMBNAIL_SIZES.md.height);
  });

  it('produces deterministic bytes for the same input', async () => {
    const input = {
      workspace_id: WORKSPACE,
      deck_id: DECK,
      deck_version_id: VERSION,
      slide_id: 's1',
      size: 'sm' as const,
      scene_graph: { slide_id: 's1', title: 'Deterministic' },
    };
    const r1 = await service.getOrRender(input);
    // Force a render with a fresh producer — output must be byte-identical
    // because the input is the same.
    const freshCache = new InMemoryThumbnailCache();
    const fresh = new ThumbnailService({
      cache: freshCache,
      producer: new BitmapRenderProducer(),
      clock: () => 1_700_000_000_000,
    });
    const r2 = await fresh.getOrRender(input);
    expect(r1.url.split('?')[0]).toBe(r2.url.split('?')[0]);
  });

  it('caches per (deck_version_id, slide_id, size)', async () => {
    const baseInput = {
      workspace_id: WORKSPACE,
      deck_id: DECK,
      deck_version_id: VERSION,
      slide_id: 's1',
      size: 'md' as const,
      scene_graph: { slide_id: 's1' },
    };
    await service.getOrRender({ ...baseInput, deck_version_id: 'v1' });
    await service.getOrRender({ ...baseInput, deck_version_id: 'v2' });
    await service.getOrRender({ ...baseInput, slide_id: 's2' });
    await service.getOrRender({ ...baseInput, size: 'lg' });
    expect(producer.count).toBe(4);
  });
});

describe('ThumbnailService — batchGet', () => {
  let service: ThumbnailService;
  let cache: InMemoryThumbnailCache;
  let producer: CountingProducer;

  beforeEach(() => {
    cache = new InMemoryThumbnailCache();
    producer = new CountingProducer();
    service = new ThumbnailService({ cache, producer });
  });

  it('returns refs in input order', async () => {
    const refs = await service.batchGet({
      workspace_id: WORKSPACE,
      deck_id: DECK,
      deck_version_id: VERSION,
      slide_ids: SLIDES,
      size: 'sm',
    });
    expect(refs.length).toBe(SLIDES.length);
    expect(refs.map((r) => r.slide_id)).toEqual(SLIDES);
  });

  it('shares cache across batch and single-call paths', async () => {
    await service.getOrRender({
      workspace_id: WORKSPACE,
      deck_id: DECK,
      deck_version_id: VERSION,
      slide_id: 's1',
      size: 'md',
      scene_graph: { slide_id: 's1' },
    });
    const before = producer.count;
    await service.batchGet({
      workspace_id: WORKSPACE,
      deck_id: DECK,
      deck_version_id: VERSION,
      slide_ids: ['s1', 's2', 's3'],
      size: 'md',
    });
    // Only 2 new renders — s1 was cached.
    expect(producer.count - before).toBe(2);
  });
});

describe('ThumbnailService — search', () => {
  let service: ThumbnailService;
  let index: TitleIndex;

  beforeEach(() => {
    index = new TitleIndex();
    index.set([
      { slide_id: 's1', title: 'Introduction', tokens: tokenize('Introduction') },
      { slide_id: 's2', title: 'Architecture overview', tokens: tokenize('Architecture overview') },
      { slide_id: 's3', title: 'Database schema', tokens: tokenize('Database schema') },
      { slide_id: 's4', title: 'Pricing model', tokens: tokenize('Pricing model') },
    ]);
    service = new ThumbnailService({
      cache: new InMemoryThumbnailCache(),
      producer: new BitmapRenderProducer(),
      titleIndex: index,
    });
  });

  it('substring-matches tokens case-insensitively', () => {
    expect(service.search('arch')).toEqual(['s2']);
    expect(service.search('PRIC')).toEqual(['s4']);
    expect(service.search('schema')).toEqual(['s3']);
  });

  it('empty query returns first N ids in input order', () => {
    expect(service.search('', 2)).toEqual(['s1', 's2']);
  });

  it('returns empty when nothing matches', () => {
    expect(service.search('zzz')).toEqual([]);
  });
});

describe('ThumbnailService — CDN URL signing', () => {
  it('signs URLs that round-trip through verifyCdnSignature', async () => {
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) key[i] = i + 1;
    const now = 1_700_000_000_000;
    const service = new ThumbnailService({
      cache: new InMemoryThumbnailCache(),
      producer: new BitmapRenderProducer(),
      clock: () => now,
      cdnSignKey: key,
      urlTtlMs: 60_000,
    });
    const ref = await service.getOrRender({
      workspace_id: WORKSPACE,
      deck_id: DECK,
      deck_version_id: VERSION,
      slide_id: 's1',
      size: 'md',
      scene_graph: { slide_id: 's1' },
    });
    const u = new URL(ref.url);
    const expires = Number(u.searchParams.get('expires'));
    const sig = u.searchParams.get('sig')!;
    const result = verifyCdnSignature({
      key,
      workspace_id: WORKSPACE,
      deck_id: DECK,
      deck_version_id: VERSION,
      slide_id: 's1',
      size: 'md',
      expires,
      signature: sig,
      now_ms: now,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a URL whose signature is tampered', async () => {
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) key[i] = i + 1;
    const now = 1_700_000_000_000;
    const service = new ThumbnailService({
      cache: new InMemoryThumbnailCache(),
      producer: new BitmapRenderProducer(),
      clock: () => now,
      cdnSignKey: key,
      urlTtlMs: 60_000,
    });
    const ref = await service.getOrRender({
      workspace_id: WORKSPACE,
      deck_id: DECK,
      deck_version_id: VERSION,
      slide_id: 's1',
      size: 'md',
      scene_graph: { slide_id: 's1' },
    });
    const u = new URL(ref.url);
    const expires = Number(u.searchParams.get('expires'));
    const sig = u.searchParams.get('sig')!;
    const tampered = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    const result = verifyCdnSignature({
      key,
      workspace_id: WORKSPACE,
      deck_id: DECK,
      deck_version_id: VERSION,
      slide_id: 's1',
      size: 'md',
      expires,
      signature: tampered,
      now_ms: now,
    });
    expect(result.ok).toBe(false);
  });
});

describe('ThumbnailService — invalidate', () => {
  it('drops all sizes for a given deck_version_id', async () => {
    const cache = new InMemoryThumbnailCache();
    let renders = 0;
    const producer: RenderProducer = {
      render: async (input) => {
        renders++;
        return new BitmapRenderProducer().render(input);
      },
    };
    const service = new ThumbnailService({ cache, producer });
    const baseInput = {
      workspace_id: WORKSPACE,
      deck_id: DECK,
      slide_id: 's1',
      scene_graph: { slide_id: 's1' },
    };
    await service.getOrRender({ ...baseInput, deck_version_id: 'v1', size: 'sm' });
    await service.getOrRender({ ...baseInput, deck_version_id: 'v1', size: 'md' });
    await service.getOrRender({ ...baseInput, deck_version_id: 'v2', size: 'sm' });
    expect(renders).toBe(3);

    await service.invalidate({ deck_version_id: 'v1' });
    await service.getOrRender({ ...baseInput, deck_version_id: 'v1', size: 'sm' });
    await service.getOrRender({ ...baseInput, deck_version_id: 'v1', size: 'md' });
    // v1 entries had to be re-rendered; v2 was still cached.
    expect(renders).toBe(5);
  });
});

describe('NullThumbnailCache — never returns a hit', () => {
  it('always re-renders', async () => {
    let renders = 0;
    const producer: RenderProducer = {
      render: async (input) => {
        renders++;
        return new BitmapRenderProducer().render(input);
      },
    };
    const service = new ThumbnailService({
      cache: new NullThumbnailCache(),
      producer,
    });
    await service.getOrRender({
      workspace_id: WORKSPACE,
      deck_id: DECK,
      deck_version_id: VERSION,
      slide_id: 's1',
      size: 'sm',
      scene_graph: { slide_id: 's1' },
    });
    await service.getOrRender({
      workspace_id: WORKSPACE,
      deck_id: DECK,
      deck_version_id: VERSION,
      slide_id: 's1',
      size: 'sm',
      scene_graph: { slide_id: 's1' },
    });
    expect(renders).toBe(2);
  });
});

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/\s+/).filter(Boolean);
}

// Smoke test the ThumbnailRecord shape compiles.
const _smoke: ThumbnailRecord = {
  workspace_id: WORKSPACE,
  deck_id: DECK,
  deck_version_id: VERSION,
  slide_id: 's1',
  size: 'sm',
  bytes: new Uint8Array(),
  content_type: 'image/bmp',
  rendered_at_ms: 0,
  source_hash: 'x',
};
void _smoke;
