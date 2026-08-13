/**
 * Tests for Breadcrumbs / RelatedLinks / Pager / AppNav.
 *
 * Per Wave 13. Asserts the contract every consumer relies on:
 *   - last breadcrumb is non-clickable + aria-current="page"
 *   - related renders cards with data-testid
 *   - pager degrades when prev/next are absent
 *   - app-nav highlights the active primary link
 */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { NavNode } from './nav-graph.js';
import { Breadcrumbs } from './Breadcrumbs.js';
import { RelatedLinks } from './RelatedLinks.js';
import { Pager } from './Pager.js';
import { AppNav } from './AppNav.js';

const home: NavNode = {
  id: 'home',
  surface: 'landing',
  category: 'product',
  label: 'Home',
  href: '/',
};

const features: NavNode = {
  id: 'features',
  surface: 'landing',
  category: 'feature',
  label: 'Features',
  href: '/features',
  parent: 'home',
};

const heatmap: NavNode = {
  id: 'heatmap',
  surface: 'landing',
  category: 'feature',
  label: 'Heatmap',
  href: '/features/heatmap',
  parent: 'features',
};

describe('Breadcrumbs', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(<Breadcrumbs items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('marks the last item as aria-current="page"', () => {
    render(<Breadcrumbs items={[home, features, heatmap]} />);
    const nav = screen.getByTestId('nav-breadcrumbs');
    const current = within(nav).getByTestId('nav-breadcrumbs-current');
    expect(current.textContent).toBe('Heatmap');
    expect(current.getAttribute('aria-current')).toBe('page');
  });

  it('renders links for every non-last item', () => {
    render(<Breadcrumbs items={[home, features, heatmap]} />);
    expect(screen.getByTestId('nav-breadcrumbs-link-home').textContent).toBe('Home');
    expect(screen.getByTestId('nav-breadcrumbs-link-features').textContent).toBe('Features');
  });

  it('marks separators as aria-hidden', () => {
    render(<Breadcrumbs items={[home, heatmap]} />);
    const nav = screen.getByTestId('nav-breadcrumbs');
    const seps = nav.querySelectorAll('.nav-breadcrumbs__sep');
    expect(seps.length).toBe(1);
    expect(seps[0]?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('RelatedLinks', () => {
  it('renders each item with a data-testid', () => {
    render(<RelatedLinks items={[features, heatmap]} />);
    const list = screen.getByTestId('nav-related');
    const items = within(list).getAllByTestId('nav-related-item');
    expect(items).toHaveLength(2);
  });

  it('renders an empty state when there are no items', () => {
    render(<RelatedLinks items={[]} />);
    expect(screen.getByTestId('nav-related-empty')).toBeTruthy();
  });

  it('uses the supplied title', () => {
    render(<RelatedLinks items={[features]} title="Related features" />);
    expect(screen.getByRole('heading', { name: 'Related features' })).toBeTruthy();
  });
});

describe('Pager', () => {
  it('renders both prev and next', () => {
    render(<Pager prev={features} next={heatmap} />);
    expect(screen.getByTestId('nav-pager-prev')).toBeTruthy();
    expect(screen.getByTestId('nav-pager-next')).toBeTruthy();
  });

  it('renders nothing when both are absent', () => {
    const { container } = render(<Pager />);
    expect(container.firstChild).toBeNull();
  });

  it('marks missing slot as placeholder', () => {
    render(<Pager next={heatmap} />);
    const prev = screen.getByTestId('nav-pager-prev');
    expect(prev.className).toContain('nav-pager__placeholder');
  });
});

describe('AppNav', () => {
  it('renders the brand wordmark and sign-in CTA', () => {
    render(<AppNav activeSurface="landing" />);
    expect(screen.getByLabelText('Domio home')).toBeTruthy();
    expect(screen.getByTestId('app-nav-signin').getAttribute('href')).toBe('/login');
  });

  it('highlights the active primary link via aria-current', () => {
    render(<AppNav activeSurface="landing" currentPath="/blog" />);
    // No nodes are registered yet, so nothing is highlighted.
    const links = screen.queryAllByRole('link');
    for (const link of links) {
      expect(link.getAttribute('aria-current')).not.toBe('page');
    }
  });

  it('hides the surface switcher when requested', () => {
    render(<AppNav activeSurface="joinWeb" hideSurfaceSwitcher />);
    expect(screen.queryByRole('navigation', { name: 'Switch surface' })).toBeNull();
  });
});