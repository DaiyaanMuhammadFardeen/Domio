/**
 * Footer for the public marketing site. Pairs with SiteHeader.
 *
 * S10.4 lands this alongside the CLI page. Wave 12 will reuse it on the
 * home page, docs, and pricing routes.
 */

import type { JSX } from 'react';
import { landing, localUrl } from '@domio/ui';

interface FooterLink {
  readonly label: string;
  readonly href: string;
}

const COMPANY: ReadonlyArray<FooterLink> = [
  { label: 'About', href: '/about' },
  { label: 'Careers', href: landing('careers') },
  { label: 'Contact', href: '/contact' },
];

const PRODUCT: ReadonlyArray<FooterLink> = [
  { label: 'Editor', href: localUrl('editor', '/') },
  { label: 'Presenter', href: localUrl('presenter', '/') },
  { label: 'Viewer', href: localUrl('viewer', '/') },
  { label: 'CLI', href: landing('cli') },
];

const LEGAL: ReadonlyArray<FooterLink> = [
  { label: 'Terms', href: '/legal/terms' },
  { label: 'Privacy', href: '/legal/privacy' },
  { label: 'Security', href: '/security' },
];

export function SiteFooter(): JSX.Element {
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
        <nav className="site-footer__col" aria-label="Product">
          <h2 className="site-footer__heading">Product</h2>
          <ul className="site-footer__list">
            {PRODUCT.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="site-footer__link">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="site-footer__col" aria-label="Company">
          <h2 className="site-footer__heading">Company</h2>
          <ul className="site-footer__list">
            {COMPANY.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="site-footer__link">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="site-footer__col" aria-label="Legal">
          <h2 className="site-footer__heading">Legal</h2>
          <ul className="site-footer__list">
            {LEGAL.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="site-footer__link">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="site-footer__bottom">
        <p className="site-footer__copyright">© 2026 Domio, Inc.</p>
      </div>
    </footer>
  );
}

export default SiteFooter;
