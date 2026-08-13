import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { joinAudience, JoinError } from '@/lib/session-service';
import { hashFingerprint } from '@/runtime/device-id';

describe('session-service (joinAudience)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs the join body and returns the parsed response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session_id: 's1',
        bundle: {
          session_id: 's1',
          ended_at: null,
          current_slide_id: 'sl1',
          presenter_display_name: 'A',
          title: 'T',
        },
        audience_session_id: 'as-1',
        reconnect_token: 'tok',
      }),
    });
    const res = await joinAudience({
      apiBase: 'https://api.example.com',
      body: {
        session_code: 'ABCD-1234' as never,
        workspace_id: 'w1',
        participant_id: 'p1' as never,
        display_name: 'Alice',
        locale: 'en-US',
      },
    });
    expect(res.session_id).toBe('s1');
    expect(res.reconnect_token).toBe('tok');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws JoinError on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ code: 'CONFLICT', message: 'duplicate' }),
    });
    await expect(
      joinAudience({
        apiBase: 'https://api.example.com',
        body: {
          session_code: 'ABCD-1234' as never,
          workspace_id: 'w1',
          participant_id: 'p1' as never,
          display_name: 'Alice',
          locale: 'en-US',
        },
      }),
    ).rejects.toThrow(JoinError);
  });

  it('handles non-JSON error bodies', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('nope');
      },
    });
    await expect(
      joinAudience({
        apiBase: 'https://api.example.com',
        body: {
          session_code: 'ABCD-1234' as never,
          workspace_id: 'w1',
          participant_id: 'p1' as never,
          display_name: 'Alice',
          locale: 'en-US',
        },
      }),
    ).rejects.toThrow(/502/);
  });
});

describe('device-id fingerprint helper', () => {
  it('returns a stable hash for the same length', () => {
    expect(hashFingerprint('foo')).toBe(hashFingerprint('foo'));
    expect(hashFingerprint('foo')).not.toBe(hashFingerprint('foobar'));
  });
});
