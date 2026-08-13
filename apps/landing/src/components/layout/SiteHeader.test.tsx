/**
 * Smoke tests for the global site chrome — SiteHeader and SiteFooter.
 *
 * Locks in the Wave 12 §S12.1 primary-nav expansion (added Plugins,
 * Demos, Status, Blog, Help alongside the S10.4 Docs / Features / CLI
 * / Pricing) and the footer Resource column.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

afterEach(cleanup);

describe('SiteHeader (Wave 12)', () => {
  it('renders all primary nav links via typed routing builders', () => {
    render(<SiteHeader />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const labels = [
      'Product',
      'CLI',
      'Plugins',
      'Docs',
      'Pricing',
      'Demos',
      'Status',
      'Blog',
      'Help',
    ];
    for (const label of labels) {
      const link = within(nav).getByRole('link', { name: label });
      expect(link.getAttribute('href')).toMatch(/^\//);
    }
  });

  it('marks the active link via aria-current', () => {
    render(<SiteHeader currentPath="/blog" />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const active = within(nav).getByRole('link', { name: 'Blog' });
    expect(active.getAttribute('aria-current')).toBe('page');
  });

  it('renders the Sign-in CTA pointing to /login', () => {
    render(<SiteHeader />);
    const cta = screen.getByRole('link', { name: 'Sign in' });
    expect(cta.getAttribute('href')).toBe('/login');
  });
});

describe('SiteFooter (Wave 12)', () => {
  it('lists Wave 12 surfaces under the Resources nav', () => {
    render(<SiteFooter />);
    const nav = screen.getByRole('navigation', { name: 'Resources' });
    for (const label of [
      'Docs',
      'Changelog',
      'Demos',
      'Status',
      'Trust center',
      'Help',
      'Community',
      'Blog',
    ]) {
      expect(within(nav).getByRole('link', { name: label })).toBeTruthy();
    }
  });

  it('lists Plugins SDK under the Product nav', () => {
    render(<SiteFooter />);
    const nav = screen.getByRole('navigation', { name: 'Product' });
    const link = within(nav).getByRole('link', { name: 'Plugins SDK' });
    expect(link.getAttribute('href')).toBe('/plugins-sdk');
  });
});