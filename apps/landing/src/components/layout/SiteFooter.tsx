/**
 * Footer for the public marketing site. Pairs with SiteHeader.
 *
 * Per Wave 13. Every column except `Legal` is now driven by
 * `nav-sitemap.ts`. The sitemap is the single source of truth for
 * cross-app navigation: adding a new top-level page means adding one
 * node there, and the footer picks it up.
 *
 * The `Legal` column (Terms, Privacy, DPA, etc.) is intentionally
 * declared inline because legal pages are pure-marketing and have no
 * related-links or breadcrumbs.
 */

import type { JSX } from 'react';
import { landing } from '@domio/ui';
import { footerColumns } from '../../lib/nav-sitemap';

interface LegalLink {
  readonly label: string;
  readonly href: string;
}

const LEGAL_LINKS: ReadonlyArray<LegalLink> = [
  { label: 'Terms', href: '/legal/terms' },
  { label: 'Privacy', href: '/legal/privacy' },
  { label: 'Security', href: '/security' },
  { label: 'DPA', href: '/legal/dpa' },
  { label: 'Subprocessors', href: '/legal/subprocessors' },
];

export function SiteFooter(): JSX.Element {
  const columns = footerColumns();

  return (
    <footer className="site-footer" data-testid="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__col site-footer__col--brand">
          <div className="site-footer__brand">
            <span className="site-footer__mark" aria-hidden="true">
              D
            </span>
            <span className="site-footer__wordmark">Domio</span>
          </div>
          <p className="site-footer__tagline">
            Interactive decks, shared sessions, and live presentations.
          </p>
        </div>

        {columns.map((column) => (
          <nav
            key={column.heading}
            className="site-footer__col"
            aria-label={column.heading}
            data-testid={`site-footer-col-${column.heading.toLowerCase()}`}
          >
            <h2 className="site-footer__heading">{column.heading}</h2>
            {column.heading === 'Legal' ? (
              <ul className="site-footer__list">
                {LEGAL_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="site-footer__link"
                      data-testid={`site-footer-link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : column.links.length === 0 ? (
              <p className="site-footer__empty">—</p>
            ) : (
              <ul className="site-footer__list">
                {column.links.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.href}
                      className="site-footer__link"
                      data-testid={`site-footer-link-${link.id}`}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        ))}
      </div>
      <div className="site-footer__bottom">
        <p className="site-footer__copyright">© 2026 Domio, Inc.</p>
        <p className="site-footer__services-link">
          <a
            href={landing('docs')}
            className="site-footer__link"
            data-testid="site-footer-docs-link"
          >
            Documentation
          </a>
        </p>
      </div>
    </footer>
  );
}

export default SiteFooter;
