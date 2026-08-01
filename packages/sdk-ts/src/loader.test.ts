import { describe, it, expect } from 'vitest';
import {
  HttpClientDocumentLoader,
  GeneratedIdempotencyKey,
  type HttpLikeTransport,
  type IdempotencyKeyProvider,
} from './loader.js';
import { DECK_SCHEMA_VERSION, type DeckDocument, asULID } from '@domio/schema';

const DECK_ID = asULID('01H00000000000000000000010');
const WORKSPACE_ID = asULID('01H00000000000000000000011');

const exampleDeck: DeckDocument = {
  schemaVersion: DECK_SCHEMA_VERSION,
  id: DECK_ID,
  tenantId: 'tenant-1',
  workspaceId: WORKSPACE_ID,
  title: 'Example',
  revision: 1,
  settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
  slides: [
    {
      id: asULID('01H00000000000000000000020'),
      semanticId: 'intro',
      position: 0,
      aspect: { ratioW: 16, ratioH: 9 },
      elements: [
        {
          id: asULID('01H00000000000000000000021'),
          semanticId: 'hero',
          type: 'frame',
          name: 'Hero',
          parentId: null,
          aspect: { ratioW: 16, ratioH: 9 },
        },
      ],
    },
  ],
};

class FakeTransport implements HttpLikeTransport {
  public posts: Array<{ url: string; body: unknown; headers?: Record<string, string> }> = [];
  public responses: Array<{ ok: boolean; status: number; body: unknown }> = [];

  constructor(
    private readonly getResponse: { ok: boolean; status: number; body: unknown },
  ) {}

  async get(_url: string): Promise<{ ok: boolean; status: number; body: unknown }> {
    return this.getResponse;
  }

  async post(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    if (headers) this.posts.push({ url, body, headers });
    else this.posts.push({ url, body });
    if (this.responses.length > 0) return this.responses.shift()!;
    return { ok: true, status: 200, body: { revision: 2 } };
  }
}

class StaticKeyProvider implements IdempotencyKeyProvider {
  constructor(private readonly keys: string[]) {}
  next(): string {
    const key = this.keys.shift();
    if (!key) throw new Error('exhausted');
    return key;
  }
}

describe('HttpClientDocumentLoader', () => {
  it('returns the typed document on a successful fetch', async () => {
    const transport = new FakeTransport({ ok: true, status: 200, body: exampleDeck });
    const loader = new HttpClientDocumentLoader('https://api.domio.test', transport);
    const doc = await loader.fetchDeck(DECK_ID);
    expect(doc).toEqual(exampleDeck);
  });

  it('throws DECK_NOT_FOUND on 404', async () => {
    const transport = new FakeTransport({ ok: false, status: 404, body: null });
    const loader = new HttpClientDocumentLoader('https://api.domio.test', transport);
    await expect(loader.fetchDeck(DECK_ID)).rejects.toMatchObject({
      code: 'DECK_NOT_FOUND',
    });
  });

  it('rejects a malformed server payload with INVALID_SCHEMA', async () => {
    const transport = new FakeTransport({ ok: true, status: 200, body: { nope: true } });
    const loader = new HttpClientDocumentLoader('https://api.domio.test', transport);
    await expect(loader.fetchDeck(DECK_ID)).rejects.toMatchObject({
      code: 'INVALID_SCHEMA',
    });
  });

  it('rejects when the server returns a different schemaVersion', async () => {
    const transport = new FakeTransport({
      ok: true,
      status: 200,
      body: { ...exampleDeck, schemaVersion: '2.0.0' },
    });
    const loader = new HttpClientDocumentLoader('https://api.domio.test', transport);
    await expect(loader.fetchDeck(DECK_ID)).rejects.toMatchObject({
      code: 'INVALID_SCHEMA',
    });
  });

  it('saves with an idempotency key and surfaces REVISION_CONFLICT', async () => {
    const transport = new FakeTransport({ ok: true, status: 200, body: exampleDeck });
    transport.responses.push({ ok: false, status: 409, body: null });
    const keys = new StaticKeyProvider(['idem-1']);
    const loader = new HttpClientDocumentLoader(
      'https://api.domio.test',
      transport,
      keys,
    );
    await expect(loader.saveDeck(exampleDeck, 1)).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    expect(transport.posts[0]?.headers?.['Idempotency-Key']).toBe('idem-1');
    expect(transport.posts[0]?.url).toBe(`https://api.domio.test/v1/decks/${DECK_ID}/schema`);
  });

  it('rejects payloads that fail client-side validation', async () => {
    const transport = new FakeTransport({ ok: true, status: 200, body: exampleDeck });
    const loader = new HttpClientDocumentLoader('https://api.domio.test', transport);
    const bad = { ...exampleDeck, slides: [] } as DeckDocument;
    await expect(loader.saveDeck(bad, 0)).rejects.toMatchObject({
      code: 'INVALID_SCHEMA',
    });
    expect(transport.posts.length).toBe(0);
  });

  it('surfaces PAYLOAD_TOO_LARGE on 413', async () => {
    const transport = new FakeTransport({ ok: true, status: 200, body: exampleDeck });
    transport.responses.push({ ok: false, status: 413, body: null });
    const loader = new HttpClientDocumentLoader('https://api.domio.test', transport);
    await expect(loader.saveDeck(exampleDeck, 0)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('returns the new revision on success', async () => {
    const transport = new FakeTransport({
      ok: true,
      status: 200,
      body: exampleDeck,
    });
    transport.responses.push({
      ok: true,
      status: 200,
      body: { revision: 7, warnings: [{ code: 'auto_layout_unused', path: '', message: 'ok' }] },
    });
    const loader = new HttpClientDocumentLoader(
      'https://api.domio.test',
      transport,
      new StaticKeyProvider(['idem-1']),
    );
    const result = await loader.saveDeck(exampleDeck, 1);
    expect(result.revision).toBe(7);
    expect(result.warnings).toHaveLength(1);
  });
});

describe('GeneratedIdempotencyKey', () => {
  it('produces a new token each call', () => {
    const k = new GeneratedIdempotencyKey();
    const a = k.next();
    const b = k.next();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});