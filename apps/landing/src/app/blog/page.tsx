/**
 * Blog index — `/blog`.
 *
 * Wave 12 §S12.10 — Blog. Lists every post (newest first) and exposes
 * a category filter. The interactive filter ships in `BlogClient`.
 *
 * The page is a server component: it imports the post list from
 * `lib/blog-data` and hands it to the client wrapper.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';
import { landing } from '@domio/ui';
import { BLOG_POSTS } from '../../lib/blog-data';
import { BlogClient } from './BlogClient';
import { PageShell } from '../../components/layout/PageShell';

export const metadata: Metadata = {
  title: 'Blog — Domio',
  description: 'Engineering, product, customer, and company updates from the Domio team.',
};

export default function BlogIndexPage(): JSX.Element {
  const rssHref = '/blog/rss.xml';

  return (
    <PageShell currentId="blog-index" relatedTitle="Keep reading">
      <div className="blog-page">
        <section className="blog-hero" aria-labelledby="blog-hero-heading">
          <div className="blog-hero__inner">
            <p className="blog-hero__eyebrow">Domio blog</p>
            <h1 id="blog-hero-heading" className="blog-hero__title">
              Notes from the team building the presentation OS
            </h1>
            <p className="blog-hero__subtitle">
              Engineering deep dives, product launches, customer stories, and company updates.
            </p>
            <div className="blog-hero__meta">
              <a className="blog-hero__rss" href={rssHref} data-testid="blog-rss-link">
                RSS feed
              </a>
              <a className="blog-hero__back" href={landing('home')}>
                ← Back to home
              </a>
            </div>
          </div>
        </section>

        <div className="blog-page__body" data-testid="blog-index">
          <BlogClient posts={BLOG_POSTS} />
        </div>
      </div>
    </PageShell>
  );
}
