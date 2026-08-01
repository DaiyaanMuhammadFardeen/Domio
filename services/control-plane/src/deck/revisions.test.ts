import { describe, it, expect } from 'vitest';
import { asULID } from '@domio/schema';
import type { DeckDocument } from '@domio/schema';
import {
  InMemoryRevisionRepository,
  RevisionConflictError,
  RevisionService,
} from './revisions.js';

const deck: DeckDocument = {
  schemaVersion: '1.0.0',
  id: asULID('01H00000000000000000000000'),
  tenantId: 'tenant',
  workspaceId: asULID('01H00000000000000000000001'),
  title: 'fixture',
  revision: 1,
  settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
  slides: [
    {
      id: asULID('01H00000000000000000000002'),
      semanticId: 'intro',
      position: 0,
      aspect: { ratioW: 16, ratioH: 9 },
      elements: [],
    },
  ],
};

describe('RevisionService', () => {
  it('returns 0 for an unseen (deck, branch)', async () => {
    const repo = new InMemoryRevisionRepository();
    const svc = new RevisionService(repo);
    expect(
      await svc.head(asULID('01H000000000000000000000A0'), 'main'),
    ).toBe(0);
  });

  it('bumps the head revision monotonically per branch', async () => {
    const repo = new InMemoryRevisionRepository();
    const svc = new RevisionService(repo);
    const deckId = asULID('01H000000000000000000000A0');
    await svc.bump({ deckId, branchId: 'main', expectedRevision: 0 });
    const next = await svc.bump({ deckId, branchId: 'main', expectedRevision: 1 });
    expect(next.revision).toBe(2);
  });

  it('isolates branches', async () => {
    const repo = new InMemoryRevisionRepository();
    const svc = new RevisionService(repo);
    const deckId = asULID('01H000000000000000000000A0');
    await svc.bump({ deckId, branchId: 'main', expectedRevision: 0 });
    const featureA = await svc.bump({ deckId, branchId: 'feature/a', expectedRevision: 0 });
    expect(featureA.revision).toBe(1);
    expect(await svc.head(deckId, 'main')).toBe(1);
    expect(await svc.head(deckId, 'feature/a')).toBe(1);
  });

  it('throws RevisionConflictError on optimistic-lock mismatch', async () => {
    const repo = new InMemoryRevisionRepository();
    const svc = new RevisionService(repo);
    const deckId = asULID('01H000000000000000000000A0');
    await svc.bump({ deckId, branchId: 'main', expectedRevision: 0 });
    await expect(
      svc.bump({ deckId, branchId: 'main', expectedRevision: 99 }),
    ).rejects.toBeInstanceOf(RevisionConflictError);
  });

  it('applyVersioning is a no-op for current-version documents', () => {
    const repo = new InMemoryRevisionRepository();
    const svc = new RevisionService(repo);
    const out = svc.applyVersioning(deck);
    expect(out).toBe(deck);
  });

  it('records the schema version on each bump', async () => {
    const repo = new InMemoryRevisionRepository();
    const svc = new RevisionService(repo, '1.4.0');
    const deckId = asULID('01H000000000000000000000A0');
    const next = await svc.bump({ deckId, branchId: 'main', expectedRevision: 0 });
    expect(next.schemaVersion).toBe('1.4.0');
  });
});
