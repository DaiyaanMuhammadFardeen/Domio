/**
 * Hero — Wave 12 §S12.1.
 *
 * Two-column hero: a marketing pitch on the left and the animated canvas
 * preview on the right. The canvas-based preview lives in
 * `HeroAnimation` and rotates through five stylized slide thumbnails.
 */

import type { JSX } from 'react';
import { landing, localUrl } from '@domio/ui';
import HeroAnimation from '../../components/HeroAnimation';

export function Hero(): JSX.Element {
  const editorHref = localUrl('editor', '/');
  const signupHref = landing('signup');
  const demoHref = landing('demos');

  return (
    <section className="hero" aria-labelledby="hero-heading" data-testid="hero">
      <div className="hero__inner">
        <div className="hero__copy">
          <p className="hero__eyebrow">Interactive decks · live sessions</p>
          <h1 id="hero-heading" className="hero__title">
            Decks that react, present, and ship themselves.
          </h1>
          <p className="hero__subtitle">
            Domio is the presentation platform for teams that ship every week. Build reactive decks
            with live data, present them with a clicker in your pocket, and let your audience join
            from any phone.
          </p>
          <div className="hero__actions">
            <a className="hero__cta hero__cta--primary" href={signupHref}>
              Start free →
            </a>
            <a className="hero__cta hero__cta--secondary" href={editorHref}>
              Open the editor
            </a>
            <a className="hero__cta hero__cta--ghost" href={demoHref}>
              Watch a demo
            </a>
          </div>
          <ul className="hero__bullets">
            <li>No credit card required</li>
            <li>SCIM + SSO on every plan</li>
            <li>EU + US data residency</li>
          </ul>
        </div>
        <div className="hero__preview">
          <HeroAnimation />
        </div>
      </div>
    </section>
  );
}

export default Hero;
