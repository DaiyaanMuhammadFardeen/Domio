/**
 * HandoutResolver tests — S5.3.
 *
 * Verifies that:
 *  - The injected handout-service.fetch is invoked with the token.
 *  - HandoutView receives the resolved descriptor (proxy: the slide
 *    list testid renders the attended slides).
 *  - The "Download PDF" button is rendered when the descriptor exposes
 *    a pdf_url (or an onDownloadPdf handler is supplied).
 *  - The error branch surfaces the failure message.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HandoutResolver } from './HandoutResolver';
import type { HandoutDescriptor } from '@/lib/handout-service';

const SAMPLE: HandoutDescriptor = {
  token: 'tok-1',
  session_id: 's1',
  session_title: 'Onboarding 101',
  presenter_display_name: 'Ada',
  attended_slides: [
    { slide_id: 'sl1', title: 'Welcome', index: 1, thumbnail_url: null },
    { slide_id: 'sl2', title: 'Roadmap', index: 2, thumbnail_url: null },
  ],
  notes: 'great talk!',
  call_to_action: { label: 'Sign up', href: 'https://example.com', variant: 'primary' },
  pdf_url: 'https://cdn.example.com/h/tok-1.pdf',
  issued_at: '2026-08-12T10:00:00Z',
  expires_at: '2026-12-12T10:00:00Z',
};

describe('HandoutResolver', () => {
  it('calls handout-service.fetch with the token and renders the descriptor', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(SAMPLE);
    render(<HandoutResolver token="tok-1" fetchFn={fetchSpy} />);
    await waitFor(() => {
      expect(screen.getByTestId('handout-view')).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledWith('tok-1', undefined);
    expect(screen.getByTestId('handout-title').textContent).toMatch(/Onboarding 101/);
    expect(screen.getByTestId('handout-presenter').textContent).toMatch(/Ada/);
  });

  it('renders the attended slide list and PDF button', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(SAMPLE);
    render(<HandoutResolver token="tok-1" fetchFn={fetchSpy} />);
    await waitFor(() => {
      expect(screen.getByTestId('handout-attended-count').textContent).toBe('2');
    });
    expect(screen.getByTestId('handout-slide-1')).toBeInTheDocument();
    expect(screen.getByTestId('handout-slide-2')).toBeInTheDocument();
    expect(screen.getByTestId('handout-download-pdf')).toBeInTheDocument();
    expect(screen.getByTestId('handout-cta')).toBeInTheDocument();
  });

  it('invokes onDownloadPdf when the PDF button is clicked', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(SAMPLE);
    const onDownload = vi.fn();
    render(<HandoutResolver token="tok-1" fetchFn={fetchSpy} onDownloadPdf={onDownload} />);
    await waitFor(() => {
      expect(screen.getByTestId('handout-download-pdf')).toBeInTheDocument();
    });
    screen.getByTestId('handout-download-pdf').click();
    expect(onDownload).toHaveBeenCalledWith(SAMPLE);
  });

  it('renders an error state when the service rejects', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('boom'));
    render(<HandoutResolver token="tok-1" fetchFn={fetchSpy} />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
});
