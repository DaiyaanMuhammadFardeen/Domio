/**
 * magic-link-service tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { MagicLinkConsumeError, consumeMagicLink } from './magic-link-service';

describe('consumeMagicLink', () => {
  it('returns the parsed result on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ scope_type: 'deck', scope_id: 'd1', guest_email: 'a@b.test' }),
    });
    const result = await consumeMagicLink('tok', 'http://api.test', fetchMock as unknown as typeof fetch);
    expect(result.scope_id).toBe('d1');
    expect(result.guest_email).toBe('a@b.test');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/v1/guest-access/consume',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('translates a 401 with invalid_token code', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_token', message: 'bad token' }),
    });
    await expect(
      consumeMagicLink('tok', 'http://api.test', fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ status: 401, code: 'invalid_token' });
  });

  it('translates a consumed token code', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'already_consumed', message: 'used' }),
    });
    await expect(
      consumeMagicLink('tok', 'http://api.test', fetchMock as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(MagicLinkConsumeError);
  });

  it('wraps network failures into a typed error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      consumeMagicLink('tok', 'http://api.test', fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'unknown' });
  });
});
