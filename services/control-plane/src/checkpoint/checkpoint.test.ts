import { describe, it, expect } from 'vitest';
import { asULID, type ULID } from '@domio/schema';
import {
  CheckpointService,
  InMemoryCheckpointRepository,
  CheckpointAlreadyExistsError,
  CheckpointNotFoundError,
  InvalidCheckpointNameError,
} from './index.js';

const DECK_ID = asULID('01H00000000000000000000000');

function ids(): () => ULID {
  let n = 1;
  return () => asULID(`01H0000000000000000000000${n++}`);
}

describe('CheckpointService', () => {
  it('creates a named checkpoint with revision and actor', async () => {
    const svc = new CheckpointService(
      undefined,
      undefined,
      ids(),
      () => new Date('2026-04-01T00:00:00Z'),
    );
    const cp = await svc.create({
      deckId: DECK_ID,
      branchId: 'main',
      name: 'v1.0',
      revision: 7,
      actorId: 'user-1',
    });
    expect(cp.kind).toBe('named');
    expect(cp.revision).toBe(7);
    expect(cp.branchId).toBe('main');
    expect(cp.createdBy).toBe('user-1');
  });

  it('rejects duplicate names on the same branch', async () => {
    const svc = new CheckpointService(undefined, undefined, ids());
    await svc.create({
      deckId: DECK_ID,
      branchId: 'main',
      name: 'duplicate',
      revision: 1,
      actorId: 'u',
    });
    await expect(
      svc.create({
        deckId: DECK_ID,
        branchId: 'main',
        name: 'duplicate',
        revision: 2,
        actorId: 'u',
      }),
    ).rejects.toBeInstanceOf(CheckpointAlreadyExistsError);
  });

  it('rejects invalid names', async () => {
    const svc = new CheckpointService();
    await expect(
      svc.create({
        deckId: DECK_ID,
        branchId: 'main',
        name: '',
        revision: 1,
        actorId: 'u',
      }),
    ).rejects.toBeInstanceOf(InvalidCheckpointNameError);
    await expect(
      svc.create({
        deckId: DECK_ID,
        branchId: 'main',
        name: 'no!special',
        revision: 1,
        actorId: 'u',
      }),
    ).rejects.toBeInstanceOf(InvalidCheckpointNameError);
  });

  it('renames a checkpoint', async () => {
    const svc = new CheckpointService(undefined, undefined, ids());
    const cp = await svc.create({
      deckId: DECK_ID,
      branchId: 'main',
      name: 'original',
      revision: 1,
      actorId: 'u',
    });
    const renamed = await svc.rename(DECK_ID, cp.id, 'renamed');
    expect(renamed.name).toBe('renamed');
  });

  it('rejects rename that collides with existing name', async () => {
    const svc = new CheckpointService(undefined, undefined, ids());
    const a = await svc.create({
      deckId: DECK_ID,
      branchId: 'main',
      name: 'A',
      revision: 1,
      actorId: 'u',
    });
    await svc.create({
      deckId: DECK_ID,
      branchId: 'main',
      name: 'B',
      revision: 2,
      actorId: 'u',
    });
    await expect(svc.rename(DECK_ID, a.id, 'B')).rejects.toBeInstanceOf(
      CheckpointAlreadyExistsError,
    );
  });

  it('restore advances the branch head when branch service is bound', async () => {
    const repo = new InMemoryCheckpointRepository();
    const branchSvc = {
      get: async () => ({ id: asULID('01H00000000000000000000000B'), headRevision: 5 }),
      advanceHead: async () => ({
        id: asULID('01H00000000000000000000000B'),
        headRevision: 6,
      }),
    } as unknown as import('../branch/service.js').BranchService;
    const svc = new CheckpointService(repo, branchSvc, ids());
    const cp = await svc.create({
      deckId: DECK_ID,
      branchId: 'main',
      name: 'v2.0',
      revision: 3,
      actorId: 'u',
    });
    const result = await svc.restore(DECK_ID, cp.id);
    expect(result.newRevision).toBe(6);
    expect(result.branchId).toBe('main');
  });

  it('lists checkpoints filtered by branch', async () => {
    const svc = new CheckpointService(undefined, undefined, ids());
    await svc.create({ deckId: DECK_ID, branchId: 'main', name: 'a', revision: 1, actorId: 'u' });
    await svc.create({ deckId: DECK_ID, branchId: 'feat/x', name: 'b', revision: 2, actorId: 'u' });
    const main = await svc.list(DECK_ID, { branchId: 'main' });
    const feat = await svc.list(DECK_ID, { branchId: 'feat/x' });
    expect(main).toHaveLength(1);
    expect(feat).toHaveLength(1);
  });

  it('throws when checkpoint is missing', async () => {
    const svc = new CheckpointService();
    await expect(svc.get(DECK_ID, asULID('01H000000000000000000000ZZZ'))).rejects.toBeInstanceOf(
      CheckpointNotFoundError,
    );
  });
});
