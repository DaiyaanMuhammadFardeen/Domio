/**
 * Concurrency test for the rotate-token race (Phase 14 W1).
 *
 * Fires N concurrent `rotateShareToken` calls against the same
 * `link_id`. The in-memory store uses an in-process monotonic seq
 * with no atomic CAS, so under contention we expect a mix of:
 *  - one winner (200 with a fresh token),
 *  - N-1 losers (409 with ConcurrentModificationError).
 *
 * The test verifies that exactly one call wins and the rest fail
 * predictably. (A pgx-backed store would use `WHERE seq = $expected`
 * for the same property.)
 */

import { describe, it, expect } from 'vitest';
import { ShareService } from '../src/service.js';
import { InMemoryShareStore } from '../src/store/mem_store.js';
import { InMemoryAuditEmitter } from '../src/audit/emit.js';
import { InMemoryNonceStore } from '@domio/signed-link-token';
import { ConcurrentModificationError } from '../src/store/store.js';

const NOW = new Date('2026-08-06T12:00:00Z');
const TOKEN_KEY = new Uint8Array(32).fill(7);

function makeService() {
  return new ShareService({
    store: new InMemoryShareStore({ clock: () => NOW }),
    audit: new InMemoryAuditEmitter(),
    tokenKey: TOKEN_KEY,
    nonceStore: new InMemoryNonceStore(),
    clock: () => NOW,
  });
}

describe('share-api concurrency', () => {
  it('fires N concurrent rotate-token requests; exactly one wins', async () => {
    const service = makeService();
    const { snapshot } = await service.createShare({
      workspaceId: 'w1', deckId: 'd1', actorId: 'alice',
    });
    const linkId = snapshot.link.id;

    // All callers pass the same expectedSeq=2 (the post-insert seq).
    // Whichever lands first bumps it to 3; the rest fail.
    const N = 16;
    const results = await Promise.allSettled(
      Array.from({ length: N }, () =>
        service.rotateShareToken('w1', linkId, 'alice', 2),
      ),
    );
    const winners = results.filter((r) => r.status === 'fulfilled');
    const losers = results.filter(
      (r) => r.status === 'rejected' && (r as PromiseRejectedResult).reason instanceof ConcurrentModificationError,
    );
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(N - 1);
    // The winning token must be a valid 4-part token.
    const w = (winners[0] as PromiseFulfilledResult<{ snapshot: { link: { tokenHash: string | null } }; token: string }>).value;
    expect(w.token.split('.')).toHaveLength(4);
    expect(w.snapshot.link.tokenHash).not.toBeNull();
  });

  it('fires N concurrent update requests; exactly one wins', async () => {
    const service = makeService();
    const { snapshot } = await service.createShare({
      workspaceId: 'w1', deckId: 'd1', actorId: 'alice',
    });
    const linkId = snapshot.link.id;

    const N = 8;
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        service.updateShare(
          'w1', linkId,
          { actorId: 'alice', slug: `concurrent-${i}` },
          2,
        ),
      ),
    );
    const winners = results.filter((r) => r.status === 'fulfilled');
    const losers = results.filter(
      (r) => r.status === 'rejected' && (r as PromiseRejectedResult).reason instanceof ConcurrentModificationError,
    );
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(N - 1);
  });
});
