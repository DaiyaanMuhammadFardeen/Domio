import { describe, it, expect } from 'vitest';
import {
  DocumentLoader,
  DocumentLoaderError,
  NoopDeckRepository,
  type DeckRepository,
} from './loader.js';
import { DECK_SCHEMA_VERSION, type DeckDocument, asULID } from '@domio/schema';

const DECK_ID = asULID('01H00000000000000000000000');
const WORKSPACE_ID = asULID('01H00000000000000000000001');

function baseDeck(): DeckDocument {
  return {
    schemaVersion: DECK_SCHEMA_VERSION,
    id: DECK_ID,
    tenantId: 'tenant-1',
    workspaceId: WORKSPACE_ID,
    title: 'Example',
    revision: 0,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [
      {
        id: asULID('01H00000000000000000000010'),
        semanticId: 'intro',
        position: 0,
        aspect: { ratioW: 16, ratioH: 9 },
        elements: [
          {
            id: asULID('01H00000000000000000000011'),
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
}

describe('DocumentLoader', () => {
  it('loads a deck via the repository', async () => {
    const repo: DeckRepository = new NoopDeckRepository();
    const loader = new DocumentLoader('tenant-1', { repository: repo });
    await loader.save(DECK_ID, baseDeck(), -1);
    const loaded = await loader.load(DECK_ID);
    expect(loaded.id).toBe(DECK_ID);
    expect(loaded.slides[0]?.elements).toHaveLength(1);
  });

  it('throws DECK_NOT_FOUND when the repository returns null', async () => {
    const loader = new DocumentLoader('tenant-1', { repository: new NoopDeckRepository() });
    await expect(loader.load(DECK_ID)).rejects.toMatchObject({
      code: 'DECK_NOT_FOUND',
    });
  });

  it('throws TENANT_MISMATCH when the document tenant does not match the loader', async () => {
    const loader = new DocumentLoader('tenant-1', { repository: new NoopDeckRepository() });
    const doc = { ...baseDeck(), tenantId: 'tenant-2' };
    await expect(loader.save(DECK_ID, doc, -1)).rejects.toBeInstanceOf(DocumentLoaderError);
    await expect(loader.save(DECK_ID, doc, -1)).rejects.toMatchObject({
      code: 'TENANT_MISMATCH',
    });
  });

  it('throws REVISION_CONFLICT on concurrent save with stale expectedRevision', async () => {
    const repo: DeckRepository = new NoopDeckRepository();
    const loader = new DocumentLoader('tenant-1', { repository: repo });
    await loader.save(DECK_ID, baseDeck(), -1);
    await expect(loader.save(DECK_ID, baseDeck(), -1)).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    const result = await loader.save(DECK_ID, baseDeck(), 0);
    expect(result.revision).toBe(1);
  });

  it('rejects payloads that exceed the 16 MB limit', async () => {
    const repo: DeckRepository = new NoopDeckRepository();
    const loader = new DocumentLoader('tenant-1', { repository: repo });
    const oversized = baseDeck();
    // Punch a hole that's large enough to push the JSON over the limit
    // without mutating the structural shape.
    (oversized as unknown as Record<string, unknown>).padding = 'x'.repeat(17 * 1024 * 1024);
    await expect(loader.save(DECK_ID, oversized, -1)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('rejects payloads that fail structural validation', async () => {
    const repo: DeckRepository = new NoopDeckRepository();
    const loader = new DocumentLoader('tenant-1', { repository: repo });
    const broken: DeckDocument = {
      ...baseDeck(),
      slides: [{ ...baseDeck().slides[0]!, id: asULID('not-a-ulid') }],
    };
    await expect(loader.save(DECK_ID, broken, -1)).rejects.toMatchObject({
      code: 'INVALID_SCHEMA',
    });
  });
});
