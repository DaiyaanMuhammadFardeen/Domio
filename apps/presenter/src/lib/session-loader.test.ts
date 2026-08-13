/**
 * session-loader tests — assert fetch → fall-back behavior.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('session-loader', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env['PRESENTER_API_BASE_URL'] = 'http://presenter.test';
    process.env['PHONE_PAIRING_API_BASE_URL'] = 'http://pairing.test';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('fetchSessionForSsr', () => {
    it('returns the parsed session on 200', async () => {
      const fixture = { session_id: 's1', version: 1 };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fixture,
      });
      vi.stubGlobal('fetch', fetchMock);

      const { fetchSessionForSsr } = await import('./session-loader');
      const result = await fetchSessionForSsr('s1');
      expect(result).toEqual(fixture);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://presenter.test/api/v1/presenter/sessions/s1',
        expect.objectContaining({ cache: 'no-store' }),
      );
    });

    it('returns null on non-2xx', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
      const { fetchSessionForSsr } = await import('./session-loader');
      expect(await fetchSessionForSsr('s1')).toBeNull();
    });

    it('returns null on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const { fetchSessionForSsr } = await import('./session-loader');
      expect(await fetchSessionForSsr('s1')).toBeNull();
    });
  });

  describe('fetchPairingForSsr', () => {
    it('returns parsed pairing on 200', async () => {
      const fixture = {
        token: 'abc',
        deep_link: 'domio://pair?token=abc',
        epoch: 1,
        expires_at_ms: 1,
        paired_devices: 0,
      };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fixture,
      });
      vi.stubGlobal('fetch', fetchMock);
      const { fetchPairingForSsr } = await import('./session-loader');
      const result = await fetchPairingForSsr('s1');
      expect(result).toEqual(fixture);
    });

    it('returns a placeholder when the service is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const { fetchPairingForSsr } = await import('./session-loader');
      const result = await fetchPairingForSsr('s1');
      expect(result.token).toBe('');
      expect(result.paired_devices).toBe(0);
      expect(result.expires_at_ms).toBeGreaterThan(Date.now());
    });

    it('returns a placeholder on non-2xx so the client can refetch', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
      const { fetchPairingForSsr } = await import('./session-loader');
      const result = await fetchPairingForSsr('s1');
      expect(result.token).toBe('');
    });
  });
});
