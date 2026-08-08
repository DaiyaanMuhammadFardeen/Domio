/**
 * Expiry service tests (Phase 18).
 */

import { describe, it, expect, vi } from 'vitest';
import { ExpiryService } from './service.js';
import { InMemoryExpiryStore } from './store/mem_store.js';
import type { ExpiryEventEmitter, ShareRevoker, WorkspaceDefaults } from './types.js';
import { FeatureDisabledError, PolicyNotFoundError } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createService(opts?: {
  emitter?: ExpiryEventEmitter;
  shareRevoker?: ShareRevoker;
  isLegalHold?: (resourceType: string, resourceId: string) => boolean | Promise<boolean>;
  getWorkspaceDefaults?: (workspaceId: string) => Promise<WorkspaceDefaults | null>;
  now?: () => Date;
}) {
  const store = new InMemoryExpiryStore();
  // Build options without undefined optional fields to satisfy exactOptionalPropertyTypes
  const serviceOpts: Record<string, unknown> = { store };
  if (opts?.emitter !== undefined) serviceOpts.eventEmitter = opts.emitter;
  if (opts?.shareRevoker !== undefined) serviceOpts.shareRevoker = opts.shareRevoker;
  if (opts?.isLegalHold !== undefined) serviceOpts.isLegalHold = opts.isLegalHold;
  if (opts?.getWorkspaceDefaults !== undefined) serviceOpts.getWorkspaceDefaults = opts.getWorkspaceDefaults;
  if (opts?.now !== undefined) serviceOpts.now = opts.now;
  return {
    service: new ExpiryService(serviceOpts as unknown as import('./service.js').ExpiryServiceOptions),
    store,
  };
}

function createEvents(): { events: Array<{ subject: string; payload: Record<string, unknown> }>; emitter: ExpiryEventEmitter } {
  const events: Array<{ subject: string; payload: Record<string, unknown> }> = [];
  const emitter: ExpiryEventEmitter = {
    async publish(subject, payload) {
      events.push({ subject, payload });
    },
  };
  return { events, emitter };
}

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

describe('ExpiryService', () => {
  it('feature flag off → 503 (FeatureDisabledError)', async () => {
    const { service } = createService();
    process.env['FEATURE_COLLAB_EXPIRY_DISABLED'] = 'true';
    try {
      await service.listPolicies('ws1');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(FeatureDisabledError);
    } finally {
      delete process.env['FEATURE_COLLAB_EXPIRY_DISABLED'];
    }
  });

  // -------------------------------------------------------------------------
  // upsertPolicy
  // -------------------------------------------------------------------------

  it('upsertPolicy creates and returns policy', async () => {
    const { service } = createService();
    const policy = await service.upsertPolicy(
      {
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: 30,
        escalation: 'moderate',
      },
      'user1',
    );

    expect(policy.id).toBeTruthy();
    expect(policy.workspace_id).toBe('ws1');
    expect(policy.resource_type).toBe('deck');
    expect(policy.resource_id).toBe('d1');
    expect(policy.interval_days).toBe(30);
    expect(policy.escalation).toBe('moderate');
    expect(policy.created_by).toBe('user1');
  });

  it('upsertPolicy validates input', async () => {
    const { service } = createService();
    await expect(
      service.upsertPolicy(
        {
          workspace_id: '',
          resource_type: 'deck',
          resource_id: 'd1',
          interval_days: 30,
        },
        'user1',
      ),
    ).rejects.toThrow('workspace_id is required');
  });

  it('upsertPolicy validates interval_days', async () => {
    const { service } = createService();
    await expect(
      service.upsertPolicy(
        {
          workspace_id: 'ws1',
          resource_type: 'deck',
          resource_id: 'd1',
          interval_days: 0,
        },
        'user1',
      ),
    ).rejects.toThrow('interval_days must be a positive integer');
  });

  // -------------------------------------------------------------------------
  // getPolicy
  // -------------------------------------------------------------------------

  it('getPolicy returns existing policy', async () => {
    const { service } = createService();
    await service.upsertPolicy(
      {
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: 30,
      },
      'user1',
    );
    const policy = await service.getPolicy('deck', 'd1');
    expect(policy.id).toBeTruthy();
    expect(policy.interval_days).toBe(30);
  });

  it('getPolicy throws PolicyNotFoundError', async () => {
    const { service } = createService();
    await expect(service.getPolicy('deck', 'missing')).rejects.toThrow(PolicyNotFoundError);
  });

  // -------------------------------------------------------------------------
  // scanResource — overdue + emit
  // -------------------------------------------------------------------------

  it('scan flags overdue resources and emits expiry.flag_applied', async () => {
    const { events, emitter } = createEvents();
    const fixedNow = new Date('2025-06-01T12:00:00Z');
    const { service, store } = createService({
      emitter,
      now: () => fixedNow,
    });

    // Insert a policy with 7-day interval
    await service.upsertPolicy(
      {
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: 7,
        escalation: 'gentle',
      },
      'user1',
    );

    // Resource was last reviewed 10 days ago — overdue
    const lastReviewedAt = new Date('2025-05-22T12:00:00Z');
    const result = await service.scanResource('ws1', 'deck', 'd1', lastReviewedAt);

    expect(result.flagged).toBe(true);
    expect(result.revoked).toBe(false);

    // Check flag was inserted
    const flags = await store.listOpenFlags('deck', 'd1');
    expect(flags).toHaveLength(1);
    expect(flags[0]!.reason).toBe('policy_overdue');

    // Check event emitted
    const flagEvent = events.find(e => e.subject === 'expiry.flag_applied');
    expect(flagEvent).toBeTruthy();
    expect(flagEvent!.payload['payload']).toEqual(expect.objectContaining({ escalation: 'gentle' }));
  });

  // -------------------------------------------------------------------------
  // strict tier calls shareRevoker + emits expiry.share_revoked
  // -------------------------------------------------------------------------

  it('strict tier calls shareRevoker and emits expiry.share_revoked', async () => {
    const { events, emitter } = createEvents();
    const fixedNow = new Date('2025-06-01T12:00:00Z');
    const revokeShare = vi.fn().mockResolvedValue({ share_link_id: 'sl1' });
    const { service } = createService({
      emitter,
      shareRevoker: { revokeShare },
      now: () => fixedNow,
    });

    await service.upsertPolicy(
      {
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: 7,
        escalation: 'strict',
        auto_revoke_share: true,
      },
      'user1',
    );

    const lastReviewedAt = new Date('2025-05-22T12:00:00Z');
    const result = await service.scanResource('ws1', 'deck', 'd1', lastReviewedAt);

    expect(result.flagged).toBe(true);
    expect(result.revoked).toBe(true);
    expect(revokeShare).toHaveBeenCalledOnce();
    expect(revokeShare).toHaveBeenCalledWith('deck', 'd1', expect.objectContaining({ escalation: 'strict' }));

    // Check share_revoked event
    const revokeEvent = events.find(e => e.subject === 'expiry.share_revoked');
    expect(revokeEvent).toBeTruthy();
    expect(revokeEvent!.payload['payload']).toEqual(expect.objectContaining({ share_link_id: 'sl1' }));
  });

  // -------------------------------------------------------------------------
  // legal-hold suppresses flagging
  // -------------------------------------------------------------------------

  it('legal-hold suppresses flagging', async () => {
    const fixedNow = new Date('2025-06-01T12:00:00Z');
    const { service } = createService({
      isLegalHold: () => true,
      now: () => fixedNow,
    });

    await service.upsertPolicy(
      {
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: 7,
      },
      'user1',
    );

    const result = await service.scanResource('ws1', 'deck', 'd1', new Date('2025-05-01'));
    expect(result.flagged).toBe(false);
    expect(result.revoked).toBe(false);
  });

  // -------------------------------------------------------------------------
  // open-flag idempotency — no double insert
  // -------------------------------------------------------------------------

  it('open-flag idempotency — no double insert', async () => {
    const fixedNow = new Date('2025-06-01T12:00:00Z');
    const { service, store } = createService({ now: () => fixedNow });

    await service.upsertPolicy(
      {
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: 7,
      },
      'user1',
    );

    const lastReviewedAt = new Date('2025-05-22T12:00:00Z');

    // First scan — flags
    const result1 = await service.scanResource('ws1', 'deck', 'd1', lastReviewedAt);
    expect(result1.flagged).toBe(true);

    // Second scan — already flagged, should not flag again
    const result2 = await service.scanResource('ws1', 'deck', 'd1', lastReviewedAt);
    expect(result2.flagged).toBe(false);

    // Only one flag exists
    const flags = await store.listOpenFlags('deck', 'd1');
    expect(flags).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // confirmFreshness resolves flags
  // -------------------------------------------------------------------------

  it('confirmFreshness resolves open flags', async () => {
    const { events, emitter } = createEvents();
    const fixedNow = new Date('2025-06-01T12:00:00Z');
    const { service, store } = createService({ emitter, now: () => fixedNow });

    await service.upsertPolicy(
      {
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: 7,
      },
      'user1',
    );

    // Create a flag
    await service.scanResource('ws1', 'deck', 'd1', new Date('2025-05-22'));

    // Confirm freshness
    const { resolved } = await service.confirmFreshness('deck', 'd1', 'user2');
    expect(resolved).toBe(1);

    // No more open flags
    const openFlags = await store.listOpenFlags('deck', 'd1');
    expect(openFlags).toHaveLength(0);

    // Event emitted
    const confirmEvent = events.find(e => e.subject === 'expiry.freshness_confirmed');
    expect(confirmEvent).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // moderate tier notifies without revoking
  // -------------------------------------------------------------------------

  it('moderate tier notifies without revoking', async () => {
    const { events, emitter } = createEvents();
    const fixedNow = new Date('2025-06-01T12:00:00Z');
    const revokeShare = vi.fn().mockResolvedValue(null);
    const { service } = createService({
      emitter,
      shareRevoker: { revokeShare },
      now: () => fixedNow,
    });

    await service.upsertPolicy(
      {
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: 7,
        escalation: 'moderate',
      },
      'user1',
    );

    const result = await service.scanResource('ws1', 'deck', 'd1', new Date('2025-05-22'));

    expect(result.flagged).toBe(true);
    expect(result.revoked).toBe(false);
    expect(revokeShare).not.toHaveBeenCalled();

    // Notification event emitted
    const notifyEvent = events.find(e => e.subject === 'expiry.notification');
    expect(notifyEvent).toBeTruthy();
    expect(notifyEvent!.payload['payload']).toEqual(expect.objectContaining({ escalation: 'moderate' }));
  });
});
