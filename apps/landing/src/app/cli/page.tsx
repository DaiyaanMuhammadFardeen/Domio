/**
 * CLI landing page — `/cli`.
 *
 * Wave 10 S10.4. Drives users from "what is deckctl?" to "I just installed
 * it" with install instructions, a command reference, and a copy-able
 * gallery of worked examples.
 *
 * The page is intentionally a server component. The two interactive
 * surfaces (InstallInstructions, ExamplesGallery) ship their own
 * `'use client'` directives so the page body stays static.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';
import { landing, localUrl } from '@domio/ui';
import {
  InstallInstructions,
  CommandList,
  ExamplesGallery,
} from '../../components/cli';
import { COMMANDS, INSTALLS, EXAMPLES } from '../../lib/cli-data';

export const metadata: Metadata = {
  title: 'deckctl — Domio CLI',
  description:
    'Drive Domio from the terminal. Install deckctl on macOS, Linux, or Windows; browse every subcommand and copy working examples.',
};

export default function CliLandingPage(): JSX.Element {
  const editorHref = localUrl('editor', '/');
  const docsCliHref = landing('docs', { slug: 'cli' });
  const githubHref = 'https://github.com/domio/deckctl';

  return (
    <div className="cli-page">
      <section className="cli-hero" aria-labelledby="cli-hero-heading">
        <div className="cli-hero__inner">
          <p className="cli-hero__eyebrow">Domio CLI</p>
          <h1 id="cli-hero-heading" className="cli-hero__title">
            deckctl — Domio&rsquo;s CLI
          </h1>
          <p className="cli-hero__subtitle">
            Drive Domio from the terminal. Create decks, push drafts, diff
            changes, export renders, and patch slides — all without opening a
            browser.
          </p>
          <div className="cli-hero__meta">
            <span className="cli-hero__badge">v0.9.2 · stable</span>
            <a
              className="cli-hero__stars"
              href={githubHref}
              aria-label="deckctl on GitHub"
            >
              ★ 1.2k · GitHub
            </a>
          </div>
        </div>
      </section>

      <div className="cli-page__body">
        <InstallInstructions installs={INSTALLS} />
        <CommandList commands={COMMANDS} />
        <ExamplesGallery examples={EXAMPLES} />

        <section className="cli-cta" aria-labelledby="cli-cta-heading">
          <h2 id="cli-cta-heading" className="cli-cta__heading">
            Ready to build?
          </h2>
          <p className="cli-cta__sub">
            Open a fresh deck in the editor or read the full reference.
          </p>
          <div className="cli-cta__actions">
            <a className="cli-cta__button cli-cta__button--primary" href={editorHref}>
              Open in editor →
            </a>
            <a className="cli-cta__button cli-cta__button--secondary" href={docsCliHref}>
              Read the docs
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
