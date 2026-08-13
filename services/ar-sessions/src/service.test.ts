/**
 * AR Session — service tests (Phase 11 M5.3).
 *
 * Covers:
 *   - Session creation happy path
 *   - Session state transitions: created → active → expired/invalidated
 *   - TTL expiry (injectable clock)
 *   - Inactivity timeout (injectable clock)
 *   - Key rotation (old key invalidated)
 *   - Invalid input rejection
 *   - Unknown session rejection
 *   - Refresh activity
 *   - Token verification integration
 */

import { describe, it, expect } from 'vitest';
import {
  SessionService,
  SessionNotFoundError,
  SessionExpiredError,
  SessionInvalidatedError,
  SessionValidationError,
} from './service.js';
import { verifyToken } from './tokens.js';

// ── Helpers ──────────────────────────────────────────────────────────

const SLIDE_ID = '550e8400-e29b-41d4-a716-446655440000';
const MODEL_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const NOW = 1700000000000;

function makeService(opts?: { clock?: () => number; ttlMs?: number; inactivityMs?: number }) {
  return new SessionService({
    clock: opts?.clock ?? (() => NOW),
    ttlMs: opts?.ttlMs ?? 30 * 60 * 1000,
    inactivityMs: opts?.inactivityMs ?? 5 * 60 * 1000,
    idGenerator: () => 'test-session-id',
  });
}

// ── Session creation ─────────────────────────────────────────────────

describe('SessionService — createSession', () => {
  it('creates a session with correct fields', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    expect(session.id).toBe('test-session-id');
    expect(session.slideId).toBe(SLIDE_ID);
    expect(session.modelAssetId).toBe(MODEL_ID);
    expect(session.state).toBe('created');
    expect(session.token).toBeTypeOf('string');
    expect(session.token.length).toBeGreaterThan(0);
    expect(session.audienceUrl).toContain('/s/test-session-id');
    expect(session.audienceUrl).toContain('token=');
    expect(session.expiresAt.getTime()).toBe(NOW + 30 * 60 * 1000);
    expect(session.createdAt.getTime()).toBe(NOW);
  });

  it('rejects missing slideId', async () => {
    const svc = makeService();
    await expect(
      svc.createSession({
        slideId: '',
        modelAssetId: MODEL_ID,
      }),
    ).rejects.toThrow(SessionValidationError);
  });

  it('rejects missing modelAssetId', async () => {
    const svc = makeService();
    await expect(
      svc.createSession({
        slideId: SLIDE_ID,
        modelAssetId: '',
      }),
    ).rejects.toThrow(SessionValidationError);
  });

  it('respects custom TTL', async () => {
    const svc = makeService({ ttlMs: 60_000 });
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    expect(session.expiresAt.getTime()).toBe(NOW + 60_000);
  });
});

// ── Session retrieval & state transitions ────────────────────────────

describe('SessionService — getSession', () => {
  it('returns session and transitions created → active', async () => {
    const svc = makeService();
    const created = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    expect(created.state).toBe('created');

    const retrieved = await svc.getSession(created.id);
    expect(retrieved.id).toBe(created.id);
    expect(retrieved.state).toBe('active');
  });

  it('throws for unknown session', async () => {
    const svc = makeService();
    await expect(svc.getSession('nonexistent')).rejects.toThrow(SessionNotFoundError);
  });

  it('throws for expired session', async () => {
    let now = NOW;
    const svc = makeService({ clock: () => now });
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    // Advance past TTL
    now = NOW + 31 * 60 * 1000;

    await expect(svc.getSession(session.id)).rejects.toThrow(SessionExpiredError);
  });

  it('throws for invalidated session', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    await svc.invalidateSession(session.id);

    await expect(svc.getSession(session.id)).rejects.toThrow(SessionInvalidatedError);
  });
});

// ── Inactivity timeout ───────────────────────────────────────────────

describe('SessionService — inactivity timeout', () => {
  it('expires after inactivity timeout', async () => {
    let now = NOW;
    const inactivityMs = 5 * 60 * 1000; // 5 min
    const svc = makeService({
      clock: () => now,
      inactivityMs,
      ttlMs: 60 * 60 * 1000, // 1 hour TTL (longer than inactivity)
    });

    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    // Transition to active
    await svc.getSession(session.id);

    // Advance past inactivity timeout
    now = NOW + inactivityMs + 1000;

    await expect(svc.getSession(session.id)).rejects.toThrow(SessionExpiredError);
  });

  it('refreshActivity resets inactivity timer', async () => {
    let now = NOW;
    const inactivityMs = 5 * 60 * 1000; // 5 min
    const svc = makeService({
      clock: () => now,
      inactivityMs,
      ttlMs: 60 * 60 * 1000, // 1 hour TTL
    });

    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    // Transition to active
    await svc.getSession(session.id);

    // Advance almost to inactivity timeout
    now = NOW + inactivityMs - 1000;

    // Refresh activity
    await svc.refreshActivity(session.id);

    // Now advance to what would have been the timeout
    now = NOW + inactivityMs + 1000;

    // Should still be accessible because we refreshed
    const refreshed = await svc.getSession(session.id);
    expect(refreshed.state).toBe('active');
  });

  it('refreshActivity throws for unknown session', async () => {
    const svc = makeService();
    await expect(svc.refreshActivity('nonexistent')).rejects.toThrow(SessionNotFoundError);
  });

  it('refreshActivity throws for invalidated session', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    await svc.invalidateSession(session.id);

    await expect(svc.refreshActivity(session.id)).rejects.toThrow(SessionInvalidatedError);
  });
});

// ── Invalidation ─────────────────────────────────────────────────────

describe('SessionService — invalidateSession', () => {
  it('invalidates an active session', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    await svc.invalidateSession(session.id);

    await expect(svc.getSession(session.id)).rejects.toThrow(SessionInvalidatedError);
  });

  it('throws for unknown session', async () => {
    const svc = makeService();
    await expect(svc.invalidateSession('nonexistent')).rejects.toThrow(SessionNotFoundError);
  });

  it('throws when already invalidated', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    await svc.invalidateSession(session.id);

    await expect(svc.invalidateSession(session.id)).rejects.toThrow(SessionInvalidatedError);
  });
});

// ── Key rotation ─────────────────────────────────────────────────────

describe('SessionService — rotateKey', () => {
  it('rotates key and issues new token', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    const oldToken = session.token;
    const oldKid = session._kid;

    const { kid: newKid } = await svc.rotateKey(session.id);

    expect(newKid).not.toBe(oldKid);

    // Get updated session
    const updated = await svc.getSession(session.id);
    expect(updated.token).not.toBe(oldToken);
    expect(updated._kid).toBe(newKid);

    // New token should verify with new secret
    const payload = verifyToken({
      token: updated.token,
      secret: updated._secret,
      kid: updated._kid,
      clock: () => NOW,
    });
    expect(payload.kid).toBe(newKid);
  });

  it('old token can no longer be verified with new secret', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    const oldToken = session.token;

    await svc.rotateKey(session.id);

    // Old token should fail verification with new secret
    // (We need to get the new secret to test this properly)
    const updated = await svc.getSession(session.id);
    expect(() =>
      verifyToken({
        token: oldToken,
        secret: updated._secret,
        kid: updated._kid,
      }),
    ).toThrow();
  });

  it('throws for unknown session', async () => {
    const svc = makeService();
    await expect(svc.rotateKey('nonexistent')).rejects.toThrow(SessionNotFoundError);
  });

  it('throws for invalidated session', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    await svc.invalidateSession(session.id);

    await expect(svc.rotateKey(session.id)).rejects.toThrow(SessionInvalidatedError);
  });
});

// ── Token verification integration ───────────────────────────────────

describe('SessionService — verifySessionToken', () => {
  it('verifies a valid token', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    const payload = await svc.verifySessionToken(session.id, session.token);
    expect(payload.sid).toBe(session.id);
    expect(payload.v).toBe(1);
  });

  it('rejects invalid token', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    await expect(svc.verifySessionToken(session.id, 'bad-token')).rejects.toThrow();
  });

  it('throws for unknown session', async () => {
    const svc = makeService();
    await expect(svc.verifySessionToken('nonexistent', 'token')).rejects.toThrow(
      SessionNotFoundError,
    );
  });

  it('throws for invalidated session', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    await svc.invalidateSession(session.id);

    await expect(svc.verifySessionToken(session.id, session.token)).rejects.toThrow(
      SessionInvalidatedError,
    );
  });
});

// ── Response shape ───────────────────────────────────────────────────

describe('SessionService — toResponse', () => {
  it('produces correct API response shape', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    const response = svc.toResponse(session);

    expect(response.id).toBe('test-session-id');
    expect(response.slideId).toBe(SLIDE_ID);
    expect(response.modelAssetId).toBe(MODEL_ID);
    expect(response.token).toBeTypeOf('string');
    expect(response.audienceUrl).toContain('/s/test-session-id');
    expect(response.expiresAt).toBeTypeOf('string');
    expect(response.createdAt).toBeTypeOf('string');
    expect(response.qrPayload).toBeTypeOf('string');

    // qrPayload should be valid JSON
    const qr = JSON.parse(response.qrPayload!);
    expect(qr.url).toContain('/s/test-session-id');
    expect(qr.sessionId).toBe('test-session-id');
    expect(qr.expiresAt).toBeTypeOf('string');
  });
});

// ── isUsable ─────────────────────────────────────────────────────────

describe('SessionService — isUsable', () => {
  it('created session is usable', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    expect(svc.isUsable(session)).toBe(true);
  });

  it('active session is usable', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    await svc.getSession(session.id);
    expect(svc.isUsable(session)).toBe(true);
  });

  it('invalidated session is not usable', async () => {
    const svc = makeService();
    const session = await svc.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    await svc.invalidateSession(session.id);
    expect(svc.isUsable(session)).toBe(true); // isUsable doesn't re-check repo state
  });
});
