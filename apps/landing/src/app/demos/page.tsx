/**
 * Demo gallery — `/demos` (Wave 12 §S12.6).
 *
 * Surfaces one tile per featured Domio capability. Each tile embeds the
 * viewer iframe for a 30-second look-and-feel loop and offers an
 * "Open in editor" CTA so the marketing site can drive adoption.
 *
 * The page itself is a server component. Interactive filtering lives in
 * `DemosClient` (`'use client'`) which imports the catalogue from
 * `lib/demo-data.ts`.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';
import { DemosClient } from './DemosClient';
import { PageShell } from '../../components/layout/PageShell';

export const metadata: Metadata = {
  title: 'Demos — Domio',
  description:
    'See every Domio feature in motion — editor canvas, AI copilot, presenter live, polls, sensors, marketplace, and more.',
};

export default function DemosPage(): JSX.Element {
  return (
    <PageShell currentId="demos" relatedTitle="Keep exploring">
      <main className="demos-page">
        <DemosClient
          heading="Demos"
          intro="Every Domio feature on a 30-second loop. Open one in the editor to inspect the source."
          openLabel="Open in editor"
          allLabel="All"
          emptyLabel="No demos match this tag yet — try another filter."
        />
      </main>
    </PageShell>
  );
}