/**
 * Community landing page (Wave 12 §S12.9).
 *
 * Side-by-side cards for Discord and the public forum. Member + topic
 * counts are passed in as props so the data layer can decide whether
 * to read live values or a cached snapshot.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';
import { landing } from '@domio/ui';
import { DiscordWidget } from '../../components/community/DiscordWidget';
import { ForumLink } from '../../components/community/ForumLink';
import { PageShell } from '../../components/layout/PageShell';

export const metadata: Metadata = {
  title: 'Community — Domio',
  description:
    'Join the Domio Discord for real-time help and plugin office hours, or browse the public forum for longer-form discussion.',
};

const DISCORD_INVITE_URL = 'https://discord.gg/domio';
const FORUM_URL = 'https://forum.domio.app';
const DISCORD_MEMBER_COUNT = 18420;
const DISCORD_ONLINE_COUNT = 1342;
const FORUM_TOPIC_COUNT = 5320;

export default function CommunityPage(): JSX.Element {
  return (
    <PageShell currentId="community" relatedTitle="Get help">
      <main className="community-page" data-testid="community-page">
        <header className="community-page__hero">
          <p className="community-page__eyebrow">Community</p>
          <h1 className="community-page__title">Talk to other Domio builders</h1>
          <p className="community-page__lede">
            Two places to hang out. Discord for quick chat and live office hours; the forum for
            longer questions, plugin discussion, and announcements that should be Googleable.
          </p>
        </header>

        <section className="community-page__cards" aria-label="Community channels">
          <DiscordWidget
            inviteUrl={DISCORD_INVITE_URL}
            memberCount={DISCORD_MEMBER_COUNT}
            onlineCount={DISCORD_ONLINE_COUNT}
          />
          <ForumLink forumUrl={FORUM_URL} topicCount={FORUM_TOPIC_COUNT} />
        </section>

        <section className="community-page__help-cta" aria-label="Need help instead?">
          <h2 className="community-page__help-heading">Prefer the docs?</h2>
          <p className="community-page__help-body">
            The Help center covers the same ground in a searchable, deterministic form — perfect
            when you need a written reference at 2am.
          </p>
          <a
            className="community-page__help-link"
            href={landing('help')}
            data-testid="community-help-link"
          >
            Browse the Help center →
          </a>
        </section>
      </main>
    </PageShell>
  );
}
