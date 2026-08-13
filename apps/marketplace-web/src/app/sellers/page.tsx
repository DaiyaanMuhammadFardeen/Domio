/**
 * "Become a creator" landing page — Wave 9 S9.9.
 *
 * Hero, stats, why-sell grid, how-it-works timeline, featured creators,
 * testimonial, and bottom CTA.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/hooks/useLocale';
import { listFeaturedCreators, type FeaturedCreator } from '@/lib/creator-service';
import { CreatorCard, StatStrip } from '@/components/marketplace';
import { marketplaceWeb, creatorConsole, localUrl } from '@domio/ui/routing';

const TESTIMONIALS: ReadonlyArray<{ quote: string; author: string; role: string }> = [
  {
    quote:
      'Domio gave me an audience I never could have built on my own. I shipped a component kit in a weekend and it became my best month ever.',
    author: 'Ada Lovelace',
    role: 'Creator · ada',
  },
  {
    quote:
      'The tooling is the best I have used. Versioning, changelogs, and analytics — everything is in one console.',
    author: 'Alan Turing',
    role: 'Creator · turing',
  },
];

export default function SellersPage() {
  const { t } = useLocale();
  const [creators, setCreators] = useState<FeaturedCreator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await listFeaturedCreators();
      if (cancelled) return;
      setCreators(data.slice(0, 6));
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = [
    { value: '10K+', label: t('market.sellers.stats.creators') },
    { value: '$2M', label: t('market.sellers.stats.paidOut') },
    { value: '180', label: t('market.sellers.stats.countries') },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" data-testid="sellers-page">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="mb-16 text-center sm:mb-24">
        <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold tracking-tight text-fg text-balance sm:text-5xl lg:text-6xl">
          {t('market.sellers.hero.heading')}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted sm:text-lg">
          {t('market.sellers.hero.subtitle')}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={localUrl('creatorConsole', creatorConsole('onboarding'))}
            className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            data-testid="sellers-cta-apply"
          >
            {t('market.sellers.hero.cta')}
          </a>
        </div>
      </section>

      {/* ── Stats strip ──────────────────────────────────────────── */}
      <section className="mb-20">
        <StatStrip stats={stats} />
      </section>

      {/* ── Why sell on Domio ────────────────────────────────────── */}
      <section className="mb-20" data-testid="sellers-why">
        <h2 className="mb-8 text-center font-display text-2xl font-bold text-fg sm:text-3xl">
          {t('market.sellers.why.heading')}
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <BenefitCard
            icon={<ReachIcon />}
            title={t('market.sellers.why.reach.title')}
            body={t('market.sellers.why.reach.body')}
          />
          <BenefitCard
            icon={<ToolingIcon />}
            title={t('market.sellers.why.tooling.title')}
            body={t('market.sellers.why.tooling.body')}
          />
          <BenefitCard
            icon={<PayoutsIcon />}
            title={t('market.sellers.why.payouts.title')}
            body={t('market.sellers.why.payouts.body')}
          />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="mb-20" data-testid="sellers-how">
        <h2 className="mb-8 text-center font-display text-2xl font-bold text-fg sm:text-3xl">
          {t('market.sellers.how.heading')}
        </h2>
        <ol className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <TimelineStep
            step={1}
            title={t('market.sellers.how.step1.title')}
            body={t('market.sellers.how.step1.body')}
          />
          <TimelineStep
            step={2}
            title={t('market.sellers.how.step2.title')}
            body={t('market.sellers.how.step2.body')}
          />
          <TimelineStep
            step={3}
            title={t('market.sellers.how.step3.title')}
            body={t('market.sellers.how.step3.body')}
          />
        </ol>
      </section>

      {/* ── Featured creators ────────────────────────────────────── */}
      <section className="mb-20" data-testid="sellers-featured">
        <h2 className="mb-8 text-center font-display text-2xl font-bold text-fg sm:text-3xl">
          {t('market.sellers.featured.heading')}
        </h2>
        {loading ? (
          <p className="text-center text-sm text-muted">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {creators.map((c) => (
              <CreatorCard key={c.handle} creator={c} />
            ))}
          </div>
        )}
      </section>

      {/* ── Testimonials ─────────────────────────────────────────── */}
      <section className="mb-20" data-testid="sellers-testimonials">
        <h2 className="mb-8 text-center font-display text-2xl font-bold text-fg sm:text-3xl">
          {t('market.sellers.testimonial.heading')}
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {TESTIMONIALS.map((tq) => (
            <figure key={tq.author} className="rounded-2xl border border-border bg-panel p-6">
              <blockquote className="font-display text-base leading-relaxed text-fg">
                “{tq.quote}”
              </blockquote>
              <figcaption className="mt-4 text-xs text-muted">
                <span className="font-semibold text-fg">{tq.author}</span>
                {' — '}
                {tq.role}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── CTA strip ────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-panel to-panel p-8 text-center sm:p-12"
        data-testid="sellers-cta"
      >
        <h2 className="font-display text-2xl font-bold text-fg sm:text-3xl">
          {t('market.sellers.cta.heading')}
        </h2>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={localUrl('creatorConsole', creatorConsole('onboarding'))}
            className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            {t('market.sellers.cta.cta')}
          </a>
          <Link
            href={marketplaceWeb('home')}
            className="rounded-xl border border-border bg-panel px-6 py-3 text-sm font-semibold text-fg transition-colors hover:border-accent/40 hover:text-accent"
          >
            {t('market.creator.browseMarketplace')}
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */

interface BenefitCardProps {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly body: string;
}

function BenefitCard({ icon, title, body }: BenefitCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-6">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
        {icon}
      </div>
      <h3 className="font-display text-base font-semibold text-fg">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

interface TimelineStepProps {
  readonly step: number;
  readonly title: string;
  readonly body: string;
}

function TimelineStep({ step, title, body }: TimelineStepProps) {
  return (
    <li className="relative rounded-2xl border border-border bg-panel p-6">
      <span
        className="absolute -top-3 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-white"
        aria-hidden="true"
      >
        {step}
      </span>
      <h3 className="mt-2 font-display text-base font-semibold text-fg">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </li>
  );
}

function ReachIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.5-2 4-5 4-8 0-3-1.5-6-4-8-2.5 2-4 5-4 8 0 3 1.5 6 4 8zM3.5 9h17M3.5 15h17"
      />
    </svg>
  );
}

function ToolingIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.7 6.3a4 4 0 105.4 5.4l-1.4 1.4a1 1 0 00-1.4 0l-7 7a2 2 0 11-2.8-2.8l7-7a1 1 0 000-1.4l-1.4-1.4z"
      />
    </svg>
  );
}

function PayoutsIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2zm3 11v2m8-2v2M9 14h.01M15 14h.01"
      />
    </svg>
  );
}
