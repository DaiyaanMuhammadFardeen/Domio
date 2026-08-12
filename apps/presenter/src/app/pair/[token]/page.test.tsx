/**
 * Phone pairing page tests — S4.2.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// Mock next/navigation BEFORE importing the page.
vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'goodtoken123' }),
}));

import PairPage from './page';

describe('PairPage', () => {
  beforeEach(() => {
    // navigator.vibrate may be absent in jsdom; provide a stub.
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate !== 'function') {
      (navigator as unknown as { vibrate?: () => void }).vibrate = () => undefined;
    }
  });

  it('shows the connecting status initially, then connected', async () => {
    render(<PairPage />);
    await waitFor(() => {
      expect(screen.getByTestId('pair-status').textContent).toMatch(/Connected/);
    });
  });

  it('shows prev/next clicker buttons', async () => {
    render(<PairPage />);
    expect(screen.getByTestId('pair-prev')).toBeInTheDocument();
    expect(screen.getByTestId('pair-next')).toBeInTheDocument();
    expect(screen.getByTestId('pair-slide-index').textContent).toBe('1');
  });

  it('disables prev at the first slide', async () => {
    render(<PairPage />);
    await waitFor(() => screen.getByTestId('pair-status'));
    expect((screen.getByTestId('pair-prev') as HTMLButtonElement).disabled).toBe(true);
  });

  it('increments slide index when next is clicked', async () => {
    render(<PairPage />);
    await waitFor(() => screen.getByTestId('pair-status'));
    fireEvent.click(screen.getByTestId('pair-next'));
    await waitFor(() => {
      expect(screen.getByTestId('pair-slide-index').textContent).toBe('2');
    });
  });

  it('renders the whisper composer', async () => {
    render(<PairPage />);
    expect(screen.getByTestId('pair-whisper-input')).toBeInTheDocument();
    expect(screen.getByTestId('pair-whisper-send')).toBeInTheDocument();
  });
});