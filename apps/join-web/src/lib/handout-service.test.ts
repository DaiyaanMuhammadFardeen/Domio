/**
 * handout-service tests.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  HandoutResolveError,
  fetchHandout,
  handoutService,
  resolveHandoutToken,
} from './handout-service';

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

describe('fetchHandout', () => {
  it('returns the parsed HandoutDescriptor on 200', async () => {
    const sample = {
      token: 'tok',
      session_id: 's1',
      session_title: 'Onboarding',
      presenter_display_name: 'Ada',
      attended_slides: [{ slide_id: 'sl1', title: 'Intro', index: 1, thumbnail_url: null }],
      notes: 'thanks!',
      call_to_action: { label: 'Sign up', href: 'https://example.com', variant: 'primary' },
      pdf_url: null,
      issued_at: '2026-01-01T00:00:00Z',
      expires_at: '2026-12-31T00:00:00Z',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sample,
    });
    const result = await fetchHandout('tok', 'http://api.test', fetchMock as unknown as typeof fetch);
    expect(result.session_id).toBe('s1');
    expect(result.attended_slides[0]?.title).toBe('Intro');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/handout/tok',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('throws HandoutResolveError on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchHandout('tok', 'http://api.test', fetchMock as unknown as typeof fetch))
      .rejects.toBeInstanceOf(HandoutResolveError);
  });

  it('encodes the token in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 't',
        session_id: 's',
        session_title: '',
        presenter_display_name: '',
        attended_slides: [],
        notes: '',
        call_to_action: null,
        pdf_url: null,
        issued_at: '',
        expires_at: '',
      }),
    });
    await fetchHandout('a/b c', 'http://api.test', fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/handout/a%2Fb%20c',
      expect.any(Object),
    );
  });
});

describe('handoutService aggregator', () => {
  it('exposes fetch and resolve', () => {
    expect(typeof handoutService.fetch).toBe('function');
    expect(typeof handoutService.resolve).toBe('function');
  });

  it('aggregator.fetch delegates to fetchHandout', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 't',
        session_id: 's',
        session_title: '',
        presenter_display_name: '',
        attended_slides: [],
        notes: '',
        call_to_action: null,
        pdf_url: null,
        issued_at: '',
        expires_at: '',
      }),
    });
    await handoutService.fetch('tok', 'http://api.test', fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/handout/tok', expect.any(Object));
  });
});
