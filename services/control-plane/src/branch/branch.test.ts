import { describe, it, expect } from 'vitest';
import { asULID, type ULID, type DeckDocument } from '@domio/schema';
import {
  BranchService,
  BranchAlreadyExistsError,
  BranchHeadConflictError,
  BranchNotFoundError,
  CannotArchiveMainError,
  InvalidBranchNameError,
  InvalidRevisionError,
  MAIN_BRANCH,
  InMemoryBranchRepository,
} from './index.js';
import { computeLineage } from './lineage.js';

const DECK_ID = asULID('01H000000000000000000000A0');

function deterministicIds(): () => ULID {
  const generated: string[] = [
    '01H00000000000000000000B001',
    '01H00000000000000000000B002',
    '01H00000000000000000000B003',
  ];
  let i = 0;
  return () => {
    const next = generated[i % generated.length]!;
    i += 1;
    return asULID(next);
  };
}

describe('BranchService', () => {
  it('creates a branch under main', async () => {
    const svc = new BranchService(
      undefined,
      deterministicIds(),
      () => new Date('2026-04-01T00:00:00Z'),
    );
    const branch = await svc.create({
      deckId: DECK_ID,
      name: 'experiment/header-v2',
      createdBy: 'user-1',
    });
    expect(branch.parentBranchId).toBe(MAIN_BRANCH);
    expect(branch.status).toBe('active');
    expect(branch.headRevision).toBe(0);
  });

  it('rejects duplicate names', async () => {
    const svc = new BranchService(undefined, deterministicIds());
    await svc.create({ deckId: DECK_ID, name: 'feature/x', createdBy: 'user-1' });
    await expect(
      svc.create({ deckId: DECK_ID, name: 'feature/x', createdBy: 'user-2' }),
    ).rejects.toBeInstanceOf(BranchAlreadyExistsError);
  });

  it('rejects invalid names', async () => {
    const svc = new BranchService();
    await expect(
      svc.create({ deckId: DECK_ID, name: '', createdBy: 'user-1' }),
    ).rejects.toBeInstanceOf(InvalidBranchNameError);
    await expect(
      svc.create({ deckId: DECK_ID, name: '   ', createdBy: 'user-1' }),
    ).rejects.toBeInstanceOf(InvalidBranchNameError);
    await expect(
      svc.create({ deckId: DECK_ID, name: 'bad name!', createdBy: 'user-1' }),
    ).rejects.toBeInstanceOf(InvalidBranchNameError);
  });

  it('archives a branch', async () => {
    const svc = new BranchService(undefined, deterministicIds());
    const branch = await svc.create({
      deckId: DECK_ID,
      name: 'feature/y',
      createdBy: 'user-1',
    });
    const archived = await svc.archive(DECK_ID, branch.id);
    expect(archived.status).toBe('archived');
  });

  it('refuses to archive main', async () => {
    const svc = new BranchService();
    // The literal `main` sentinel is the only value `archive` rejects.
    // It must fire before the underlying repository lookup.
    await expect(svc.archive(DECK_ID, 'main' as unknown as ULID)).rejects.toBeInstanceOf(
      CannotArchiveMainError,
    );
  });

  it('checkout returns the branch', async () => {
    const svc = new BranchService(undefined, deterministicIds());
    const branch = await svc.create({
      deckId: DECK_ID,
      name: 'feature/z',
      createdBy: 'user-1',
    });
    const out = await svc.checkout(DECK_ID, branch.id);
    expect(out.branch.id).toBe(branch.id);
    expect(out.resumeHlc.physical).toBe(0);
    expect(out.resumeHlc.logical).toBe(0);
  });

  it('computeLineage walks parent chain', async () => {
    const repo = new InMemoryBranchRepository();
    const svc = new BranchService(repo, deterministicIds());
    const main = await svc.create({
      deckId: DECK_ID,
      name: 'main-fork-1',
      createdBy: 'user-1',
      parentBranchId: MAIN_BRANCH,
    });
    const child = await svc.create({
      deckId: DECK_ID,
      name: 'child',
      createdBy: 'user-1',
      parentBranchId: main.id,
    });
    const grandchild = await svc.create({
      deckId: DECK_ID,
      name: 'grandchild',
      createdBy: 'user-1',
      parentBranchId: child.id,
    });
    const lineage = await computeLineage(repo, DECK_ID, grandchild.id);
    expect(lineage.ancestors.map((b) => b.name)).toEqual(['grandchild', 'child', 'main-fork-1']);
  });

  it('throws when branch id is missing', async () => {
    const svc = new BranchService();
    const ghost = asULID('01H000000000000000000000ZZZ');
    await expect(svc.get(DECK_ID, ghost)).rejects.toBeInstanceOf(BranchNotFoundError);
  });

  it('rejects invalid revision inputs', async () => {
    const svc = new BranchService(undefined, deterministicIds());
    const branch = await svc.create({
      deckId: DECK_ID,
      name: 'rev-test',
      createdBy: 'user-1',
    });
    await expect(svc.advanceHead(DECK_ID, branch.id, -1, 1)).rejects.toBeInstanceOf(
      InvalidRevisionError,
    );
    await expect(svc.advanceHead(DECK_ID, branch.id, 0, 0)).rejects.toBeInstanceOf(
      InvalidRevisionError,
    );
    // Head conflicts surface as BranchHeadConflictError.
    await expect(svc.advanceHead(DECK_ID, branch.id, 99, 100)).rejects.toBeInstanceOf(
      BranchHeadConflictError,
    );
  });
});
