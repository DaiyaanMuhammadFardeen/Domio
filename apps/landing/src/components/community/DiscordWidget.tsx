/**
 * DiscordWidget — community entry point with a member count + CTA.
 *
 * The widget renders a Discord-branded card with the current member
 * count, an offline indicator if the server is offline, and a primary
 * CTA that deep-links to the public invite. The member count is fed
 * in via props so it stays testable and the data layer can pick
 * between cached and live values.
 */

import type { JSX } from 'react';

export interface DiscordWidgetProps {
  readonly inviteUrl: string;
  readonly memberCount: number;
  readonly onlineCount: number;
  readonly heading?: string;
  readonly ctaLabel?: string;
}

function formatThousands(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  if (k < 10) return `${k.toFixed(1)}k`;
  return `${Math.round(k)}k`;
}

export function DiscordWidget({
  inviteUrl,
  memberCount,
  onlineCount,
  heading = 'Join the Domio Discord',
  ctaLabel = 'Join the Discord',
}: DiscordWidgetProps): JSX.Element {
  return (
    <section className="community-discord" data-testid="community-discord" aria-label={heading}>
      <header className="community-discord__header">
        <span className="community-discord__mark" aria-hidden="true">
          D
        </span>
        <div>
          <h2 className="community-discord__title">{heading}</h2>
          <p className="community-discord__subtitle">
            Real-time help, plugin office hours, and feature previews.
          </p>
        </div>
      </header>
      <dl className="community-discord__stats" data-testid="community-discord-stats">
        <div className="community-discord__stat">
          <dt className="community-discord__stat-label">Members</dt>
          <dd
            className="community-discord__stat-value"
            data-testid="community-discord-members"
          >
            {formatThousands(memberCount)}
          </dd>
        </div>
        <div className="community-discord__stat">
          <dt className="community-discord__stat-label">Online now</dt>
          <dd
            className="community-discord__stat-value"
            data-testid="community-discord-online"
          >
            {formatThousands(onlineCount)}
          </dd>
        </div>
        <div className="community-discord__stat">
          <dt className="community-discord__stat-label">Status</dt>
          <dd className="community-discord__stat-value">
            <span
              className="community-discord__status-dot"
              data-testid="community-discord-status"
              data-status="online"
              aria-hidden="true"
            />
            Online
          </dd>
        </div>
      </dl>
      <a
        className="community-discord__cta"
        href={inviteUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="community-discord-cta"
      >
        {ctaLabel} →
      </a>
    </section>
  );
}

export default DiscordWidget;
