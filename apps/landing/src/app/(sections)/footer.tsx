/**
 * Marketing footer section — Wave 12 §S12.1.
 *
 * Renders the "above-the-fold" marketing footer: a final CTA plus a
 * sitemap. The global `SiteFooter` (rendered by the app layout) already
 * supplies the legal colophon and brand mark, so we focus this section
 * on conversion copy and discovery links.
 */

import type { JSX } from 'react';
import { landing, localUrl } from '@domio/ui';

interface FooterCol {
  readonly title: string;
  readonly links: ReadonlyArray<{ readonly label: string; readonly href: string }>;
}

const COLUMNS: ReadonlyArray<FooterCol> = [
  {
    title: 'Product',
    links: [
      { label: 'Editor', href: localUrl('editor', '/') },
      { label: 'Presenter', href: localUrl('presenter', '/') },
      { label: 'Viewer', href: localUrl('viewer', '/') },
      { label: 'Dashboard', href: localUrl('dashboard', '/overview') },
      { label: 'Marketplace', href: localUrl('marketplaceWeb', '/') },
      { label: 'CLI', href: landing('cli') },
      { label: 'Plugins SDK', href: landing('plugins-sdk') },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', href: landing('docs') },
      { label: 'Changelog', href: landing('changelog') },
      { label: 'Demos', href: landing('demos') },
      { label: 'Status', href: landing('status') },
      { label: 'Trust center', href: landing('trust') },
      { label: 'Help', href: landing('help') },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Careers', href: landing('careers') },
      { label: 'Blog', href: landing('blog') },
      { label: 'Community', href: landing('community') },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of service', href: '/legal/terms' },
      { label: 'Privacy policy', href: '/legal/privacy' },
      { label: 'Security', href: '/security' },
      { label: 'DPA', href: '/legal/dpa' },
      { label: 'Subprocessors', href: '/legal/subprocessors' },
    ],
  },
];

export function MarketingFooter(): JSX.Element {
  const signupHref = landing('signup');
  const demoHref = landing('demos');

  return (
    <section
      className="marketing-footer"
      aria-labelledby="marketing-footer-heading"
      data-testid="marketing-footer"
    >
      <div className="marketing-footer__inner">
        <div className="marketing-footer__cta">
          <h2 id="marketing-footer-heading" className="marketing-footer__heading">
            Ship a deck this afternoon.
          </h2>
          <p className="marketing-footer__sub">
            Free forever for one deck. Pro is $19/mo when you&rsquo;re ready
            to scale.
          </p>
          <div className="marketing-footer__actions">
            <a className="marketing-footer__btn marketing-footer__btn--primary" href={signupHref}>
              Create a workspace →
            </a>
            <a className="marketing-footer__btn marketing-footer__btn--secondary" href={demoHref}>
              Book a demo
            </a>
          </div>
        </div>
        <nav className="marketing-footer__nav" aria-label="Sitemap">
          {COLUMNS.map((col) => (
            <div key={col.title} className="marketing-footer__col">
              <h3 className="marketing-footer__col-title">{col.title}</h3>
              <ul className="marketing-footer__col-list">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className="marketing-footer__link">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <p className="marketing-footer__copyright">
        © 2026 Domio, Inc. — Built for teams that ship.
      </p>
    </section>
  );
}

export default MarketingFooter;