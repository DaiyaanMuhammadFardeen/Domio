/**
 * feedback-service tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { FeedbackSubmitError, submitFeedback } from './feedback-service';

describe('submitFeedback', () => {
  it('POSTs the payload and returns on 2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await submitFeedback('s1', { stars: 5, nps: 9, note: 'great' }, 'http://api.test', fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/feedback/s1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ stars: 5, nps: 9, note: 'great' }),
      }),
    );
  });

  it('throws on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(
      submitFeedback('s1', { stars: 5, nps: 9, note: '' }, 'http://api.test', fetchMock as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(FeedbackSubmitError);
  });

  it('encodes the session id in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    await submitFeedback('a/b', { stars: 5, nps: 9, note: '' }, 'http://api.test', fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/feedback/a%2Fb', expect.any(Object));
  });
});
