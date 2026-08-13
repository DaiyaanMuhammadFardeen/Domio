/**
 * CustomerLogoStrip — marquee of customer wordmarks.
 *
 * Wave 12 §S12.1. Renders the list of customer logos twice and scrolls
 * them horizontally via CSS keyframes so the strip always fills the
 * viewport. We deliberately avoid pulling in a marquee library — a
 * minimal CSS animation is plenty.
 *
 * Visual treatment:
 *  - Each logo is a circular monogram with the company initials.
 *  - The company name appears beneath on hover (tooltip) and always in
 *    the visually-hidden text for screen readers.
 */

import type { JSX } from 'react';
import type { CustomerLogo } from '../lib/marketing-data';

interface CustomerLogoStripProps {
  readonly logos: ReadonlyArray<CustomerLogo>;
}

function LogoBadge({ logo }: { readonly logo: CustomerLogo }): JSX.Element {
  return (
    <span
      className="customer-logo"
      data-testid="customer-logo"
      data-name={logo.name}
      title={logo.name}
      aria-label={logo.name}
    >
      <span className="customer-logo__badge" aria-hidden="true">
        {logo.initials}
      </span>
      <span className="visually-hidden">{logo.name}</span>
    </span>
  );
}

export function CustomerLogoStrip({ logos }: CustomerLogoStripProps): JSX.Element {
  // Render twice for a seamless loop.
  return (
    <div className="customer-strip" data-testid="customer-logo-strip">
      <ul className="customer-strip__track" aria-label="Customers using Domio">
        {logos.map((logo) => (
          <li key={`a-${logo.name}`} className="customer-strip__item">
            <LogoBadge logo={logo} />
          </li>
        ))}
        {logos.map((logo) => (
          <li key={`b-${logo.name}`} className="customer-strip__item" aria-hidden="true">
            <LogoBadge logo={logo} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default CustomerLogoStrip;
