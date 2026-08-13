/**
 * ThemeMarketplace — Wave 2 §S2.5 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeMarketplace } from './ThemeMarketplace';
import type { CuratedListingPage } from '../../lib/marketplace-service';

const PAGE: CuratedListingPage = {
  items: [
    {
      listing_id: 'theme-1',
      title: 'Sunrise',
      slug: 'sunrise',
      is_free: true,
      price_cents: 0,
      currency: 'USD',
      override_price_cents: null,
      brand_locked_state: 'allow',
      kind: 'theme',
      seller_name: 'Acme',
    },
    {
      listing_id: 'theme-2',
      title: 'Midnight',
      slug: 'midnight',
      is_free: false,
      price_cents: 1999,
      currency: 'USD',
      override_price_cents: null,
      brand_locked_state: 'allow',
      kind: 'theme',
      seller_name: 'Bravo',
    },
    {
      listing_id: 'comp-1',
      title: 'Card',
      slug: 'card',
      is_free: true,
      price_cents: 0,
      currency: 'USD',
      override_price_cents: null,
      brand_locked_state: 'allow',
      kind: 'component',
      seller_name: 'Charlie',
    },
  ],
  total: 3,
};

describe('ThemeMarketplace', () => {
  it('renders only listings whose kind is theme', async () => {
    const fetchListings = vi.fn().mockResolvedValue(PAGE);
    render(
      <ThemeMarketplace
        brandKitId="brand-acme"
        onInstall={vi.fn()}
        fetchListings={fetchListings}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('theme-marketplace-card-theme-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('theme-marketplace-card-theme-2')).toBeInTheDocument();
    expect(screen.queryByTestId('theme-marketplace-card-comp-1')).toBeNull();
  });

  it('opens the preview modal when Preview is clicked', async () => {
    const fetchListings = vi.fn().mockResolvedValue(PAGE);
    render(
      <ThemeMarketplace
        brandKitId="brand-acme"
        onInstall={vi.fn()}
        fetchListings={fetchListings}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('theme-marketplace-preview-theme-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('theme-marketplace-preview-theme-1'));
    expect(screen.getByTestId('theme-marketplace-modal')).toBeInTheDocument();
  });

  it('emits onInstall with a ThemeDetail when Install is clicked', async () => {
    const fetchListings = vi.fn().mockResolvedValue(PAGE);
    const onInstall = vi.fn();
    render(
      <ThemeMarketplace
        brandKitId="brand-acme"
        onInstall={onInstall}
        fetchListings={fetchListings}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('theme-marketplace-install-theme-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('theme-marketplace-install-theme-1'));
    expect(onInstall).toHaveBeenCalled();
    const theme = onInstall.mock.calls[0]?.[0] as {
      id: string;
      name: string;
      tokens: Record<string, string>;
    };
    expect(theme.id).toBe('marketplace-theme-1');
    expect(theme.name).toBe('Sunrise');
    expect(theme.tokens['color.brand.primary']).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('labels the installed card after install', async () => {
    const fetchListings = vi.fn().mockResolvedValue(PAGE);
    render(
      <ThemeMarketplace
        brandKitId="brand-acme"
        onInstall={vi.fn()}
        fetchListings={fetchListings}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('theme-marketplace-install-theme-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('theme-marketplace-install-theme-1'));
    expect(screen.getByTestId('theme-marketplace-install-theme-1')).toHaveTextContent('Installed');
  });

  it('shows empty state when no themes match', async () => {
    const fetchListings = vi.fn().mockResolvedValue({ items: [], total: 0 });
    render(
      <ThemeMarketplace
        brandKitId="brand-acme"
        onInstall={vi.fn()}
        fetchListings={fetchListings}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/No themes match/i)).toBeInTheDocument();
    });
  });
});
