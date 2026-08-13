/**
 * DeepLinksPanel tests.
 *
 * Phase 10 M7.2. Verifies: empty state, render rows, create sample,
 * resolve, delete, copy URL, error rendering.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeepLinksPanel, type DeepLinkRecord } from './deep-links-panel';

const SAMPLE_LINK: DeepLinkRecord = {
  id: '01H000001',
  click_count: 2,
  expires_at: Date.now() + 60_000,
  viewer_scope: 'public',
  single_use: false,
  created_at: 1_700_000_000_000,
};

function setup(overrides: Partial<React.ComponentProps<typeof DeepLinksPanel>> = {}) {
  const onCreateSample = vi.fn(async () => ({ id: 'NEWID', token: 'TOKEN' }));
  const onResolve = vi.fn(async (_id: string) => ({
    slide_id: 's1',
    scenario: 'bear',
    exp: Date.now() + 1000,
  }));
  const onDelete = vi.fn(async () => true);
  const copyToClipboard = vi.fn(async () => true);
  const props = {
    deckId: 'd1',
    activeSlideId: 's1',
    links: [] as readonly DeepLinkRecord[],
    onCreateSample,
    onResolve,
    onDelete,
    copyToClipboard,
    ...overrides,
  };
  return { props, onCreateSample, onResolve, onDelete, copyToClipboard };
}

describe('DeepLinksPanel', () => {
  it('renders the empty state when there are no links', () => {
    render(<DeepLinksPanel {...setup().props} />);
    expect(screen.getByText('No deep links minted yet.')).toBeInTheDocument();
  });

  it('renders rows for every link in the deck', () => {
    render(<DeepLinksPanel {...setup({ links: [SAMPLE_LINK] }).props} />);
    expect(screen.getByTestId('m7-deep-link-row')).toBeInTheDocument();
    expect(screen.getByTestId('m7-deep-link-id')).toHaveTextContent('01H000001');
    expect(screen.getByTestId('m7-deep-link-scope')).toHaveTextContent('public');
    expect(screen.getByTestId('m7-deep-link-clicks')).toHaveTextContent('2 clicks');
  });

  it('calls onCreateSample when the Test resolve button is clicked', async () => {
    const { props, onCreateSample } = setup();
    render(<DeepLinksPanel {...props} />);
    fireEvent.click(screen.getByTestId('m7-deep-link-create'));
    await waitFor(() => {
      expect(onCreateSample).toHaveBeenCalledWith({
        deck_id: 'd1',
        slide_id: 's1',
        scenario: 'bear',
      });
    });
  });

  it('calls onResolve when Resolve is clicked on a row', async () => {
    const { props, onResolve } = setup({ links: [SAMPLE_LINK] });
    render(<DeepLinksPanel {...props} />);
    fireEvent.click(screen.getByTestId('m7-deep-link-resolve'));
    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith(SAMPLE_LINK.id);
      expect(screen.getByTestId('m7-deep-link-resolved')).toBeInTheDocument();
    });
  });

  it('calls onDelete when Delete is clicked', async () => {
    const { props, onDelete } = setup({ links: [SAMPLE_LINK] });
    render(<DeepLinksPanel {...props} />);
    fireEvent.click(screen.getByTestId('m7-deep-link-delete'));
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(SAMPLE_LINK.id);
    });
  });

  it('copies the URL when Copy URL is clicked', async () => {
    const { props, copyToClipboard } = setup({ links: [SAMPLE_LINK] });
    render(<DeepLinksPanel {...props} />);
    fireEvent.click(screen.getByTestId('m7-deep-link-copy'));
    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith(`/d/${SAMPLE_LINK.id}`);
    });
  });

  it('surfaces an error string when onCreateSample throws', async () => {
    const { props } = setup({
      onCreateSample: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    render(<DeepLinksPanel {...props} />);
    fireEvent.click(screen.getByTestId('m7-deep-link-create'));
    await waitFor(() => {
      expect(screen.getByTestId('m7-deep-link-error')).toHaveTextContent('boom');
    });
  });

  it('orders rows by created_at descending', () => {
    const a = { ...SAMPLE_LINK, id: 'AAA', created_at: 100 };
    const b = { ...SAMPLE_LINK, id: 'BBB', created_at: 300 };
    const c = { ...SAMPLE_LINK, id: 'CCC', created_at: 200 };
    render(<DeepLinksPanel {...setup({ links: [a, b, c] }).props} />);
    const rows = screen.getAllByTestId('m7-deep-link-id');
    expect(rows.map((r) => r.textContent)).toEqual(['BBB', 'CCC', 'AAA']);
  });
});
