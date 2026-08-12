/**
 * ResumeFromPhone tests — S4.8.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResumeFromPhone } from './ResumeFromPhone';

describe('ResumeFromPhone', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the resume button', () => {
    render(<ResumeFromPhone token="tok" slideId="s1" slideIndex={0} />);
    expect(screen.getByTestId('resume-from-phone-button')).toBeInTheDocument();
    expect(screen.getByText(/Resume from here/i)).toBeInTheDocument();
  });

  it('posts to the failover endpoint on click', async () => {
    const onResumed = vi.fn();
    render(<ResumeFromPhone token="tok" slideId="s1" slideIndex={2} onResumed={onResumed} />);
    await fireEvent.click(screen.getByTestId('resume-from-phone-button'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/v1/presenter/sessions/failover/tok/resume');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ slide_id: 's1', slide_index: 2 });
    expect(onResumed).toHaveBeenCalled();
  });

  it('surfaces an error when the server rejects the resume', async () => {
    fetchMock.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    render(<ResumeFromPhone token="tok" slideId="s1" slideIndex={0} />);
    await fireEvent.click(screen.getByTestId('resume-from-phone-button'));
    await waitFor(() => {
      expect(screen.getByTestId('resume-from-phone-error')).toBeInTheDocument();
    });
  });
});