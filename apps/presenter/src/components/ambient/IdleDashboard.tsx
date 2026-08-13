'use client';

/**
 * IdleDashboard — Wave 11 §S11.6.
 *
 * The audience-facing idle surface shown on the projector / audience
 * display while no presenter is connected. Three rows:
 *
 *   1. Header: deck title, next session time, countdown.
 *   2. KPI tiles: 3 number tiles reading from the deck's data sources.
 *      When a tile's value changes, the tile pulses subtly so attendees
 *      notice live updates without being distracted.
 *   3. Ticker: a slowly rotating strip of 3-5 deck highlights.
 *
 * The background is tinted with the deck's brand kit primary color so
 * the projector is visually anchored to the deck's identity. The
 * transition out of this screen is handled by TransitionOverlay — this
 * component fades its own opacity to zero when `dismissing` is true so
 * the overlay can settle on top of it cleanly.
 */

import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import {
  formatChange,
  formatTime,
  gradientFor,
  isStartingNow,
  minutesUntilScheduled,
  type AmbientSessionInfo,
  type BrandKit,
  type DataSourceSnapshot,
  type TickerItem,
} from '../../lib/ambient-service';

export interface IdleDashboardProps {
  readonly session: AmbientSessionInfo;
  readonly snapshots: ReadonlyArray<DataSourceSnapshot>;
  readonly ticker: ReadonlyArray<TickerItem>;
  /** True while the presenter is connecting — fades the dashboard out. */
  readonly dismissing?: boolean;
  /** Override the current timestamp (used in tests). */
  readonly nowMs?: number;
  /** ms between KPI pulses on update — defaults to 1200. */
  readonly pulseDurationMs?: number;
  /** ms per ticker item — defaults to 5000. */
  readonly tickerRotationMs?: number;
  readonly dataTestId?: string;
}

const DEFAULT_PULSE_MS = 1200;
const DEFAULT_TICKER_MS = 5000;

export function IdleDashboard({
  session,
  snapshots,
  ticker,
  dismissing = false,
  nowMs,
  pulseDurationMs = DEFAULT_PULSE_MS,
  tickerRotationMs = DEFAULT_TICKER_MS,
  dataTestId = 'idle-dashboard',
}: IdleDashboardProps): ReactElement {
  // The "now" timestamp drives the countdown. If a parent test injects
  // `nowMs` we honor it; otherwise we keep a self-updating clock so the
  // minute counter ticks over on its own.
  const [tick, setTick] = useState<number>(() => nowMs ?? Date.now());
  useEffect(() => {
    if (nowMs !== undefined) return;
    const handle = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(handle);
  }, [nowMs]);

  const minutes = useMemo(
    () => minutesUntilScheduled(session.scheduled_at_ms, nowMs ?? tick),
    [session.scheduled_at_ms, nowMs, tick],
  );
  const starting = useMemo(
    () => isStartingNow(session.scheduled_at_ms, nowMs ?? tick),
    [session.scheduled_at_ms, nowMs, tick],
  );

  const visibleSnapshots = useMemo(() => snapshots.slice(0, 3), [snapshots]);
  const visibleTicker = useMemo(() => ticker.slice(0, 5), [ticker]);

  // Brand-tinted background. We blend the brand primary at 18% into the
  // brand background, giving a subtle wash that ties the dashboard to
  // the deck without overwhelming the KPI numbers.
  const wrapperStyle: CSSProperties = {
    position: 'relative',
    minHeight: '100vh',
    width: '100%',
    color: '#F8FAFF',
    background: gradientFor(session.brand_kit),
    fontFamily: session.brand_kit.font_family,
    transition: 'opacity 420ms ease-out, transform 420ms ease-out',
    opacity: dismissing ? 0 : 1,
    transform: dismissing ? 'translateX(-32px)' : 'translateX(0)',
    overflow: 'hidden',
  };

  return (
    <section
      data-testid={dataTestId}
      data-dismissing={dismissing ? 'true' : 'false'}
      aria-label="Ambient idle dashboard"
      style={wrapperStyle}
    >
      <BackgroundWash brand={session.brand_kit} />
      <div style={contentGridStyle}>
        <HeaderRow
          session={session}
          minutes={minutes}
          starting={starting}
        />

        <KpiRow
          snapshots={visibleSnapshots}
          brand={session.brand_kit}
          pulseDurationMs={pulseDurationMs}
        />

        <TickerRow items={visibleTicker} rotationMs={tickerRotationMs} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface HeaderRowProps {
  readonly session: AmbientSessionInfo;
  readonly minutes: number;
  readonly starting: boolean;
}

function HeaderRow({ session, minutes, starting }: HeaderRowProps): ReactElement {
  const time = formatTime(session.scheduled_at_ms);
  return (
    <header
      data-testid="idle-dashboard-header"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 24,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: 'rgba(248, 250, 255, 0.6)',
            marginBottom: 4,
          }}
        >
          Next session
        </div>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.1,
            color: '#F8FAFF',
          }}
        >
          {session.deck_title}
        </h1>
        <div
          style={{
            marginTop: 8,
            fontSize: 14,
            color: 'rgba(248, 250, 255, 0.7)',
          }}
        >
          {session.room_name} · with {session.presenter_name}
        </div>
      </div>
      <div
        data-testid="idle-dashboard-countdown"
        style={{
          textAlign: 'right',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: 'rgba(248, 250, 255, 0.6)',
            marginBottom: 4,
          }}
        >
          {starting ? 'Starting now' : `Starts in ${minutes} min`}
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            color: '#F8FAFF',
            lineHeight: 1,
          }}
        >
          {time}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// KPI tiles
// ---------------------------------------------------------------------------

interface KpiRowProps {
  readonly snapshots: ReadonlyArray<DataSourceSnapshot>;
  readonly brand: BrandKit;
  readonly pulseDurationMs: number;
}

function KpiRow({ snapshots, brand, pulseDurationMs }: KpiRowProps): ReactElement {
  return (
    <section
      data-testid="idle-dashboard-kpis"
      aria-label="Live data"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.max(snapshots.length, 1)}, minmax(0, 1fr))`,
        gap: 16,
      }}
    >
      {snapshots.map((snap) => (
        <KpiTile
          key={snap.id}
          snapshot={snap}
          brand={brand}
          pulseDurationMs={pulseDurationMs}
        />
      ))}
    </section>
  );
}

interface KpiTileProps {
  readonly snapshot: DataSourceSnapshot;
  readonly brand: BrandKit;
  readonly pulseDurationMs: number;
}

function KpiTile({ snapshot, brand, pulseDurationMs }: KpiTileProps): ReactElement {
  // Pulse: whenever the formatted value or updated_at changes since the
  // last render, we apply a short-lived highlight via CSS transition.
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    setPulsing(true);
    const handle = setTimeout(() => setPulsing(false), pulseDurationMs);
    return () => clearTimeout(handle);
  }, [snapshot.formatted, snapshot.value, pulseDurationMs]);

  const trendColor =
    snapshot.trend === 'up'
      ? '#22D3A0'
      : snapshot.trend === 'down'
        ? '#F87171'
        : 'rgba(248, 250, 255, 0.5)';

  const trendArrow = snapshot.trend === 'up' ? '▲' : snapshot.trend === 'down' ? '▼' : '→';

  return (
    <article
      data-testid={`kpi-tile-${snapshot.id}`}
      data-pulsing={pulsing ? 'true' : 'false'}
      style={{
        padding: '20px 22px',
        borderRadius: 12,
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(6px)',
        boxShadow: pulsing
          ? `0 0 0 1px ${brand.accent_color}, 0 12px 32px rgba(0, 0, 0, 0.32)`
          : '0 12px 32px rgba(0, 0, 0, 0.2)',
        transition: `box-shadow ${pulseDurationMs}ms ease-out, transform ${pulseDurationMs}ms ease-out`,
        transform: pulsing ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 1,
            color: 'rgba(248, 250, 255, 0.6)',
          }}
        >
          {snapshot.name}
        </span>
        <span
          data-testid={`kpi-trend-${snapshot.id}`}
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: trendColor,
          }}
        >
          {trendArrow} {formatChange(snapshot.change_pct)}
        </span>
      </div>
      <div
        data-testid={`kpi-value-${snapshot.id}`}
        style={{
          fontSize: 44,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          marginTop: 12,
          color: '#F8FAFF',
          lineHeight: 1.05,
        }}
      >
        {snapshot.formatted}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 1,
          color: 'rgba(248, 250, 255, 0.4)',
        }}
      >
        {snapshot.kind}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Ticker
// ---------------------------------------------------------------------------

interface TickerRowProps {
  readonly items: ReadonlyArray<TickerItem>;
  readonly rotationMs: number;
}

function TickerRow({ items, rotationMs }: TickerRowProps): ReactElement {
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    if (items.length <= 1) return;
    const handle = setInterval(() => {
      setCursor((c) => (c + 1) % items.length);
    }, rotationMs);
    return () => clearInterval(handle);
  }, [items.length, rotationMs]);

  if (items.length === 0) {
    return (
      <section
        data-testid="idle-dashboard-ticker"
        aria-label="Latest"
        style={tickerShellStyle}
      >
        <span style={{ fontSize: 12, opacity: 0.5 }}>No updates yet</span>
      </section>
    );
  }

  const active = items[cursor] ?? items[0]!;

  return (
    <section
      data-testid="idle-dashboard-ticker"
      aria-label="Latest"
      style={tickerShellStyle}
    >
      <span style={tickerLabelStyle}>Latest</span>
      <span
        key={active.id}
        data-testid={`ticker-item-${active.id}`}
        style={{
          animation: 'ambient-ticker-in 360ms ease-out',
          fontSize: 16,
          fontWeight: 600,
          color: '#F8FAFF',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <KindBadge kind={active.kind} />
        {active.text}
      </span>
      <span
        aria-hidden
        style={{
          marginLeft: 'auto',
          display: 'flex',
          gap: 6,
        }}
      >
        {items.map((item, i) => (
          <span
            key={item.id}
            data-active={i === cursor ? 'true' : 'false'}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: i === cursor ? '#F8FAFF' : 'rgba(248, 250, 255, 0.25)',
              transition: 'background 200ms ease-out',
            }}
          />
        ))}
      </span>
      <AmbientStylesheet />
    </section>
  );
}

const tickerShellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '14px 18px',
  borderRadius: 10,
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.07)',
  minHeight: 56,
};

const tickerLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 1.4,
  color: 'rgba(248, 250, 255, 0.5)',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid rgba(255, 255, 255, 0.18)',
};

function KindBadge({ kind }: { readonly kind: TickerItem['kind'] }): ReactElement {
  const palette: Record<TickerItem['kind'], { bg: string; fg: string; label: string }> = {
    highlight: { bg: 'rgba(34, 211, 160, 0.18)', fg: '#22D3A0', label: 'Highlight' },
    announcement: { bg: 'rgba(96, 165, 250, 0.18)', fg: '#60A5FA', label: 'Announcement' },
    milestone: { bg: 'rgba(250, 204, 21, 0.18)', fg: '#FACC15', label: 'Milestone' },
  };
  const tone = palette[kind];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 1,
        padding: '2px 8px',
        borderRadius: 999,
        background: tone.bg,
        color: tone.fg,
      }}
    >
      {tone.label}
    </span>
  );
}

function AmbientStylesheet(): ReactElement {
  // Local keyframes — we keep these scoped here so any component that
  // imports IdleDashboard picks them up without depending on a global
  // stylesheet.
  return (
    <style jsx>{`
      @keyframes ambient-ticker-in {
        from { opacity: 0; transform: translateX(-12px); }
        to   { opacity: 1; transform: translateX(0); }
      }
    `}</style>
  );
}

// ---------------------------------------------------------------------------
// Background wash
// ---------------------------------------------------------------------------

interface BackgroundWashProps {
  readonly brand: BrandKit;
}

function BackgroundWash({ brand }: BackgroundWashProps): ReactElement {
  // Soft radial spotlights that highlight the corners using the brand
  // accent. Stays low-contrast on purpose so foreground text wins.
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `
          radial-gradient(60% 60% at 10% 12%, ${brand.primary_color}33 0%, transparent 60%),
          radial-gradient(50% 50% at 90% 88%, ${brand.accent_color}22 0%, transparent 60%)
        `,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------

const contentGridStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  gap: 32,
  padding: '48px 64px',
  minHeight: '100vh',
  boxSizing: 'border-box',
};

// ---------------------------------------------------------------------------
// Pure formatters (imported from the service module so that sibling
// components and tests share a single source of truth).
// ---------------------------------------------------------------------------
