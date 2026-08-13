/**
 * consent-service tests — S5.10.
 */

import { describe, expect, it, vi } from 'vitest';
import { ConsentPolicyFetchError, DEFAULT_POLICY_VERSION, fetchConsentPolicyVersion } from './consent-service';

describe('fetchConsentPolicyVersion', () => {
  it('returns the parsed version on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 'v2' }),
    });
    const result = await fetchConsentPolicyVersion('http://api.test', fetchMock as unknown as typeof fetch);
    expect(result.version).toBe('v2');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/v1/consent/policy-version',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('throws ConsentPolicyFetchError on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(
      fetchConsentPolicyVersion('http://api.test', fetchMock as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(ConsentPolicyFetchError);
  });

  it('exposes a stable DEFAULT_POLICY_VERSION for callers without a backend', () => {
    expect(DEFAULT_POLICY_VERSION).toBe('v1');
  });
});