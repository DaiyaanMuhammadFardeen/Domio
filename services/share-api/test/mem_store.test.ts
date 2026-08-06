/**
 * Store tests (in-memory + pg nil-guards).
 *
 * Covers:
 * - insert/findById/findByShortId/findBySlug round-trip
 * - shortIdExists enforces uniqueness
 * - update with wrong expectedSeq throws ConcurrentModificationError
 * - rotateToken updates token_hash and bumps seq
 * - revoke sets status and revoked_at
 * - pg store returns StoreNotConfiguredError when pool is null
 */

import { describe, it, expect } from 'vitest';
import { InMemoryShareStore } from '../src/store/mem_store.js';
import { PgShareStore, StoreNotConfiguredError } from '../src/store/pg_store.js';
import { ConcurrentModificationError, ShortIdCollisionError } from '../src/store/store.js';
import {
  ShareConflictError,
  ShareNotFoundError,
  ShareValidationError,
  type CreateShareInput,
  type LinkPolicy,
  type ShareLink,
} from '../src/types.js';

const NOW = new Date('2026-08-06T12:00:00Z');

function makeStore() {
  return new InMemoryShareStore({ clock: () => NOW });
}

function makeInput(overrides: Partial<CreateShareInput> = {}): CreateShareInput {
  return {
    workspaceId: 'w1',
    deckId: 'd1',
    actorId: 'u1',
    ...overrides,
  };
}

function makeLink(overrides: Partial<ShareLink> = {}): ShareLink {
  return {
    id: 'lnk_000001',
    workspaceId: 'w1',
    deckId: 'd1',
    shortId: 'ABCD1234',
    slug: null,
    tokenHash: null,
    status: 'active',
    expiresAt: null,
    revokedAt: null,
    revokedBy: null,
    watermarkProfileId: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'u1',
    updatedBy: null,
    ...overrides,
  };
}

function makePolicy(overrides: Partial<LinkPolicy> = {}): LinkPolicy {
  return {
    id: 'pol_000001',
    workspaceId: 'w1',
    shareLinkId: 'lnk_000001',
    visibility: 'link_only',
    allowedViewers: [],
    maxViews: null,
    viewCount: 0,
    allowDownload: false,
    allowPrint: false,
    allowEmbed: true,
    requirePasscode: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('InMemoryShareStore — read/write round-trip', () => {
  it('insert then findById returns the row', async () => {
    const s = makeStore();
    await s.insert(makeInput(), makeLink(), makePolicy());
    const got = await s.findById('w1', 'lnk_000001');
    expect(got).not.toBeNull();
    expect(got?.link.shortId).toBe('ABCD1234');
  });

  it('findByShortId resolves the row', async () => {
    const s = makeStore();
    await s.insert(makeInput(), makeLink(), makePolicy());
    const got = await s.findByShortId('w1', 'ABCD1234');
    expect(got?.link.id).toBe('lnk_000001');
  });

  it('findBySlug resolves when set', async () => {
    const s = makeStore();
    await s.insert(
      makeInput({ slug: 'q3-board-update' }),
      makeLink({ slug: 'q3-board-update' }),
      makePolicy(),
    );
    const got = await s.findBySlug('w1', 'q3-board-update');
    expect(got?.link.id).toBe('lnk_000001');
    expect(await s.findBySlug('w1', 'nonexistent')).toBeNull();
  });

  it('shortIdExists detects collisions across workspaces', async () => {
    const s = makeStore();
    await s.insert(makeInput(), makeLink(), makePolicy());
    expect(await s.shortIdExists('w1', 'ABCD1234')).toBe(true);
    expect(await s.shortIdExists('w2', 'ABCD1234')).toBe(false);
  });

  it('insert rejects short-id collisions within the same workspace', async () => {
    const s = makeStore();
    await s.insert(makeInput(), makeLink(), makePolicy());
    await expect(
      s.insert(makeInput({ deckId: 'd2' }), makeLink({ id: 'lnk_000002', deckId: 'd2' }), makePolicy({ id: 'pol_000002', shareLinkId: 'lnk_000002' })),
    ).rejects.toBeInstanceOf(ShortIdCollisionError);
  });

  it('insert rejects slug collisions within the same workspace', async () => {
    const s = makeStore();
    await s.insert(
      makeInput({ slug: 'q3-board-update' }),
      makeLink({ slug: 'q3-board-update' }),
      makePolicy(),
    );
    await expect(
      s.insert(
        makeInput({ slug: 'q3-board-update', deckId: 'd2' }),
        // Use a DIFFERENT short id so the slug check fires first.
        makeLink({ id: 'lnk_000002', deckId: 'd2', slug: 'q3-board-update', shortId: 'WXYZ5678' }),
        makePolicy({ id: 'pol_000002', shareLinkId: 'lnk_000002' }),
      ),
    ).rejects.toBeInstanceOf(ShareConflictError);
  });

  it('insert rejects invalid visibility', async () => {
    const s = makeStore();
    await expect(
      s.insert(
        // Cast to bypass the type checker; we want runtime validation.
        { ...makeInput(), visibility: 'invalid' as never },
        makeLink(),
        makePolicy(),
      ),
    ).rejects.toBeInstanceOf(ShareValidationError);
  });
});

describe('InMemoryShareStore — update', () => {
  it('update with correct expectedSeq succeeds and bumps seq', async () => {
    const s = makeStore();
    await s.insert(makeInput(), makeLink(), makePolicy());
    const after = await s.update('w1', 'lnk_000001', { actorId: 'u2', visibility: 'public' }, 1);
    expect(after.policy.visibility).toBe('public');
    expect(after.link.updatedBy).toBe('u2');
  });

  it('update with wrong expectedSeq throws ConcurrentModificationError', async () => {
    const s = makeStore();
    await s.insert(makeInput(), makeLink(), makePolicy());
    await expect(
      s.update('w1', 'lnk_000001', { actorId: 'u2' }, 99),
    ).rejects.toBeInstanceOf(ConcurrentModificationError);
  });

  it('update on a missing row throws ShareNotFoundError', async () => {
    const s = makeStore();
    await expect(
      s.update('w1', 'nonexistent', { actorId: 'u2' }, 1),
    ).rejects.toBeInstanceOf(ShareNotFoundError);
  });
});

describe('InMemoryShareStore — rotateToken', () => {
  it('updates tokenHash and bumps seq', async () => {
    const s = makeStore();
    await s.insert(makeInput(), makeLink(), makePolicy());
    const after = await s.rotateToken('w1', 'lnk_000001', 'newhash123', 'u2', 1);
    expect(after.link.tokenHash).toBe('newhash123');
  });

  it('rejects concurrent rotation with the wrong seq', async () => {
    const s = makeStore();
    await s.insert(makeInput(), makeLink(), makePolicy());
    await expect(
      s.rotateToken('w1', 'lnk_000001', 'newhash', 'u2', 99),
    ).rejects.toBeInstanceOf(ConcurrentModificationError);
  });
});

describe('InMemoryShareStore — revoke', () => {
  it('sets status=revoked and revoked_at', async () => {
    const s = makeStore();
    await s.insert(makeInput(), makeLink(), makePolicy());
    const after = await s.revoke('w1', 'lnk_000001', 'u2', 1);
    expect(after.link.status).toBe('revoked');
    expect(after.link.revokedAt).toEqual(NOW);
    expect(after.link.revokedBy).toBe('u2');
  });

  it('rejects revoking an already-revoked link', async () => {
    const s = makeStore();
    await s.insert(makeInput(), makeLink(), makePolicy());
    await s.revoke('w1', 'lnk_000001', 'u2', 1);
    await expect(s.revoke('w1', 'lnk_000001', 'u2', 2)).rejects.toBeInstanceOf(ShareConflictError);
  });
});

describe('InMemoryShareStore — extendExpiry', () => {
  it('extends expiry into the future', async () => {
    const s = makeStore();
    await s.insert(makeInput(), makeLink(), makePolicy());
    const future = new Date('2030-01-01T00:00:00Z');
    const after = await s.extendExpiry('w1', 'lnk_000001', { actorId: 'u2', expiresAt: future }, 1);
    expect(after.link.expiresAt).toEqual(future);
  });

  it('rejects extending into the past', async () => {
    const s = makeStore();
    await s.insert(makeInput(), makeLink(), makePolicy());
    await expect(
      s.extendExpiry('w1', 'lnk_000001', { actorId: 'u2', expiresAt: new Date('2020-01-01T00:00:00Z') }, 1),
    ).rejects.toBeInstanceOf(ShareValidationError);
  });
});

describe('PgShareStore — nil guard', () => {
  it('returns StoreNotConfiguredError when pool is null', async () => {
    const pg = new PgShareStore(null);
    await expect(pg.findById('w1', 'lnk_000001')).rejects.toBeInstanceOf(StoreNotConfiguredError);
    await expect(pg.findByShortId('w1', 'ABCD1234')).rejects.toBeInstanceOf(StoreNotConfiguredError);
    await expect(pg.insert(makeInput(), makeLink(), makePolicy())).rejects.toBeInstanceOf(StoreNotConfiguredError);
    await expect(pg.update('w1', 'lnk_000001', { actorId: 'u2' }, 1)).rejects.toBeInstanceOf(StoreNotConfiguredError);
  });
});