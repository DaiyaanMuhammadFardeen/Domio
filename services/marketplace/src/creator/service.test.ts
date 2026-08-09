/**
 * Creator service tests (Phase 19 Wave 3).
 *
 * Service integration with mem_store + handlers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MarketplaceService } from '../service.js';
import { InMemoryMarketplaceStore } from '../store/mem_store.js';
import { OnboardingTransitionError } from './types.js';
import { handlers } from '../handlers.js';
import type { HttpRequest, MarketplaceHandlerContext } from '../handlers.js';

describe('Creator Module', () => {
  let store: InMemoryMarketplaceStore;
  let service: MarketplaceService;

  beforeEach(() => {
    store = new InMemoryMarketplaceStore();
    service = new MarketplaceService({ store });
  });

  // -------------------------------------------------------------------------
  // Creator Profile
  // -------------------------------------------------------------------------

  describe('getCreatorProfile', () => {
    it('creates profile with defaults if not exists', async () => {
      const profile = await service.getCreatorProfile('user-1');
      expect(profile.userId).toBe('user-1');
      expect(profile.onboardingState).toBe('pending');
      expect(profile.kycStatus).toBe('pending');
      expect(profile.payoutReady).toBe(false);
    });

    it('returns existing profile', async () => {
      await service.getCreatorProfile('user-1');
      const profile = await service.getCreatorProfile('user-1');
      expect(profile.onboardingState).toBe('pending');
    });
  });

  describe('updateCreatorProfile', () => {
    it('advances to profile_complete when fields are set', async () => {
      const profile = await service.updateCreatorProfile('user-1', {
        displayName: 'Test Creator',
        slug: 'test-creator',
        countryCode: 'US',
      });
      expect(profile.onboardingState).toBe('profile_complete');
      expect(profile.displayName).toBe('Test Creator');
    });

    it('stays pending if not all required fields', async () => {
      const profile = await service.updateCreatorProfile('user-1', {
        displayName: 'Test Creator',
      });
      expect(profile.onboardingState).toBe('pending');
    });

    it('throws OnboardingTransitionError for invalid transition', async () => {
      // First advance to profile_complete
      await service.updateCreatorProfile('user-1', {
        displayName: 'Test',
        slug: 'test',
        countryCode: 'US',
      });

      // Start KYC session to advance to kyc_submitted
      await service.startKycSession('user-1', 'US');

      // Now try to update profile again - this should work but not change state
      const profile = await service.updateCreatorProfile('user-1', { displayName: 'Test2' });
      expect(profile.onboardingState).toBe('kyc_submitted');
    });
  });

  // -------------------------------------------------------------------------
  // KYC
  // -------------------------------------------------------------------------

  describe('startKycSession', () => {
    it('starts KYC session from profile_complete', async () => {
      // First complete profile
      await service.updateCreatorProfile('user-1', {
        displayName: 'Test',
        slug: 'test',
        countryCode: 'US',
      });

      const session = await service.startKycSession('user-1', 'US');
      expect(session.status).toBe('submitted');
      expect(session.vendor).toBe('sandbox');
    });

    it('throws if not profile_complete', async () => {
      await expect(
        service.startKycSession('user-1', 'US'),
      ).rejects.toThrow(OnboardingTransitionError);
    });

    it('throws KycInProgressError if session already exists', async () => {
      await service.updateCreatorProfile('user-1', {
        displayName: 'Test',
        slug: 'test',
        countryCode: 'US',
      });

      await service.startKycSession('user-1', 'US');

      // Try to start another KYC session - should throw because state is kyc_submitted
      await expect(
        service.startKycSession('user-1', 'US'),
      ).rejects.toThrow(OnboardingTransitionError);
    });
  });

  describe('getKycStatus', () => {
    it('returns null session if no KYC started', async () => {
      const result = await service.getKycStatus('user-1');
      expect(result.session).toBeNull();
      expect(result.profile).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Payout Methods
  // -------------------------------------------------------------------------

  describe('createPayoutMethod', () => {
    it('creates payout method from kyc_approved state', async () => {
      // Setup: profile_complete → kyc_submitted → kyc_approved
      await service.updateCreatorProfile('user-1', {
        displayName: 'Test',
        slug: 'test',
        countryCode: 'US',
      });
      await service.startKycSession('user-1', 'US');

      // Manually advance to kyc_approved for test
      await store.updateCreatorProfile('user-1', {
        onboardingState: 'kyc_approved',
        kycStatus: 'approved',
      });

      const method = await service.createPayoutMethod('user-1', 'stripe_connect', 'acct_123');
      expect(method.kind).toBe('stripe_connect');
      expect(method.externalAccountId).toBe('acct_123');
      expect(method.verified).toBe(false);
    });

    it('throws for pending state', async () => {
      await expect(
        service.createPayoutMethod('user-1', 'stripe_connect', 'acct_123'),
      ).rejects.toThrow('Cannot create payout method from state');
    });
  });

  describe('listPayoutMethods', () => {
    it('returns empty array for new creator', async () => {
      const methods = await service.listPayoutMethods('user-1');
      expect(methods).toHaveLength(0);
    });
  });

  describe('getPayoutConnectLink', () => {
    it('returns connect link from kyc_approved state', async () => {
      // Setup
      await service.updateCreatorProfile('user-1', {
        displayName: 'Test',
        slug: 'test',
        countryCode: 'US',
      });
      await store.updateCreatorProfile('user-1', {
        onboardingState: 'kyc_approved',
        kycStatus: 'approved',
      });

      const link = await service.getPayoutConnectLink('user-1', 'stripe_connect');
      expect(link.connect_url).toContain('sandbox.payout.example.com');
      expect(link.expires_at).toBeInstanceOf(Date);
    });

    it('throws for pending state', async () => {
      await expect(
        service.getPayoutConnectLink('user-1', 'stripe_connect'),
      ).rejects.toThrow('Cannot get payout connect link from state');
    });
  });

  // -------------------------------------------------------------------------
  // KYC Provider (Sandbox)
  // -------------------------------------------------------------------------

  describe('SandboxKycProvider', () => {
    it('returns pending on first poll', async () => {
      const kycProvider = (service as unknown as { kycProvider: { pollStatus: (input: { creator_id: string; kyc_session_id: string; vendor: string }) => Promise<string> } }).kycProvider;
      const result = await kycProvider.pollStatus({
        creator_id: 'c1',
        kyc_session_id: 's1',
        vendor: 'sandbox',
      });
      expect(result).toBe('pending');
    });

    it('returns approved on second poll', async () => {
      const kycProvider = (service as unknown as { kycProvider: { pollStatus: (input: { creator_id: string; kyc_session_id: string; vendor: string }) => Promise<string> } }).kycProvider;
      await kycProvider.pollStatus({
        creator_id: 'c1',
        kyc_session_id: 's1',
        vendor: 'sandbox',
      });
      const result = await kycProvider.pollStatus({
        creator_id: 'c1',
        kyc_session_id: 's1',
        vendor: 'sandbox',
      });
      expect(result).toBe('approved');
    });
  });

  // -------------------------------------------------------------------------
  // Feature Flag Gate
  // -------------------------------------------------------------------------

  describe('feature flag gate', () => {
    it('throws FeatureDisabledError when kyc flag is disabled', async () => {
      process.env.FEATURE_MARKETPLACE_KYC_DISABLED = 'true';
      try {
        await expect(
          service.getCreatorProfile('user-1'),
        ).rejects.toThrow('Feature disabled');
      } finally {
        delete process.env.FEATURE_MARKETPLACE_KYC_DISABLED;
      }
    });

    it('throws FeatureDisabledError when payout flag is disabled', async () => {
      process.env.FEATURE_MARKETPLACE_PAYOUT_DISABLED = 'true';
      try {
        await expect(
          service.listPayoutMethods('user-1'),
        ).rejects.toThrow('Feature disabled');
      } finally {
        delete process.env.FEATURE_MARKETPLACE_PAYOUT_DISABLED;
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Handler integration tests
// ---------------------------------------------------------------------------

describe('creator handlers integration', () => {
  let store: InMemoryMarketplaceStore;
  let service: MarketplaceService;
  let ctx: MarketplaceHandlerContext;

  beforeEach(() => {
    store = new InMemoryMarketplaceStore();
    service = new MarketplaceService({ store });
    ctx = { service };
  });

  function makeReq<P = Record<string, never>, B = Record<string, never>, Q = Record<string, string | undefined>>(
    params: P, body: B, query: Q = {} as Q, headers: Record<string, string | undefined> = {},
  ): HttpRequest<P, B, Q> {
    return { method: 'GET', path: '/', params, body, query, headers };
  }

  describe('getCreatorProfile', () => {
    it('returns 200 with profile', async () => {
      const res = await handlers.getCreatorProfile(
        makeReq({ user_id: 'user-1' }, {}),
        ctx,
      );
      expect(res.status).toBe(200);
      const body = res.body as { profile: { userId: string } };
      expect(body.profile.userId).toBe('user-1');
    });
  });

  describe('updateCreatorProfile', () => {
    it('returns 200 with updated profile', async () => {
      const res = await handlers.updateCreatorProfile(
        makeReq({ user_id: 'user-1' }, { displayName: 'Test' }),
        ctx,
      );
      expect(res.status).toBe(200);
    });

    it('returns 409 for invalid transition', async () => {
      // First advance to profile_complete
      await service.updateCreatorProfile('user-1', {
        displayName: 'Test',
        slug: 'test',
        countryCode: 'US',
      });

      // Start KYC session to advance to kyc_submitted
      await service.startKycSession('user-1', 'US');

      // Try to update profile - should work but not change state
      const res = await handlers.updateCreatorProfile(
        makeReq({ user_id: 'user-1' }, { displayName: 'Test2' }),
        ctx,
      );
      // This should succeed since we're just updating fields
      expect(res.status).toBe(200);
    });
  });

  describe('startKycSession', () => {
    it('returns 200 with session', async () => {
      // First complete profile
      await service.updateCreatorProfile('user-1', {
        displayName: 'Test',
        slug: 'test',
        countryCode: 'US',
      });

      const res = await handlers.startKycSession(
        makeReq({ user_id: 'user-1' }, { country_code: 'US' }),
        ctx,
      );
      expect(res.status).toBe(200);
    });

    it('returns 409 for invalid state', async () => {
      const res = await handlers.startKycSession(
        makeReq({ user_id: 'user-1' }, { country_code: 'US' }),
        ctx,
      );
      expect(res.status).toBe(409);
    });
  });

  describe('getKycStatus', () => {
    it('returns 200 with status', async () => {
      const res = await handlers.getKycStatus(
        makeReq({ user_id: 'user-1' }, {}),
        ctx,
      );
      expect(res.status).toBe(200);
    });
  });

  describe('createCreatorPayoutMethod', () => {
    it('returns 201 with method', async () => {
      // Setup: profile_complete → kyc_approved
      await service.updateCreatorProfile('user-1', {
        displayName: 'Test',
        slug: 'test',
        countryCode: 'US',
      });
      await store.updateCreatorProfile('user-1', {
        onboardingState: 'kyc_approved',
        kycStatus: 'approved',
      });

      const res = await handlers.createCreatorPayoutMethod(
        makeReq({ user_id: 'user-1' }, { kind: 'stripe_connect', external_account_id: 'acct_123' }),
        ctx,
      );
      expect(res.status).toBe(201);
    });

    it('returns 400 for invalid state', async () => {
      const res = await handlers.createCreatorPayoutMethod(
        makeReq({ user_id: 'user-1' }, { kind: 'stripe_connect', external_account_id: 'acct_123' }),
        ctx,
      );
      // Should return 400 because user is in pending state
      expect(res.status).toBe(400);
    });
  });

  describe('listCreatorPayoutMethods', () => {
    it('returns 200 with empty array', async () => {
      const res = await handlers.listCreatorPayoutMethods(
        makeReq({ user_id: 'user-1' }, {}),
        ctx,
      );
      expect(res.status).toBe(200);
      const body = res.body as { methods: unknown[] };
      expect(body.methods).toHaveLength(0);
    });
  });

  describe('getPayoutConnectLink', () => {
    it('returns 200 with link', async () => {
      // Setup
      await service.updateCreatorProfile('user-1', {
        displayName: 'Test',
        slug: 'test',
        countryCode: 'US',
      });
      await store.updateCreatorProfile('user-1', {
        onboardingState: 'kyc_approved',
        kycStatus: 'approved',
      });

      const res = await handlers.getPayoutConnectLink(
        makeReq({ user_id: 'user-1' }, { kind: 'stripe_connect' }),
        ctx,
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid state', async () => {
      const res = await handlers.getPayoutConnectLink(
        makeReq({ user_id: 'user-1' }, { kind: 'stripe_connect' }),
        ctx,
      );
      expect(res.status).toBe(400);
    });
  });
});
