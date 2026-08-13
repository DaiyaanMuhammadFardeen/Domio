/**
 * Public marketing landing page — Wave 12 §S12.1.
 *
 * Sections:
 *   1. Hero with animated canvas preview
 *   2. Customer logo strip
 *   3. 24-card feature grid grouped by category
 *   4. How it works (3-step explainer + video)
 *   5. Pricing table (Free / Pro / Enterprise)
 *   6. FAQ accordion (20+ items)
 *   7. Marketing footer (CTA + sitemap)
 *
 * The app's `RootLayout` already renders the global `SiteHeader` and
 * `SiteFooter`, so this page composes the in-between sections only.
 */

import type { JSX } from 'react';
import type { Metadata } from 'next';
import Hero from './(sections)/hero';
import Customers from './(sections)/customers';
import Features from './(sections)/features';
import HowItWorks from './(sections)/how-it-works';
import Pricing from './(sections)/pricing';
import Faq from './(sections)/faq';

export const metadata: Metadata = {
  title: 'Domio — Interactive decks, shared sessions, live presentations',
  description:
    'Build reactive decks with live data, present from any device, and let your audience join from any phone. Free forever for one deck.',
};

export default function LandingHomePage(): JSX.Element {
  return (
    <main className="marketing" data-testid="marketing-page">
      <Hero />
      <Customers />
      <Features />
      <HowItWorks />
      <Pricing />
      <Faq />
    </main>
  );
}
