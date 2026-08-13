/**
 * Top navigation header for the public marketing site.
 *
 * S10.4 introduces this header alongside the CLI page; Wave 12 will reuse it
 * site-wide. It renders the Domio wordmark plus the primary navigation
 * (Docs, Features, CLI, Pricing) and a Sign-in CTA.
 */

import type { JSX } from 'react';
import { landing } from '@domio/ui';

interface NavLink {
  readonly label: string;
  readonly href: string;
}

const NAV_LINKS: ReadonlyArray<NavLink> = [
  { label: 'Docs', href: landing('docs') },
  { label: 'Features', href: landing('features') },
  { label: 'CLI', href: landing('cli') },
  { label: 'Pricing', href: landing('pricing') },
];

export interface SiteHeaderProps {
  readonly currentPath?: string;
}

export function SiteHeader({ currentPath = '/' }: SiteHeaderProps): JSX.Element {
  const homeHref = landing('home');
  const signInHref = landing('login');

  return (
    <header className="site-header" data-testid="site-header">
      <div className="site-header__inner">
        <a href={homeHref} className="site-header__brand" aria-label="Domio home">
          <span className="site-header__mark" aria-hidden="true">
            D
          </span>
          <span className="site-header__wordmark">Domio</span>
        </a>
        <nav className="site-header__nav" aria-label="Primary">
          <ul className="site-header__list">
            {NAV_LINKS.map((link) => {
              const active =
                currentPath === link.href ||
                (link.href !== '/' && currentPath.startsWith(link.href));
              return (
                <li key={link.href} className="site-header__item">
                  <a
                    href={link.href}
                    className={
                      'site-header__link' +
                      (active ? ' site-header__link--active' : '')
                    }
                    aria-current={active ? 'page' : undefined}
                  >
                    {link.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="site-header__cta">
          <a href={signInHref} className="site-header__signin">
            Sign in
          </a>
        </div>
      </div>
    </header>
  );
}

export default SiteHeader;