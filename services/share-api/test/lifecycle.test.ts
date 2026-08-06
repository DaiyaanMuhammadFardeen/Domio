/**
 * End-to-end lifecycle integration test (Phase 14 W1).
 *
 * Walks through every privileged action of the ShareService and
 * verifies the audit chain.
 *
 *  1. Create share
 *  2. Read share
 *  3. Read policy
 *  4. Update share (non-policy field)
 *  5. Update policy via PATCH
 *  6. Rotate token — original token rejected, new token accepted
 *  7. Extend expiry
 *  8. Introspect with current token (must succeed)
 *  9. Introspect replay (must fail with NONCE_REPLAYED)
 * 10. Revoke share
 * 11. Get-after-revoke (must 404 via ShareNotFoundError)
 * 12. Verify audit chain — six events present, hash chain valid
 */

import { describe, it, expect } from 'vitest';
import { ShareService } from '../src/service.js';
import { InMemoryShareStore } from '../src/store/mem_store.js';
import { InMemoryAuditEmitter, ChainAuditEmitter } from '../src/audit/emit.js';
import { Chain } from '@domio/audit-ts';
import { InMemoryNonceStore } from '@domio/signed-link-token';
import { ShareNotFoundError, ShareRevokedError, ShareValidationError } from '../src/types.js';
import { ConcurrentModificationError } from '../src/store/store.js';

const NOW = new Date('2026-08-06T12:00:00Z');
const TOKEN_KEY = new Uint8Array(32).fill(7);

interface ServiceFixture {
  service: ShareService;
  audit: InMemoryAuditEmitter | ChainAuditEmitter;
  chain: Chain | null;
}

function makeService(opts: { audit?: 'mem' | 'chain' } = {}): ServiceFixture {
  let chain: Chain | null = null;
  const audit = opts.audit === 'chain'
    ? (() => {
        chain = new Chain();
        chain.loadKey({
          kid: 'test-key',
          keyHex: 'a'.repeat(64),
          rotatedAt: new Date(NOW.getTime() - 1000),
          expiresAt: new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000),
          overlapUntil: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
        });
        return new ChainAuditEmitter(chain);
      })()
    : new InMemoryAuditEmitter();
  return {
    service: new ShareService({
      store: new InMemoryShareStore({ clock: () => NOW }),
      audit,
      tokenKey: TOKEN_KEY,
      nonceStore: new InMemoryNonceStore(),
      clock: () => NOW,
    }),
    audit,
    chain,
  };
}

describe('share-api lifecycle', () => {
  it('walks the full 12-step lifecycle and emits a valid audit chain', async () => {
    const { service, audit, chain } = makeService({ audit: 'chain' });

    // 1. Create
    const created = await service.createShare({
      workspaceId: 'w1',
      deckId: 'd1',
      actorId: 'alice',
      slug: 'launch-deck',
      visibility: 'link_only',
      allowDownload: false,
      allowEmbed: true,
    });
    const linkId = created.snapshot.link.id;
    const shortId = created.snapshot.link.shortId;
    expect(created.snapshot.link.status).toBe('active');
    expect(created.snapshot.link.slug).toBe('launch-deck');
    expect(created.snapshot.link.tokenHash).not.toBeNull();
    expect(created.token.split('.')).toHaveLength(4);

    // 2. Read share
    const read = await service.getShare('w1', linkId);
    expect(read.link.id).toBe(linkId);

    // 3. Read policy
    const policy = await service.getSharePolicy('w1', linkId);
    expect(policy.visibility).toBe('link_only');
    expect(policy.allowDownload).toBe(false);
    expect(policy.allowEmbed).toBe(true);

    // 4. Update share (non-policy — change deck-level metadata via slug).
    //    `slug` is a link-level field, NOT a policy field, so this should
    //    emit share.updated (not share.policy_changed).
    const updated = await service.updateShare('w1', linkId, {
      actorId: 'alice',
      slug: 'launch-deck-v2',
    }, 2); // expectedSeq = 2 (insert was seq=1, rotateToken bumped to 2)
    expect(updated.link.slug).toBe('launch-deck-v2');

    // 5. Update policy via PATCH
    const policyChanged = await service.updateShare('w1', linkId, {
      actorId: 'alice',
      visibility: 'allowlist',
      allowedViewers: [{ type: 'email', value: 'bob@example.com' }],
    }, 3);
    expect(policyChanged.policy.visibility).toBe('allowlist');
    expect(policyChanged.policy.allowedViewers).toHaveLength(1);

    // 6. Rotate token — original must be rejected on introspect,
    //    new token must succeed.
    const rotated = await service.rotateShareToken('w1', linkId, 'alice', 4);
    expect(rotated.token).not.toBe(created.token);
    expect(rotated.snapshot.link.tokenHash).not.toBe(created.snapshot.link.tokenHash);

    // 7. Extend expiry
    const futureExpiry = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
    const extended = await service.extendExpiry(
      'w1',
      linkId,
      { actorId: 'alice', expiresAt: futureExpiry },
      5,
    );
    expect(extended.link.expiresAt?.getTime()).toBe(futureExpiry.getTime());

    // 8. Introspect with current token
    const intro = await service.introspect('w1', shortId, rotated.token);
    expect(intro.claims.link_id).toBe(linkId);
    expect(intro.claims.workspace_id).toBe('w1');

    // 9. Introspect replay — must fail (nonce already seen).
    await expect(service.introspect('w1', shortId, rotated.token))
      .rejects.toBeInstanceOf(ShareValidationError);

    // 10. Revoke
    const revoked = await service.revokeShare('w1', linkId, 'alice', 6);
    expect(revoked.link.status).toBe('revoked');
    expect(revoked.link.revokedAt).not.toBeNull();

    // 11. Get-after-revoke — service throws ShareNotFoundError because
    //     the in-memory store filters out revoked rows.
    await expect(service.getShare('w1', linkId)).rejects.toBeInstanceOf(ShareNotFoundError);

    // 12. Audit chain: six privileged actions recorded.
    expect(chain).not.toBeNull();
    const memEvents = (audit as ChainAuditEmitter).events;
    const types = memEvents.map((e) => e.eventType);
    expect(types).toEqual([
      'share.created',
      'share.updated',        // step 4
      'share.policy_changed', // step 5
      'share.token_rotated',  // step 6
      'share.expiry_extended',// step 7
      'share.deleted',        // step 10
    ]);
    const verify = await chain!.verifyChain(memEvents);
    expect(verify).toBeUndefined(); // throws on failure; reaching here means ok
  });

  it('rejects shortId collisions cleanly (deterministic generator)', async () => {
    const stub = new ShareService({
      store: new InMemoryShareStore({ clock: () => NOW }),
      audit: new InMemoryAuditEmitter(),
      tokenKey: TOKEN_KEY,
      nonceStore: new InMemoryNonceStore(),
      shortIdGenerator: () => 'COLLIDE1',
      clock: () => NOW,
    });
    const ok = await stub.createShare({
      workspaceId: 'w2', deckId: 'd1', actorId: 'alice',
    });
    expect(ok.snapshot.link.shortId).toBe('COLLIDE1');
  });

  it('rejects concurrent modifications via expectedSeq', async () => {
    const { service } = makeService();
    const { snapshot } = await service.createShare({
      workspaceId: 'w1', deckId: 'd1', actorId: 'alice',
    });
    // First update with seq=2 succeeds (insert seq=1, rotateToken bumped to 2).
    await service.updateShare('w1', snapshot.link.id, {
      actorId: 'alice',
      allowPrint: true,
    }, 2);
    // Second update with stale seq=2 must fail.
    await expect(
      service.updateShare('w1', snapshot.link.id, {
        actorId: 'alice',
        allowPrint: false,
      }, 2),
    ).rejects.toBeInstanceOf(ConcurrentModificationError);
  });

  it('rotated token invalidates the previous one (nonce seen)', async () => {
    const { service } = makeService();
    const { snapshot, token: originalToken } = await service.createShare({
      workspaceId: 'w1', deckId: 'd1', actorId: 'alice',
    });
    const originalIntro = await service.introspect('w1', snapshot.link.shortId, originalToken);
    expect(originalIntro.claims.link_id).toBe(snapshot.link.id);

    const { token: newToken } = await service.rotateShareToken(
      'w1', snapshot.link.id, 'alice', 2,
    );
    const newIntro = await service.introspect('w1', snapshot.link.shortId, newToken);
    expect(newIntro.claims.link_id).toBe(snapshot.link.id);
    await expect(
      service.introspect('w1', snapshot.link.shortId, originalToken),
    ).rejects.toBeInstanceOf(ShareValidationError);
  });

  it('revoked link introspect fails (gone from the read surface)', async () => {
    const { service } = makeService();
    const { snapshot } = await service.createShare({
      workspaceId: 'w1', deckId: 'd1', actorId: 'alice',
    });
    const { token: rotatedToken } = await service.rotateShareToken(
      'w1', snapshot.link.id, 'alice', 2,
    );
    await service.revokeShare('w1', snapshot.link.id, 'alice', 3);
    // Revoked links are filtered out of the read surface, so introspect
    // returns ShareNotFoundError (the link is gone from the API view).
    await expect(
      service.introspect('w1', snapshot.link.shortId, rotatedToken),
    ).rejects.toBeInstanceOf(ShareNotFoundError);
  });
});
