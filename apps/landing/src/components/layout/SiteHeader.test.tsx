/**
 * Smoke tests for the global site chrome — SiteHeader and SiteFooter.
 *
 * Per Wave 13. The header now delegates to `<AppNav>` (with `site-header*`
 * BEM overrides) and the nav list is driven by `nav-sitemap.ts` instead
 * of being hardcoded. The footer pulls its columns from the same
 * sitemap module.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

afterEach(cleanup);

describe('SiteHeader (Wave 13)', () => {
  it('renders every sitemap primary landing link with a relative href', () => {
    render(<SiteHeader />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const labels = [
      'Features',
      'Pricing',
      'Docs',
      'Blog',
      'Help',
      'Status',
      'Trust center',
      'Services',
    ];
    for (const label of labels) {
      const link = within(nav).getByRole('link', { name: label });
      expect(link.getAttribute('href')).toMatch(/^\//);
    }
  });

  it('marks the active primary link via aria-current', () => {
    render(<SiteHeader currentPath="/blog" />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const active = within(nav).getByRole('link', { name: 'Blog' });
    expect(active.getAttribute('aria-current')).toBe('page');
  });

it('renders the cross-app switcher in the header chrome', () => {
    render(<SiteHeader />);
    const switcher = screen.getByRole('navigation', { name: 'Switch surface' });
    expect(switcher).toBeTruthy();
    expect(within(switcher).getAllByRole('link').length).toBeGreaterThan(0);
  });

  it('renders the Sign-in CTA pointing at /login', () => {
    render(<SiteHeader />);
    const cta = screen.getByRole('link', { name: 'Sign in' });
    expect(cta.getAttribute('href')).toBe('/login');
  });
});

describe('SiteFooter (Wave 13)', () => {
  it('lists Resources links from the sitemap', () => {
    render(<SiteFooter />);
    const nav = screen.getByRole('navigation', { name: 'Resources' });
    for (const label of [
      'Blog',
      'Changelog',
      'Demos',
      'Status',
      'Trust center',
      'Help',
      'Community',
      'Services',
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

  it('lists every cross-app surface under the Apps nav', () => {
    render(<SiteFooter />);
    const nav = screen.getByRole('navigation', { name: 'Apps' });
    for (const label of ['Editor', 'Viewer', 'Presenter', 'Dashboard', 'Marketplace', 'Creator', 'Admin']) {
      expect(within(nav).getByRole('link', { name: label })).toBeTruthy();
    }
  });

  it('lists legal links inline (Terms, Privacy, DPA, Subprocessors, Security)', () => {
    render(<SiteFooter />);
    const nav = screen.getByRole('navigation', { name: 'Legal' });
    for (const label of ['Terms', 'Privacy', 'DPA', 'Subprocessors', 'Security']) {
      expect(within(nav).getByRole('link', { name: label })).toBeTruthy();
    }
  });
});