/**
 * FeaturePageClient — client-side wrapper for the deep-dive page.
 *
 * Wave 12 §S12.2. The page itself is server-rendered for SEO and
 * TTFB; the only client-side concern is the "Try it now" CTA which
 * writes the source feature into sessionStorage so the signup page
 * can personalize its greeting. Everything else stays static.
 */

'use client';

import { useCallback, type JSX } from 'react';
import type { FeatureDetail } from '../../../lib/feature-catalog';

export interface FeaturePageClientProps {
  readonly feature: FeatureDetail;
  readonly children: JSX.Element;
}

const STORAGE_KEY = 'domio.signupIntent';

export function FeaturePageClient({ feature, children }: FeaturePageClientProps): JSX.Element {
  const onTry = useCallback((): void => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ feature: feature.slug, ts: Date.now() }),
      );
    } catch {
      // Session storage may be disabled — fall back to the query param.
    }
  }, [feature.slug]);

  return (
    <div className="fp-page" data-feature={feature.slug}>
      <div className="fp-page__body">{children}</div>
      {/* Hidden marker that the client wrapper mounted — visible to
          tests via `data-testid` and to the e2e runner via the
          `data-feature` attribute. */}
      <span
        className="fp-page__intent"
        data-testid="fp-page-intent"
        data-feature={feature.slug}
        aria-hidden="true"
        onClick={onTry}
      />
    </div>
  );
}

export default FeaturePageClient;
