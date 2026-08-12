/**
 * handout-service tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { HandoutResolveError, resolveHandoutToken } from './handout-service';

describe('resolveHandoutToken', () => {
  it('returns the parsed session code on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_code: 'S-123' }),
    });
    const result = await resolveHandoutToken('tok', 'http://api.test', fetchMock as unknown as typeof fetch);
    expect(result.session_code).toBe('S-123');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/handout/tok/resolve',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('throws HandoutResolveError on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(resolveHandoutToken('tok', 'http://api.test', fetchMock as unknown as typeof fetch))
      .rejects.toBeInstanceOf(HandoutResolveError);
  });

  it('encodes the token in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_code: 'S' }),
    });
    await resolveHandoutToken('a/b c', 'http://api.test', fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/handout/a%2Fb%20c/resolve',
      expect.any(Object),
    );
  });
});
