/**
 * SecurityContact — security contact card.
 *
 * Wave 12 S12.7. Renders the team contact for vulnerability disclosures,
 * bug bounty submissions, and DPA requests. The PGP key block shows the
 * fingerprint and links out to the actual public key file — the key
 * itself is not embedded in the page so it can be rotated without a
 * release.
 */

import type { JSX } from 'react';
import { SECURITY_CONTACT } from '../../lib/trust-data';

export function SecurityContact(): JSX.Element {
  return (
    <section className="trust-contact" aria-labelledby="trust-contact-heading">
      <h2 id="trust-contact-heading" className="trust-section-heading">
        Report a vulnerability
      </h2>
      <p className="trust-contact__lede">
        We welcome coordinated disclosure. Email is the primary channel for
        sensitive reports; please encrypt with our PGP key when possible.
      </p>

      <div className="trust-contact__card" data-testid="trust-contact-card">
        <div className="trust-contact__row">
          <span className="trust-contact__label">Email</span>
          <a
            href={`mailto:${SECURITY_CONTACT.email}`}
            className="trust-contact__value trust-contact__link"
            data-testid="trust-contact-email"
          >
            {SECURITY_CONTACT.email}
          </a>
        </div>

        <div className="trust-contact__row">
          <span className="trust-contact__label">PGP fingerprint</span>
          <code
            className="trust-contact__value trust-contact__pgp"
            data-testid="trust-contact-pgp"
          >
            {SECURITY_CONTACT.pgp_fingerprint}
          </code>
          <a
            href={SECURITY_CONTACT.pgp_key_url}
            className="trust-contact__link"
            rel="noopener noreferrer"
          >
            Download public key ↗
          </a>
        </div>

        <div className="trust-contact__row">
          <span className="trust-contact__label">Bug bounty</span>
          <a
            href={SECURITY_CONTACT.bug_bounty_url}
            className="trust-contact__value trust-contact__link"
            data-testid="trust-contact-bounty"
            rel="noopener noreferrer"
          >
            {SECURITY_CONTACT.bug_bounty_url}
          </a>
        </div>

        <div className="trust-contact__row">
          <span className="trust-contact__label">Response SLA</span>
          <span className="trust-contact__value">{SECURITY_CONTACT.response_sla}</span>
        </div>
      </div>

      <details className="trust-contact__guidelines">
        <summary>Disclosure guidelines</summary>
        <ol>
          <li>Give us a reasonable window to investigate before public disclosure.</li>
          <li>Avoid privacy violations, data destruction, and service disruption.</li>
          <li>Provide reproducible steps and, where possible, a proof-of-concept.</li>
          <li>Honour the HackerOne program rules for scoped bounties.</li>
        </ol>
      </details>
    </section>
  );
}

export default SecurityContact;
