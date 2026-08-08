/**
 * Guest handlers unit tests (Phase 18).
 *
 * Tests verify all 5 REST endpoints return correct status codes and bodies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlers } from './handlers.js';
import { GuestService } from './service.js';
import { InMemoryGuestStore } from './store/mem_store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmitter() {
  return { publish: vi.fn(async () => {}) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeReq(overrides: Record<string, unknown> = {}): any {
  return {
    method: 'GET',
    path: '/',
    params: overrides['params'] ?? {},
    body: overrides['body'] ?? {},
    query: overrides['query'] ?? {},
    headers: overrides['headers'] ?? {},
  };
}

// ---------------------------------------------------------------------------
// createGuest
// ---------------------------------------------------------------------------

describe('handlers — createGuest', () => {
  let store: InMemoryGuestStore;

  beforeEach(() => {
    store = new InMemoryGuestStore();
  });

  it('returns 201 with guest and token', async () => {
    const service = new GuestService({ store, eventEmitter: makeEmitter() });
    const ctx = { service };

    const res = await handlers.createGuest(
      makeReq({
        body: {
          workspace_id: 'ws-001',
          guest_email: 'guest@example.com',
          scope_type: 'deck',
          scope_id: 'deck-001',
        },
        headers: { 'x-actor-id': 'inviter-001' },
      }),
      ctx,
    );

    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;
    expect(body['guest']).toBeDefined();
    expect(body['magic_link_token']).toBeDefined();
  });

  it('returns 503 when feature disabled', async () => {
    process.env['FEATURE_COLLAB_GUESTS_DISABLED'] = 'true';
    try {
      const service = new GuestService({ store, eventEmitter: makeEmitter() });
      const ctx = { service };

      const res = await handlers.createGuest(
        makeReq({
          body: {
            workspace_id: 'ws-001',
            guest_email: 'guest@example.com',
            scope_type: 'deck',
            scope_id: 'deck-001',
          },
          headers: { 'x-actor-id': 'inviter-001' },
        }),
        ctx,
      );

      expect(res.status).toBe(503);
      const body = res.body as Record<string, unknown>;
      expect(body['code']).toBe('FEATURE_DISABLED');
    } finally {
      delete process.env['FEATURE_COLLAB_GUESTS_DISABLED'];
    }
  });
});

// ---------------------------------------------------------------------------
// getGuest
// ---------------------------------------------------------------------------

describe('handlers — getGuest', () => {
  let store: InMemoryGuestStore;

  beforeEach(() => {
    store = new InMemoryGuestStore();
  });

  it('returns 200 with guest', async () => {
    const service = new GuestService({ store, eventEmitter: makeEmitter() });
    const { guest } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );
    const ctx = { service };

    const res = await handlers.getGuest(
      makeReq({ params: { id: guest.guest_access_id } }),
      ctx,
    );

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    const g = body['guest'] as Record<string, unknown>;
    expect(g['guest_access_id']).toBe(guest.guest_access_id);
  });

  it('returns 404 when not found', async () => {
    const service = new GuestService({ store, eventEmitter: makeEmitter() });
    const ctx = { service };

    const res = await handlers.getGuest(
      makeReq({ params: { id: 'nonexistent' } }),
      ctx,
    );

    expect(res.status).toBe(404);
    const body = res.body as Record<string, unknown>;
    expect(body['code']).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// deleteGuest
// ---------------------------------------------------------------------------

describe('handlers — deleteGuest', () => {
  let store: InMemoryGuestStore;

  beforeEach(() => {
    store = new InMemoryGuestStore();
  });

  it('returns 204 on success', async () => {
    const service = new GuestService({ store, eventEmitter: makeEmitter() });
    const { guest } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );
    const ctx = { service };

    const res = await handlers.deleteGuest(
      makeReq({
        params: { id: guest.guest_access_id },
        headers: { 'x-actor-id': 'inviter-001' },
      }),
      ctx,
    );

    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    const service = new GuestService({ store, eventEmitter: makeEmitter() });
    const ctx = { service };

    const res = await handlers.deleteGuest(
      makeReq({ params: { id: 'nonexistent' }, headers: { 'x-actor-id': 'inviter-001' } }),
      ctx,
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// resendGuestMagicLink
// ---------------------------------------------------------------------------

describe('handlers — resendGuestMagicLink', () => {
  let store: InMemoryGuestStore;

  beforeEach(() => {
    store = new InMemoryGuestStore();
  });

  it('returns 200 with new token', async () => {
    const service = new GuestService({ store, eventEmitter: makeEmitter() });
    const { guest } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );
    const ctx = { service };

    const res = await handlers.resendGuestMagicLink(
      makeReq({
        params: { id: guest.guest_access_id },
        headers: { 'x-actor-id': 'inviter-001' },
      }),
      ctx,
    );

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body['magic_link_token']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// consumeGuestMagicLink
// ---------------------------------------------------------------------------

describe('handlers — consumeGuestMagicLink', () => {
  let store: InMemoryGuestStore;

  beforeEach(() => {
    store = new InMemoryGuestStore();
  });

  it('returns 200 with result', async () => {
    const service = new GuestService({ store, eventEmitter: makeEmitter() });
    const { magic_link_token } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );
    const ctx = { service };

    const res = await handlers.consumeGuestMagicLink(
      makeReq({
        body: { token: magic_link_token, guest_user_id: 'user-001' },
      }),
      ctx,
    );

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body['guest_access']).toBeDefined();
    expect(body['magic_link']).toBeDefined();
  });

  it('returns 401 for invalid token', async () => {
    const service = new GuestService({ store, eventEmitter: makeEmitter() });
    const ctx = { service };

    const res = await handlers.consumeGuestMagicLink(
      makeReq({ body: { token: 'invalid-token' } }),
      ctx,
    );

    expect(res.status).toBe(401);
    const body = res.body as Record<string, unknown>;
    expect(body['code']).toBe('MAGIC_LINK_INVALID');
  });

  it('returns 410 for consumed token', async () => {
    const service = new GuestService({ store, eventEmitter: makeEmitter() });
    const { magic_link_token } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );
    const ctx = { service };

    // First consume
    await handlers.consumeGuestMagicLink(
      makeReq({ body: { token: magic_link_token } }),
      ctx,
    );

    // Second consume
    const res = await handlers.consumeGuestMagicLink(
      makeReq({ body: { token: magic_link_token } }),
      ctx,
    );

    expect(res.status).toBe(410);
    const body = res.body as Record<string, unknown>;
    expect(body['code']).toBe('MAGIC_LINK_CONSUMED');
  });
});
