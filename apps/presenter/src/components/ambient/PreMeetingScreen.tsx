'use client';

/**
 * PreMeetingScreen — Wave 11 §S11.6.
 *
 * A second view of the "ambient boardroom mode" surface that emphasizes
 * the *upcoming* session rather than the live dashboard. Where the
 * idle dashboard is data-heavy (KPIs + ticker), the pre-meeting screen
 * is chrome-heavy: logo, room, agenda, presenter.
 *
 * The screen is shown when the audience display wakes up more than ~15
 * minutes before the session. As the scheduled time approaches, the
 * parent swaps to IdleDashboard (which embeds the countdown at the
 * top). The actual handoff to the live session is handled by
 * TransitionOverlay.
 */

import { useMemo, type CSSProperties, type ReactElement } from 'react';
import {
  formatChange,
  formatTime,
  gradientFor,
  isStartingNow,
  minutesUntilScheduled,
  type AmbientSessionInfo,
  type BrandKit,
} from '../../lib/ambient-service';

export interface PreMeetingScreenProps {
  readonly session: AmbientSessionInfo;
  /** Override the "now" timestamp (used in tests). */
  readonly nowMs?: number;
  readonly dataTestId?: string;
}

export function PreMeetingScreen({
  session,
  nowMs,
  dataTestId = 'pre-meeting-screen',
}: PreMeetingScreenProps): ReactElement {
  const now = nowMs ?? Date.now();
  const minutes = useMemo(
    () => minutesUntilScheduled(session.scheduled_at_ms, now),
    [session.scheduled_at_ms, now],
  );
  const starting = useMemo(
    () => isStartingNow(session.scheduled_at_ms, now),
    [session.scheduled_at_ms, now],
  );

  const wrapperStyle: CSSProperties = {
    position: 'relative',
    minHeight: '100vh',
    width: '100%',
    color: '#F8FAFF',
    background: gradientFor(session.brand_kit),
    fontFamily: session.brand_kit.font_family,
    overflow: 'hidden',
  };

  const totalMinutes = useMemo(
    () => session.agenda.reduce((acc, item) => acc + item.duration_min, 0),
    [session.agenda],
  );

  return (
    <section
      data-testid={dataTestId}
      aria-label="Pre-meeting screen"
      style={wrapperStyle}
    >
      <BackgroundVein brand={session.brand_kit} />
      <div style={gridStyle}>
        <Header session={session} />
        <Countdown minutes={minutes} starting={starting} scheduled={session.scheduled_at_ms} />
        <Agenda agenda={session.agenda} totalMinutes={totalMinutes} brand={session.brand_kit} />
        <FooterMeta session={session} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Header (logo / company placeholder)
// ---------------------------------------------------------------------------

interface HeaderProps {
  readonly session: AmbientSessionInfo;
}

function Header({ session }: HeaderProps): ReactElement {
  return (
    <header
      data-testid="pre-meeting-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <CompanyLogo brand={session.brand_kit} />
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 1.4,
              color: 'rgba(248, 250, 255, 0.6)',
            }}
          >
            {session.room_name}
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              margin: 0,
              color: '#F8FAFF',
            }}
          >
            {session.deck_title}
          </h1>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={metaLabelStyle}>Presenter</div>
        <div
          data-testid="pre-meeting-presenter"
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: '#F8FAFF',
          }}
        >
          {session.presenter_name}
        </div>
      </div>
    </header>
  );
}

interface CompanyLogoProps {
  readonly logoUrl?: string;
  readonly brand: BrandKit;
}

function CompanyLogo({ brand }: CompanyLogoProps): ReactElement {
  const logoUrl = brand.logo_url;
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        width={48}
        height={48}
        style={{ borderRadius: 10, background: 'rgba(255,255,255,0.1)', padding: 6 }}
      />
    );
  }
  // Placeholder logo — initials from brand fonts, single-letter mark.
  return (
    <div
      data-testid="pre-meeting-logo-placeholder"
      aria-hidden
      style={{
        width: 48,
        height: 48,
        borderRadius: 10,
        background: brand.primary_color,
        color: '#F8FAFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: 22,
        letterSpacing: 1,
        boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
      }}
    >
      D
    </div>
  );
}

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------

interface CountdownProps {
  readonly minutes: number;
  readonly starting: boolean;
  readonly scheduled: number;
}

function Countdown({ minutes, starting, scheduled }: CountdownProps): ReactElement {
  const value = starting ? 0 : minutes;
  const label = starting ? 'Starting now' : `Session starts in ${minutes} min`;
  return (
    <section
      data-testid="pre-meeting-countdown"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'center',
        gap: 18,
        padding: '36px 24px',
        borderRadius: 16,
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      <span
        data-testid="pre-meeting-countdown-value"
        style={{
          fontSize: 88,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          color: '#F8FAFF',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 22, fontWeight: 600, color: 'rgba(248, 250, 255, 0.7)' }}>
        {starting ? 'min to go' : 'min'}
      </span>
      <span
        style={{
          marginLeft: 24,
          fontSize: 14,
          fontWeight: 600,
          color: 'rgba(248, 250, 255, 0.6)',
        }}
      >
        {label} · {formatTime(scheduled)}
      </span>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

interface AgendaProps {
  readonly agenda: ReadonlyArray<AmbientSessionInfo['agenda'][number]>;
  readonly totalMinutes: number;
  readonly brand: BrandKit;
}

function Agenda({ agenda, totalMinutes, brand }: AgendaProps): ReactElement {
  return (
    <section
      data-testid="pre-meeting-agenda"
      aria-label="Agenda"
      style={{ display: 'grid', gap: 12 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <h2
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 1.4,
            color: 'rgba(248, 250, 255, 0.6)',
            margin: 0,
          }}
        >
          Agenda · {totalMinutes} min total
        </h2>
      </div>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        {agenda.map((item, i) => (
          <li
            key={item.id}
            data-testid={`agenda-item-${item.id}`}
            data-index={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '14px 18px',
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: brand.accent_color,
                color: brand.background_color,
                fontWeight: 800,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i + 1}
            </span>
            <span style={{ flex: 1, fontSize: 17, fontWeight: 600, color: '#F8FAFF' }}>
              {item.title}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.6,
                color: 'rgba(248, 250, 255, 0.7)',
                background: 'rgba(255,255,255,0.08)',
                padding: '4px 10px',
                borderRadius: 999,
              }}
            >
              {item.duration_min} min
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

interface FooterMetaProps {
  readonly session: AmbientSessionInfo;
}

function FooterMeta({ session }: FooterMetaProps): ReactElement {
  return (
    <footer
      data-testid="pre-meeting-footer"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 8,
        fontSize: 12,
        color: 'rgba(248, 250, 255, 0.5)',
      }}
    >
      <span>Room: {session.room_name}</span>
      <span data-testid="pre-meeting-presenter-footer">
        Presenter: {session.presenter_name}
      </span>
      <span>
        Deck: <code style={{ fontFamily: 'monospace' }}>{session.deck_id}</code>
      </span>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Background vein — a faint vertical gradient column at center.
// ---------------------------------------------------------------------------

interface BackgroundVeinProps {
  readonly brand: BrandKit;
}

function BackgroundVein({ brand }: BackgroundVeinProps): ReactElement {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `
          linear-gradient(180deg, transparent 0%, ${brand.primary_color}14 50%, transparent 100%),
          radial-gradient(70% 50% at 50% 0%, ${brand.accent_color}14 0%, transparent 70%)
        `,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------

const gridStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'grid',
  gridTemplateRows: 'auto auto 1fr auto',
  gap: 28,
  padding: '52px 72px',
  minHeight: '100vh',
  boxSizing: 'border-box',
};

const metaLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 1.4,
  color: 'rgba(248, 250, 255, 0.5)',
  marginBottom: 2,
};

// Re-export for tests
export { formatChange };
