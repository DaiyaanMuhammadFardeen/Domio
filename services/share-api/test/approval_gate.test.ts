/**
 * Approval gate tests (Phase 18 — Wave 5 #180).
 *
 * Verifies that the pluggable ShareApprovalGate is enforced on the
 * two content-delivery surfaces (createShare, shareIntrospect) and
 * that the handler layer maps ShareApprovalRequiredError → 403 with
 * the correct problem type.
 *
 * Administrative operations (getShare, updateShare, rotateToken,
 * extendExpiry, revokeShare, getPolicy, putPolicy) are intentionally
 * ungated.
 */

import { describe, it, expect } from 'vitest';
import { ShareService } from '../src/service.js';
import { InMemoryShareStore } from '../src/store/mem_store.js';
import { InMemoryAuditEmitter } from '../src/audit/emit.js';
import { InMemoryNonceStore } from '@domio/signed-link-token';
import {
  AllowAllApprovalGate,
  ShareApprovalRequiredError,
  type ShareApprovalGate,
} from '../src/types.js';
import { handlers, type HttpRequest } from '../src/handlers.js';

const NOW = new Date('2026-08-06T12:00:00Z');
const TOKEN_KEY = new Uint8Array(32).fill(7);

// ---------------------------------------------------------------------------
// Gate stubs
// ---------------------------------------------------------------------------

/** Gate that always denies. */
const DenyAllApprovalGate: ShareApprovalGate = {
  async isShareApproved(): Promise<boolean> {
    return false;
  },
};

/** Gate that denies a specific deck. */
function denyDeck(deckId: string): ShareApprovalGate {
  return {
    async isShareApproved(_ws, d): Promise<boolean> {
      return d !== deckId;
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(gate?: ShareApprovalGate, store?: InMemoryShareStore) {
  const service = new ShareService({
    store: store ?? new InMemoryShareStore({ clock: () => NOW }),
    audit: new InMemoryAuditEmitter(),
    tokenKey: TOKEN_KEY,
    nonceStore: new InMemoryNonceStore(),
    clock: () => NOW,
    ...(gate !== undefined ? { approvalGate: gate } : {}),
  });
  return { service, ctx: { service } };
}

function createShareReq(
  overrides: Partial<{ workspaceId: string; deckId: string; actorId: string }> = {},
): HttpRequest<Record<string, never>, { workspaceId: string; deckId: string; actorId: string }> {
  return {
    method: 'POST',
    path: '/v1/shares',
    params: {},
    body: { workspaceId: 'w1', deckId: 'd1', actorId: 'alice', ...overrides },
    query: {},
    headers: {},
  };
}

function introspectReq(body: {
  workspaceId: string;
  shortId: string;
  token: string;
}): HttpRequest<Record<string, never>, typeof body> {
  return {
    method: 'POST',
    path: '/mcp/share-introspect',
    params: {},
    body,
    query: {},
    headers: {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('approval gate', () => {
  // --- (a) no gate injected → createShare succeeds (default AllowAll) ---

  it('(a) no gate injected → createShare succeeds (backward-compatible default)', async () => {
    const { ctx } = makeService(); // no gate
    const res = await handlers.createShare(createShareReq(), ctx);
    expect(res.status).toBe(201);
    const body = res.body as { link: { id: string }; token: string };
    expect(body.link.id).toMatch(/^lnk_/);
    expect(body.token.split('.')).toHaveLength(4);
  });

  // --- (b) injected DenyGate → createShare throws ShareApprovalRequiredError ---

  it('(b) injected DenyGate → createShare throws ShareApprovalRequiredError', async () => {
    const { service } = makeService(DenyAllApprovalGate);
    await expect(
      service.createShare({ workspaceId: 'w1', deckId: 'd1', actorId: 'alice' }),
    ).rejects.toBeInstanceOf(ShareApprovalRequiredError);
  });

  // --- (c) handler maps ShareApprovalRequiredError → 403 with correct problem type ---

  it('(c) handler returns 403 with correct problem type on createShare', async () => {
    const { ctx } = makeService(DenyAllApprovalGate);
    const res = await handlers.createShare(createShareReq(), ctx);
    expect(res.status).toBe(403);
    const body = res.body as {
      type: string;
      status: number;
      title: string;
      detail: string;
    };
    expect(body.type).toBe('external_share_requires_approval');
    expect(body.status).toBe(403);
    expect(body.title).toBe('External share requires approval');
    expect(body.detail).toContain('d1');
  });

  // --- (d) injected AllowGate → createShare succeeds ---

  it('(d) injected AllowGate → createShare succeeds', async () => {
    const { ctx } = makeService(AllowAllApprovalGate);
    const res = await handlers.createShare(createShareReq(), ctx);
    expect(res.status).toBe(201);
  });

  // --- (e) introspect gated when gate denies ---

  it('(e) introspect is gated — gate denies → 403', async () => {
    // Use a shared store so the share created with AllowAll is visible to the deny-gated service.
    const sharedStore = new InMemoryShareStore({ clock: () => NOW });
    const { ctx: allowCtx } = makeService(AllowAllApprovalGate, sharedStore);
    const created = await handlers.createShare(createShareReq(), allowCtx);
    expect(created.status).toBe(201);
    const { link, token } = created.body as { link: { shortId: string }; token: string };

    // Now switch to a deny gate for introspect, using the same store.
    const { ctx: denyCtx } = makeService(DenyAllApprovalGate, sharedStore);
    const res = await handlers.shareIntrospect(
      introspectReq({ workspaceId: 'w1', shortId: link.shortId, token }),
      denyCtx,
    );
    expect(res.status).toBe(403);
    const body = res.body as { type: string; status: number };
    expect(body.type).toBe('external_share_requires_approval');
    expect(body.status).toBe(403);
  });

  // --- (e continued) introspect ungated when gate allows ---

  it('(e) introspect is ungated — gate allows → 200', async () => {
    const sharedStore = new InMemoryShareStore({ clock: () => NOW });
    const { ctx } = makeService(AllowAllApprovalGate, sharedStore);
    const created = await handlers.createShare(createShareReq(), ctx);
    const { link, token } = created.body as { link: { shortId: string }; token: string };

    const res = await handlers.shareIntrospect(
      introspectReq({ workspaceId: 'w1', shortId: link.shortId, token }),
      ctx,
    );
    expect(res.status).toBe(200);
  });

  // --- (f) administrative operations are NOT gated ---

  it('(f) getShare is NOT gated even with DenyGate', async () => {
    // Create with AllowAll to get a valid share, using a shared store.
    const sharedStore = new InMemoryShareStore({ clock: () => NOW });
    const { service: allowService } = makeService(AllowAllApprovalGate, sharedStore);
    const { snapshot } = await allowService.createShare({
      workspaceId: 'w1',
      deckId: 'd1',
      actorId: 'alice',
    });
    const linkId = snapshot.link.id;

    // Switch to DenyAll for the read — should still succeed (not gated).
    const { service: denyService } = makeService(DenyAllApprovalGate, sharedStore);
    const snap = await denyService.getShare('w1', linkId);
    expect(snap.link.id).toBe(linkId);
  });

  it('(f) updateShare is NOT gated even with DenyGate', async () => {
    const sharedStore = new InMemoryShareStore({ clock: () => NOW });
    const { service: allowService } = makeService(AllowAllApprovalGate, sharedStore);
    const { snapshot } = await allowService.createShare({
      workspaceId: 'w1',
      deckId: 'd1',
      actorId: 'alice',
    });

    const { service: denyService } = makeService(DenyAllApprovalGate, sharedStore);
    const updated = await denyService.updateShare(
      'w1',
      snapshot.link.id,
      {
        actorId: 'alice',
        slug: 'new-slug',
      },
      2,
    );
    expect(updated.link.slug).toBe('new-slug');
  });

  // --- (g) gate receives correct workspaceId and deckId ---

  it('(g) gate receives correct workspaceId and deckId', async () => {
    let capturedWs = '';
    let capturedDeck = '';
    const spy: ShareApprovalGate = {
      async isShareApproved(ws, deck): Promise<boolean> {
        capturedWs = ws;
        capturedDeck = deck;
        return true;
      },
    };
    const { ctx } = makeService(spy);
    await handlers.createShare(
      createShareReq({ workspaceId: 'my-workspace', deckId: 'my-deck' }),
      ctx,
    );
    expect(capturedWs).toBe('my-workspace');
    expect(capturedDeck).toBe('my-deck');
  });

  // --- (h) per-deck deny — deck A allowed, deck B denied ---

  it('(h) per-deck deny — deck A allowed, deck B denied', async () => {
    const gate = denyDeck('blocked-deck');
    const { ctx } = makeService(gate);

    const allowed = await handlers.createShare(createShareReq({ deckId: 'allowed-deck' }), ctx);
    expect(allowed.status).toBe(201);

    const denied = await handlers.createShare(createShareReq({ deckId: 'blocked-deck' }), ctx);
    expect(denied.status).toBe(403);
  });

  // --- (i) error message contains useful detail ---

  it('(i) ShareApprovalRequiredError contains workspace and deck info', () => {
    const err = new ShareApprovalRequiredError('ws-1', 'deck-1');
    expect(err.code).toBe('SHARE_APPROVAL_REQUIRED');
    expect(err.workspaceId).toBe('ws-1');
    expect(err.deckId).toBe('deck-1');
    expect(err.message).toContain('deck-1');
    expect(err.message).toContain('ws-1');
  });
});
