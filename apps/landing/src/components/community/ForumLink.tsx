/**
 * ForumLink — a smaller secondary card linking to the public forum.
 *
 * Pairs alongside the DiscordWidget on the community page. Renders a
 * short pitch, a topic count, and a CTA that opens the forum in a
 * new tab.
 */

import type { JSX } from 'react';

export interface ForumLinkProps {
  readonly forumUrl: string;
  readonly topicCount: number;
  readonly heading?: string;
  readonly ctaLabel?: string;
}

export function ForumLink({
  forumUrl,
  topicCount,
  heading = 'Browse the public forum',
  ctaLabel = 'Open the forum',
}: ForumLinkProps): JSX.Element {
  return (
    <section className="community-forum" data-testid="community-forum" aria-label={heading}>
      <header className="community-forum__header">
        <span className="community-forum__mark" aria-hidden="true">
          F
        </span>
        <h2 className="community-forum__title">{heading}</h2>
      </header>
      <p className="community-forum__body">
        Longer-form questions, plugin discussion, and announcements. Searchable, indexable, and
        indexed by Google for the answer you need in 6 months.
      </p>
      <dl className="community-forum__stats" data-testid="community-forum-stats">
        <div className="community-forum__stat">
          <dt className="community-forum__stat-label">Topics</dt>
          <dd
            className="community-forum__stat-value"
            data-testid="community-forum-topics"
          >
            {topicCount.toLocaleString('en-US')}
          </dd>
        </div>
      </dl>
      <a
        className="community-forum__cta"
        href={forumUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="community-forum-cta"
      >
        {ctaLabel} →
      </a>
    </section>
  );
}

export default ForumLink;
