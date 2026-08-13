import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SlideBreakdownTable } from './SlideBreakdownTable';
import type { SlideBreakdown } from '../lib/funnel-service';
import type { WhyHypothesis } from '../lib/funnel-service';

const SLIDES: ReadonlyArray<SlideBreakdown> = [
  {
    slideId: 's-1',
    index: 0,
    title: 'Cover',
    viewers: 1000,
    bounceRate: 0.42,
    avgDwellMs: 5000,
  },
  {
    slideId: 's-2',
    index: 1,
    title: 'Pricing',
    viewers: 800,
    bounceRate: 0.18,
    avgDwellMs: 8000,
  },
];

describe('SlideBreakdownTable', () => {
  it('renders one row per slide', () => {
    render(
      <SlideBreakdownTable
        slides={SLIDES}
        deckId="deck-A"
        workspaceId="ws-1"
        hypothesisFetcher={vi.fn() as never}
      />,
    );
    expect(screen.getByTestId('slide-row-s-1')).toBeInTheDocument();
    expect(screen.getByTestId('slide-row-s-2')).toBeInTheDocument();
  });

  it('formats bounce as a percentage', () => {
    render(
      <SlideBreakdownTable
        slides={SLIDES}
        deckId="deck-A"
        workspaceId="ws-1"
        hypothesisFetcher={vi.fn() as never}
      />,
    );
    expect(screen.getByText('42.0%')).toBeInTheDocument();
    expect(screen.getByText('18.0%')).toBeInTheDocument();
  });

  it('renders the empty state when there are no slides', () => {
    render(
      <SlideBreakdownTable
        slides={[]}
        deckId="deck-A"
        workspaceId="ws-1"
        hypothesisFetcher={vi.fn() as never}
      />,
    );
    expect(screen.getByTestId('slide-breakdown-empty')).toBeInTheDocument();
  });

  it('calls the hypothesis fetcher when "why?" is clicked', async () => {
    const fetcher = vi.fn(
      async (): Promise<WhyHypothesis | null> => ({
        slideId: 's-1',
        summary: 'Cover slide is dense.',
        hypotheses: ['Too many words', 'Low contrast CTA'],
      }),
    );

    render(
      <SlideBreakdownTable
        slides={SLIDES}
        deckId="deck-A"
        workspaceId="ws-1"
        hypothesisFetcher={fetcher as never}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('slide-why-s-1'));
    });

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith('ws-1', 'deck-A', 's-1');
    });
    await waitFor(() => {
      expect(screen.getByTestId('slide-why-detail-s-1')).toBeInTheDocument();
    });
    expect(screen.getByText(/Too many words/)).toBeInTheDocument();
    expect(screen.getByText(/Low contrast CTA/)).toBeInTheDocument();
  });

  it('shows an error row when the fetcher returns null', async () => {
    const fetcher = vi.fn(async () => null);
    render(
      <SlideBreakdownTable
        slides={SLIDES}
        deckId="deck-A"
        workspaceId="ws-1"
        hypothesisFetcher={fetcher as never}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('slide-why-s-1'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('slide-why-error-s-1')).toBeInTheDocument();
    });
  });
});
