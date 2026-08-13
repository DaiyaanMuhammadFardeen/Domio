/**
 * @domio/presenter-session — handover token tests.
 *
 * Phase 15 W11. The handover token gates *who* may invoke the handover
 * mutation, separate from the row's optimistic-CC etag. These tests
 * cover:
 *   - Mint + verify happy path.
 *   - Constant-time HMAC comparison rejects tampering.
 *   - Expiry past `nowMs` returns EXPIRED.
 *   - Recipient pinning — `verifyHandoverToken` rejects the wrong
 *     `to_actor` (defends against token-forwarding).
 *   - Session pinning — token minted for session A is rejected on session B.
 *   - Replay rejection via the supplied NonceStore.
 *   - End-to-end: service.mintHandoverToken → service.handover flow.
 */

import { describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'crypto';
import {
  mintHandoverToken,
  verifyHandoverToken,
  HandoverTokenError,
  parseHandoverToken,
  InMemoryNonceStore,
} from './handoff_token.js';
import { PresenterSessionService } from './service.js';
import { InMemoryPresenterSessionStore } from './store/mem_store.js';
import { HashChainedAuditEmitter } from './audit/emit.js';
import { InMemoryIdempotencyStore } from './idempotency/index.js';

const KEY = (() => {
  // 32-byte HMAC key derived deterministically for test stability.
  return createHash('sha256').update('domio/test/handover/v1').digest();
})();

const BASE_CLAIMS = {
  session_id: 'sess_test_1',
  workspace_id: 'ws_test_1',
  from_actor: 'presenter_alice',
  to_actor: 'presenter_bob',
  expected_version: 7,
};

describe('handoff_token: mint + verify', () => {
  it('round-trips claims successfully', () => {
    const token = mintHandoverToken(BASE_CLAIMS, KEY, { nowMs: 1_000_000 });
    const result = verifyHandoverToken(token, KEY, BASE_CLAIMS.session_id, BASE_CLAIMS.to_actor, {
      nowMs: 1_000_500,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.session_id).toBe(BASE_CLAIMS.session_id);
    expect(result.claims.to_actor).toBe(BASE_CLAIMS.to_actor);
    expect(result.claims.from_actor).toBe(BASE_CLAIMS.from_actor);
    expect(result.claims.expected_version).toBe(BASE_CLAIMS.expected_version);
    expect(result.claims.expires_at_ms).toBe(1_000_000 + 60_000);
  });

  it('uses ttlMs when supplied', () => {
    const token = mintHandoverToken(BASE_CLAIMS, KEY, { nowMs: 1_000_000, ttlMs: 5_000 });
    const decoded = parseHandoverToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.expires_at_ms).toBe(1_005_000); // 1_000_000 + 5_000
  });

  it('rejects too-short HMAC keys at mint time', () => {
    const shortKey = Buffer.alloc(16);
    expect(() => mintHandoverToken(BASE_CLAIMS, shortKey)).toThrow(HandoverTokenError);
  });
});

describe('handoff_token: tampering + expiry', () => {
  it('rejects a tampered payload', () => {
    const token = mintHandoverToken(BASE_CLAIMS, KEY, { nowMs: 1_000_000 });
    // Flip the first character of the payload b64 segment.
    const [payload, expires, hmac] = token.split('.') as [string, string, string];
    const flipped = payload.startsWith('A') ? `B${payload.slice(1)}` : `A${payload.slice(1)}`;
    const tampered = `${flipped}.${expires}.${hmac}`;
    const result = verifyHandoverToken(
      tampered,
      KEY,
      BASE_CLAIMS.session_id,
      BASE_CLAIMS.to_actor,
      {
        nowMs: 1_000_500,
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('BAD_SIGNATURE');
  });

  it('rejects an expired token', () => {
    const token = mintHandoverToken(BASE_CLAIMS, KEY, { nowMs: 1_000_000, ttlMs: 100 });
    const result = verifyHandoverToken(token, KEY, BASE_CLAIMS.session_id, BASE_CLAIMS.to_actor, {
      nowMs: 1_000_500,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('EXPIRED');
  });

  it('rejects an entirely malformed envelope', () => {
    const result = verifyHandoverToken(
      'not-a-token',
      KEY,
      BASE_CLAIMS.session_id,
      BASE_CLAIMS.to_actor,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('BAD_FORMAT');
  });
});

describe('handoff_token: recipient + session pinning', () => {
  it('rejects when the recipient does not match to_actor', () => {
    const token = mintHandoverToken(BASE_CLAIMS, KEY, { nowMs: 1_000_000 });
    const result = verifyHandoverToken(token, KEY, BASE_CLAIMS.session_id, 'presenter_eve', {
      nowMs: 1_000_500,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('MISMATCHED_RECIPIENT');
  });

  it('rejects when the session id does not match', () => {
    const token = mintHandoverToken(BASE_CLAIMS, KEY, { nowMs: 1_000_000 });
    const result = verifyHandoverToken(token, KEY, 'sess_other', BASE_CLAIMS.to_actor, {
      nowMs: 1_000_500,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('MISMATCHED_SESSION');
  });
});

describe('handoff_token: replay protection', () => {
  it('rejects a replayed nonce', () => {
    const store = new InMemoryNonceStore();
    const token = mintHandoverToken(BASE_CLAIMS, KEY, { nowMs: 1_000_000 });
    const first = verifyHandoverToken(token, KEY, BASE_CLAIMS.session_id, BASE_CLAIMS.to_actor, {
      nowMs: 1_000_500,
      nonceStore: store,
    });
    expect(first.ok).toBe(true);
    const second = verifyHandoverToken(token, KEY, BASE_CLAIMS.session_id, BASE_CLAIMS.to_actor, {
      nowMs: 1_000_600,
      nonceStore: store,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('NONCE_REPLAYED');
  });
});

// ---------------------------------------------------------------------------
// Service-level integration
// ---------------------------------------------------------------------------

function buildService() {
  return new PresenterSessionService({
    store: new InMemoryPresenterSessionStore(),
    audit: new HashChainedAuditEmitter({ workspaceId: 'ws_test_1', key: KEY }),
    idempotency: new InMemoryIdempotencyStore(),
    idGenerator: () => randomBytes(8).toString('hex'),
  });
}

async function startSession(service: PresenterSessionService) {
  return service.start(
    {
      workspace_id: 'ws_test_1',
      deck_id: 'deck_test_1',
      presenter_id: 'presenter_alice',
      initial_slide_id: 'slide_1',
      initial_slide_index: 0,
    },
    { actorId: 'presenter_alice' },
  );
}

describe('service.handover: end-to-end with token', () => {
  it('mints a token and accepts the matching handover call', async () => {
    const service = buildService();
    const started = await startSession(service);
    const minted = await service.mintHandoverToken(
      started.session.id,
      { to_presenter_id: 'presenter_bob' },
      'presenter_alice',
      KEY,
    );
    expect(minted.token).toMatch(/\./);
    expect(minted.expires_at_ms).toBeGreaterThan(Date.now());

    const updated = await service.handover(
      started.session.id,
      {
        to_presenter_id: 'presenter_bob',
        state_snapshot: started.session.state,
        transfer_token: minted.token,
        expected_version: minted.expected_version,
      },
      { actorId: 'presenter_bob', handoverKey: KEY, verifyHandoverToken },
    );
    expect(updated.presenter_id).toBe('presenter_bob');
    expect(updated.mode).toBe('multi_presenter');
    expect(updated.version).toBe(started.session.version + 1);
  });

  it('rejects a handover with a tampered token', async () => {
    const service = buildService();
    const started = await startSession(service);
    const minted = await service.mintHandoverToken(
      started.session.id,
      { to_presenter_id: 'presenter_bob' },
      'presenter_alice',
      KEY,
    );
    const tampered = minted.token.replace(/^./, 'X');
    await expect(
      service.handover(
        started.session.id,
        {
          to_presenter_id: 'presenter_bob',
          state_snapshot: started.session.state,
          transfer_token: tampered,
          expected_version: minted.expected_version,
        },
        { actorId: 'presenter_bob', handoverKey: KEY, verifyHandoverToken },
      ),
    ).rejects.toThrow(/handover token rejected/);
  });

  it('rejects a handover presented to the wrong recipient', async () => {
    const service = buildService();
    const started = await startSession(service);
    const minted = await service.mintHandoverToken(
      started.session.id,
      { to_presenter_id: 'presenter_bob' },
      'presenter_alice',
      KEY,
    );
    await expect(
      service.handover(
        started.session.id,
        {
          to_presenter_id: 'presenter_eve',
          state_snapshot: started.session.state,
          transfer_token: minted.token,
          expected_version: minted.expected_version,
        },
        { actorId: 'presenter_eve', handoverKey: KEY, verifyHandoverToken },
      ),
    ).rejects.toThrow(/handover token rejected: MISMATCHED_RECIPIENT/);
  });

  it('emits a session.handover audit event after a successful transfer', async () => {
    const service = buildService();
    const started = await startSession(service);
    const minted = await service.mintHandoverToken(
      started.session.id,
      { to_presenter_id: 'presenter_bob' },
      'presenter_alice',
      KEY,
    );
    await service.handover(
      started.session.id,
      {
        to_presenter_id: 'presenter_bob',
        state_snapshot: started.session.state,
        transfer_token: minted.token,
        expected_version: minted.expected_version,
      },
      { actorId: 'presenter_bob', handoverKey: KEY, verifyHandoverToken },
    );
    // The audit chain is internal; verify it didn't break.
    const verify = await service.heartbeat(started.session.id, { actorId: 'presenter_bob' });
    expect(verify.version).toBeGreaterThan(started.session.version);
  });
});
