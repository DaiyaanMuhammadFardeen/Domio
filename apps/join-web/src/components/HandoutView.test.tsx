/**
 * HandoutView tests — S5.3.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HandoutView } from './HandoutView';
import type { HandoutDescriptor } from '@/lib/handout-service';

const BASE: HandoutDescriptor = {
  token: 'tok-1',
  session_id: 's1',
  session_title: 'Onboarding 101',
  presenter_display_name: 'Ada',
  attended_slides: [
    { slide_id: 'sl1', title: 'Welcome', index: 1, thumbnail_url: null },
    { slide_id: 'sl2', title: 'Roadmap', index: 2, thumbnail_url: null },
    { slide_id: 'sl3', title: 'Q&A', index: 3, thumbnail_url: null },
  ],
  notes: 'thanks for the great session!',
  call_to_action: {
    label: 'Sign up',
    href: 'https://example.com/signup',
    variant: 'primary',
  },
  pdf_url: 'https://cdn.example.com/h/tok-1.pdf',
  issued_at: '2026-08-12T10:00:00Z',
  expires_at: '2026-12-12T10:00:00Z',
};

describe('HandoutView', () => {
  it('renders the session title and presenter name', () => {
    render(<HandoutView descriptor={BASE} />);
    expect(screen.getByTestId('handout-title').textContent).toMatch(/Onboarding 101/);
    expect(screen.getByTestId('handout-presenter').textContent).toMatch(/Ada/);
  });

  it('renders the attended slides count and rows', () => {
    render(<HandoutView descriptor={BASE} />);
    expect(screen.getByTestId('handout-attended-count').textContent).toBe('3');
    expect(screen.getByTestId('handout-slide-1')).toBeInTheDocument();
    expect(screen.getByTestId('handout-slide-2')).toBeInTheDocument();
    expect(screen.getByTestId('handout-slide-3')).toBeInTheDocument();
  });

  it('renders the notes section', () => {
    render(<HandoutView descriptor={BASE} />);
    const notes = screen.getByTestId('handout-notes');
    expect(notes.textContent).toMatch(/thanks for the great session!/);
  });

  it('renders the CTA link with the supplied label and href', () => {
    render(<HandoutView descriptor={BASE} />);
    const cta = screen.getByTestId('handout-cta');
    expect(cta.textContent).toMatch(/Sign up/);
    expect(cta.getAttribute('href')).toBe('https://example.com/signup');
  });

  it('renders the Download PDF button and forwards click', () => {
    const onDownload = vi.fn();
    render(<HandoutView descriptor={BASE} onDownloadPdf={onDownload} />);
    const btn = screen.getByTestId('handout-download-pdf');
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it('handles an empty slide list and no CTA', () => {
    const empty: HandoutDescriptor = {
      ...BASE,
      attended_slides: [],
      call_to_action: null,
      pdf_url: null,
    };
    render(<HandoutView descriptor={empty} />);
    expect(screen.getByTestId('handout-attended-count').textContent).toBe('0');
    expect(screen.queryByTestId('handout-cta')).toBeNull();
    expect(screen.queryByTestId('handout-download-pdf')).toBeNull();
    expect(screen.getByText(/No slide activity recorded/)).toBeInTheDocument();
  });
});
