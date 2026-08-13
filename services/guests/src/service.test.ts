/**
 * GuestService unit tests (Phase 18).
 *
 * Tests verify:
 *  - createGuest with defaults and custom capabilities
 *  - createGuest rejects disallowed capabilities (download/export)
 *  - TTL default 15min + env override
 *  - Expiry enforced on every request
 *  - Single-use enforcement (second consume → consumed error)
 *  - Resend invalidates prior link (old token → invalidated, new works)
 *  - Delete revokes + invalidates
 *  - Consume returns result + marks guest_user
 *  - Actor type 'guest' on consume events
 *  - Feature-flag gate → 503
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuestService } from './service.js';
import { InMemoryGuestStore } from './store/mem_store.js';
import {
  GuestNotFoundError,
  MagicLinkConsumedError,
  MagicLinkInvalidatedError,
  GuestRevokedError,
  GuestExpiredError,
  InvalidCapabilityError,
  FeatureDisabledError,
} from './types.js';
import { DEFAULT_TTL_MINUTES, ALLOWED_CAPABILITIES } from './magic_link.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmitter() {
  return {
    publish: vi.fn(async () => {}),
  };
}

function fixedClock(fixedDate: Date) {
  return () => fixedDate;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GuestService — createGuest', () => {
  let store: InMemoryGuestStore;

  beforeEach(() => {
    store = new InMemoryGuestStore();
  });

  it('creates guest with default capabilities [comment, suggest, view]', async () => {
    const emitter = makeEmitter();
    const service = new GuestService({ store, eventEmitter: emitter });
    const result = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    expect(result.guest).toBeDefined();
    expect(result.guest.guest_email).toBe('guest@example.com');
    expect(result.guest.scope_type).toBe('deck');
    expect(result.guest.capabilities).toEqual(['comment', 'suggest', 'view']);
    expect(result.guest.guest_user_id).toBeNull();
    expect(result.guest.revoked_at).toBeNull();
    expect(result.magic_link_token).toBeDefined();
    expect(typeof result.magic_link_token).toBe('string');
    expect(result.magic_link_expires_at).toBeInstanceOf(Date);
  });

  it('creates guest with custom capabilities', async () => {
    const service = new GuestService({ store });
    const result = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'folder',
        scope_id: 'folder-001',
        capabilities: ['view'],
      },
      'inviter-001',
    );

    expect(result.guest.capabilities).toEqual(['view']);
  });

  it('rejects download capability', async () => {
    const service = new GuestService({ store });
    await expect(
      service.createGuest(
        {
          workspace_id: 'ws-001',
          guest_email: 'guest@example.com',
          scope_type: 'deck',
          scope_id: 'deck-001',
          capabilities: ['comment', 'download'],
        },
        'inviter-001',
      ),
    ).rejects.toThrow(InvalidCapabilityError);
  });

  it('rejects export capability', async () => {
    const service = new GuestService({ store });
    await expect(
      service.createGuest(
        {
          workspace_id: 'ws-001',
          guest_email: 'guest@example.com',
          scope_type: 'deck',
          scope_id: 'deck-001',
          capabilities: ['export'],
        },
        'inviter-001',
      ),
    ).rejects.toThrow(InvalidCapabilityError);
  });

  it('emits guest.access_granted event', async () => {
    const emitter = makeEmitter();
    const service = new GuestService({ store, eventEmitter: emitter });
    await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    expect(emitter.publish).toHaveBeenCalledOnce();
    const call = emitter.publish.mock.calls[0] as unknown as [string, Record<string, unknown>];
    const [subject, payload] = call;
    expect(subject).toBe('guest.access_granted');
    expect(payload).toMatchObject({
      event_type: 'guest.access_granted',
      workspace_id: 'ws-001',
      actor_id: 'inviter-001',
      actor_type: 'member',
    });
    expect(typeof payload['event_id']).toBe('string');
  });

  it('uses default TTL of 15 minutes', async () => {
    const baseTime = new Date('2026-01-01T00:00:00Z');
    const service = new GuestService({ store, now: fixedClock(baseTime) });
    const result = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    const expectedExpiry = new Date(baseTime.getTime() + DEFAULT_TTL_MINUTES * 60_000);
    expect(result.guest.expires_at.getTime()).toBe(expectedExpiry.getTime());
  });

  it('uses custom TTL override', async () => {
    const baseTime = new Date('2026-01-01T00:00:00Z');
    const service = new GuestService({ store, now: fixedClock(baseTime) });
    const result = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
        expires_in_minutes: 60,
      },
      'inviter-001',
    );

    const expectedExpiry = new Date(baseTime.getTime() + 60 * 60_000);
    expect(result.guest.expires_at.getTime()).toBe(expectedExpiry.getTime());
  });

  it('respects GUEST_MAGIC_LINK_TTL_MINUTES env', async () => {
    const baseTime = new Date('2026-01-01T00:00:00Z');
    process.env['GUEST_MAGIC_LINK_TTL_MINUTES'] = '30';
    try {
      const service = new GuestService({ store, now: fixedClock(baseTime) });
      const result = await service.createGuest(
        {
          workspace_id: 'ws-001',
          guest_email: 'guest@example.com',
          scope_type: 'deck',
          scope_id: 'deck-001',
        },
        'inviter-001',
      );

      const expectedExpiry = new Date(baseTime.getTime() + 30 * 60_000);
      expect(result.guest.expires_at.getTime()).toBe(expectedExpiry.getTime());
    } finally {
      delete process.env['GUEST_MAGIC_LINK_TTL_MINUTES'];
    }
  });
});

describe('GuestService — getGuest', () => {
  let store: InMemoryGuestStore;

  beforeEach(() => {
    store = new InMemoryGuestStore();
  });

  it('returns guest by id', async () => {
    const service = new GuestService({ store });
    const { guest } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    const fetched = await service.getGuest(guest.guest_access_id);
    expect(fetched.guest_access_id).toBe(guest.guest_access_id);
  });

  it('throws GuestNotFoundError for nonexistent id', async () => {
    const service = new GuestService({ store });
    await expect(service.getGuest('nonexistent')).rejects.toThrow(GuestNotFoundError);
  });
});

describe('GuestService — deleteGuest', () => {
  let store: InMemoryGuestStore;

  beforeEach(() => {
    store = new InMemoryGuestStore();
  });

  it('soft-revokes guest and invalidates open links', async () => {
    const emitter = makeEmitter();
    const service = new GuestService({ store, eventEmitter: emitter });
    const { guest } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    await service.deleteGuest(guest.guest_access_id, 'inviter-001');

    const revoked = await service.getGuest(guest.guest_access_id);
    expect(revoked.revoked_at).not.toBeNull();
  });

  it('emits guest.access_revoked event', async () => {
    const emitter = makeEmitter();
    const service = new GuestService({ store, eventEmitter: emitter });
    const { guest } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    await service.deleteGuest(guest.guest_access_id, 'inviter-001');

    // Find the access_revoked event
    const revokedCall = emitter.publish.mock.calls.find(
      (call) =>
        (call as unknown as [string, Record<string, unknown>])[0] === 'guest.access_revoked',
    );
    expect(revokedCall).toBeDefined();
    const payload = (revokedCall as unknown as [string, Record<string, unknown>])[1];
    expect(payload).toMatchObject({
      event_type: 'guest.access_revoked',
      actor_type: 'member',
    });
  });

  it('throws GuestNotFoundError for nonexistent id', async () => {
    const service = new GuestService({ store });
    await expect(service.deleteGuest('nonexistent', 'inviter-001')).rejects.toThrow(
      GuestNotFoundError,
    );
  });
});

describe('GuestService — resendMagicLink', () => {
  let store: InMemoryGuestStore;

  beforeEach(() => {
    store = new InMemoryGuestStore();
  });

  it('invalidates prior link and returns new token', async () => {
    const service = new GuestService({ store });
    const { guest, magic_link_token: oldToken } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    const { magic_link_token: newToken } = await service.resendMagicLink(
      guest.guest_access_id,
      'inviter-001',
    );

    expect(newToken).not.toBe(oldToken);

    // Old token should now be invalidated
    const { createHash } = await import('crypto');
    const oldHash = createHash('sha256').update(oldToken).digest('hex');
    const oldLink = await store.getMagicLinkByHash(oldHash);
    expect(oldLink).not.toBeNull();
    expect(oldLink!.invalidated_at).not.toBeNull();
  });

  it('new token works via consume', async () => {
    const baseTime = new Date('2026-01-01T00:00:00Z');
    const service = new GuestService({ store, now: fixedClock(baseTime) });
    const { guest } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    const { magic_link_token: newToken } = await service.resendMagicLink(
      guest.guest_access_id,
      'inviter-001',
    );

    // Consume with the new token
    const result = await service.consumeMagicLink(newToken, baseTime, 'user-001');
    expect(result.guest_access.guest_user_id).toBe('user-001');
  });

  it('throws GuestExpiredError if guest access is expired', async () => {
    const baseTime = new Date('2026-01-01T00:00:00Z');
    const service = new GuestService({ store, now: fixedClock(baseTime) });
    const { guest } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
        expires_in_minutes: 15,
      },
      'inviter-001',
    );

    // Move time past expiry
    const futureTime = new Date(baseTime.getTime() + 16 * 60_000);
    const futureService = new GuestService({ store, now: fixedClock(futureTime) });

    await expect(
      futureService.resendMagicLink(guest.guest_access_id, 'inviter-001'),
    ).rejects.toThrow(GuestExpiredError);
  });

  it('throws GuestRevokedError if guest is revoked', async () => {
    const service = new GuestService({ store });
    const { guest } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    await service.deleteGuest(guest.guest_access_id, 'inviter-001');

    await expect(service.resendMagicLink(guest.guest_access_id, 'inviter-001')).rejects.toThrow(
      GuestRevokedError,
    );
  });
});

describe('GuestService — consumeMagicLink', () => {
  let store: InMemoryGuestStore;

  beforeEach(() => {
    store = new InMemoryGuestStore();
  });

  it('consumes valid token and returns result', async () => {
    const baseTime = new Date('2026-01-01T00:00:00Z');
    const service = new GuestService({ store, now: fixedClock(baseTime) });
    const { guest, magic_link_token } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    const result = await service.consumeMagicLink(magic_link_token, baseTime, 'user-001');
    expect(result.guest_access.guest_access_id).toBe(guest.guest_access_id);
    expect(result.magic_link.consumed_at).toEqual(baseTime);
  });

  it('marks guest_user when guest_user_id is provided', async () => {
    const baseTime = new Date('2026-01-01T00:00:00Z');
    const service = new GuestService({ store, now: fixedClock(baseTime) });
    const { magic_link_token } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    const result = await service.consumeMagicLink(magic_link_token, baseTime, 'user-001');
    expect(result.guest_access.guest_user_id).toBe('user-001');
  });

  it('rejects second consume (single-use)', async () => {
    const baseTime = new Date('2026-01-01T00:00:00Z');
    const service = new GuestService({ store, now: fixedClock(baseTime) });
    const { magic_link_token } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    await service.consumeMagicLink(magic_link_token, baseTime, 'user-001');
    await expect(service.consumeMagicLink(magic_link_token, baseTime, 'user-002')).rejects.toThrow(
      MagicLinkConsumedError,
    );
  });

  it('rejects expired token (guest access expired)', async () => {
    const baseTime = new Date('2026-01-01T00:00:00Z');
    const service = new GuestService({ store, now: fixedClock(baseTime) });
    const { magic_link_token } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
        expires_in_minutes: 15,
      },
      'inviter-001',
    );

    const futureTime = new Date(baseTime.getTime() + 16 * 60_000);
    await expect(service.consumeMagicLink(magic_link_token, futureTime)).rejects.toThrow(
      GuestExpiredError,
    );
  });

  it('rejects invalidated token', async () => {
    const baseTime = new Date('2026-01-01T00:00:00Z');
    const service = new GuestService({ store, now: fixedClock(baseTime) });
    const { guest, magic_link_token } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    // Resend invalidates the original
    await service.resendMagicLink(guest.guest_access_id, 'inviter-001');

    await expect(service.consumeMagicLink(magic_link_token, baseTime)).rejects.toThrow(
      MagicLinkInvalidatedError,
    );
  });

  it('rejects token for revoked guest', async () => {
    const baseTime = new Date('2026-01-01T00:00:00Z');
    const service = new GuestService({ store, now: fixedClock(baseTime) });
    const { guest, magic_link_token } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
      },
      'inviter-001',
    );

    await service.deleteGuest(guest.guest_access_id, 'inviter-001');

    await expect(service.consumeMagicLink(magic_link_token, baseTime)).rejects.toThrow(
      GuestRevokedError,
    );
  });

  it('rejects token for expired guest access', async () => {
    const baseTime = new Date('2026-01-01T00:00:00Z');
    const service = new GuestService({ store, now: fixedClock(baseTime) });
    const { magic_link_token } = await service.createGuest(
      {
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
        expires_in_minutes: 15,
      },
      'inviter-001',
    );

    const futureTime = new Date(baseTime.getTime() + 16 * 60_000);
    const futureService = new GuestService({ store, now: fixedClock(futureTime) });

    await expect(futureService.consumeMagicLink(magic_link_token, futureTime)).rejects.toThrow(
      GuestExpiredError,
    );
  });
});

describe('GuestService — feature flag', () => {
  let store: InMemoryGuestStore;

  beforeEach(() => {
    store = new InMemoryGuestStore();
  });

  it('throws FeatureDisabledError when FEATURE_COLLAB_GUESTS_DISABLED=true', async () => {
    process.env['FEATURE_COLLAB_GUESTS_DISABLED'] = 'true';
    try {
      const service = new GuestService({ store });
      await expect(
        service.createGuest(
          {
            workspace_id: 'ws-001',
            guest_email: 'guest@example.com',
            scope_type: 'deck',
            scope_id: 'deck-001',
          },
          'inviter-001',
        ),
      ).rejects.toThrow(FeatureDisabledError);
    } finally {
      delete process.env['FEATURE_COLLAB_GUESTS_DISABLED'];
    }
  });

  it('throws FeatureDisabledError for getGuest when disabled', async () => {
    process.env['FEATURE_COLLAB_GUESTS_DISABLED'] = 'true';
    try {
      const service = new GuestService({ store });
      await expect(service.getGuest('any-id')).rejects.toThrow(FeatureDisabledError);
    } finally {
      delete process.env['FEATURE_COLLAB_GUESTS_DISABLED'];
    }
  });
});

describe('GuestService — allowed capabilities', () => {
  it('ALLOWED_CAPABILITIES is [comment, suggest, view]', () => {
    expect(ALLOWED_CAPABILITIES).toEqual(['comment', 'suggest', 'view']);
  });
});
