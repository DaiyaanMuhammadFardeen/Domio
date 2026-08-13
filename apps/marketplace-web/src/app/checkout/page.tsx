'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from '@/hooks/useLocale';
import { marketplaceWeb } from '@domio/ui/routing';
import { createCheckoutDraft, confirmCheckout } from '@/lib/checkout-service';
import { getMarketplaceListing } from '@/lib/api';
import type {
  BillingAddress,
  CartLine,
  CheckoutDraft,
  PaymentProvider,
  PriceModel,
} from '@/lib/types';

export default function CheckoutPageRoute() {
  return (
    <Suspense
      fallback={<div className="mx-auto max-w-7xl px-4 py-12" data-testid="checkout-loading" />}
    >
      <CheckoutPage />
    </Suspense>
  );
}

function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, formatPrice } = useLocale();
  const listingParam = searchParams.get('listing');

  const [draft, setDraft] = useState<CheckoutDraft | null>(null);
  const [billing, setBilling] = useState<BillingAddress>({
    name: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
  });
  const [provider, setProvider] = useState<PaymentProvider>('stripe');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!listingParam) {
        // Empty cart — provide a 1-line demo cart so the flow is exercisable.
        if (!cancelled) {
          const demo: CartLine = {
            listing_id: 'demo',
            title: 'Demo Marketplace Item',
            price_cents: 2900,
            currency: 'USD',
            quantity: 1,
            price_model: 'one_time' as PriceModel,
          };
          const d = await createCheckoutDraft(
            [demo],
            {
              name: '',
              line1: '',
              city: '',
              state: '',
              postal_code: '',
              country: '',
            },
            provider,
          );
          setDraft(d);
        }
        return;
      }

      try {
        const listing = await getMarketplaceListing(listingParam);
        const line: CartLine = {
          listing_id: listing.id,
          title: listing.title,
          price_cents: listing.price_cents,
          currency: listing.currency,
          quantity: 1,
          price_model: listing.is_free ? 'free' : 'one_time',
        };
        const d = await createCheckoutDraft(
          [line],
          {
            name: '',
            line1: '',
            city: '',
            state: '',
            postal_code: '',
            country: '',
          },
          provider,
        );
        if (!cancelled) setDraft(d);
      } catch {
        if (!cancelled) {
          // Fallback to demo cart if API lookup fails.
          const demo: CartLine = {
            listing_id: listingParam,
            title: 'Listing',
            price_cents: 1999,
            currency: 'USD',
            quantity: 1,
            price_model: 'one_time' as PriceModel,
          };
          const d = await createCheckoutDraft(
            [demo],
            {
              name: '',
              line1: '',
              city: '',
              state: '',
              postal_code: '',
              country: '',
            },
            provider,
          );
          setDraft(d);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [listingParam, provider]);

  const total = draft?.total_cents ?? 0;
  const currency = draft?.currency ?? 'USD';

  const canSubmit = useMemo(() => {
    return (
      !!draft &&
      billing.name.trim().length > 0 &&
      billing.line1.trim().length > 0 &&
      billing.city.trim().length > 0 &&
      billing.state.trim().length > 0 &&
      billing.postal_code.trim().length > 0 &&
      billing.country.trim().length > 0
    );
  }, [draft, billing]);

  async function handlePay() {
    if (!draft || !canSubmit) return;
    setProcessing(true);
    const idem =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`;
    const updated = await createCheckoutDraft(draft.lines, billing, provider);
    try {
      const receipt = await confirmCheckout(updated, idem);
      // Pass the receipt as a hash-route query parameter via sessionStorage.
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('domio.receipt', JSON.stringify(receipt));
        } catch {
          /* no-op */
        }
      }
      router.push(marketplaceWeb('checkout-success'));
    } finally {
      setProcessing(false);
    }
  }

  function update<K extends keyof BillingAddress>(key: K, value: BillingAddress[K]) {
    setBilling((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" data-testid="checkout-page">
      <h1 className="mb-8 font-display text-3xl font-bold text-fg">
        {t('market.checkout.heading')}
      </h1>

      <div className="grid gap-8 lg:grid-cols-[1fr,1.2fr,1fr]">
        {/* Cart lines */}
        <section
          className="space-y-4"
          data-testid="checkout-cart"
          aria-label={t('market.checkout.cart')}
        >
          <h2 className="font-display text-base font-semibold text-fg">
            {t('market.checkout.cart')}
          </h2>
          <div className="rounded-2xl border border-border bg-panel p-4">
            {draft?.lines.length === 0 && <p className="text-sm text-muted">Cart is empty.</p>}
            {draft?.lines.map((line) => (
              <div
                key={line.listing_id}
                className="flex items-center justify-between gap-3 border-b border-border/40 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{line.title}</p>
                  <p className="text-xs text-muted">× {line.quantity}</p>
                </div>
                <p className="text-sm font-semibold text-fg">
                  {formatPrice(line.price_cents * line.quantity, line.currency, false)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Billing form */}
        <section
          className="space-y-4"
          data-testid="checkout-billing"
          aria-label={t('market.checkout.billing')}
        >
          <h2 className="font-display text-base font-semibold text-fg">
            {t('market.checkout.billing')}
          </h2>
          <div className="space-y-3 rounded-2xl border border-border bg-panel p-4">
            <Input
              label={t('market.checkout.billing.name')}
              testId="checkout-billing-name"
              value={billing.name}
              onChange={(v) => update('name', v)}
              autoComplete="name"
            />
            <Input
              label={t('market.checkout.billing.line1')}
              testId="checkout-billing-line1"
              value={billing.line1}
              onChange={(v) => update('line1', v)}
              autoComplete="address-line1"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('market.checkout.billing.city')}
                testId="checkout-billing-city"
                value={billing.city}
                onChange={(v) => update('city', v)}
                autoComplete="address-level2"
              />
              <Input
                label={t('market.checkout.billing.state')}
                testId="checkout-billing-state"
                value={billing.state}
                onChange={(v) => update('state', v)}
                autoComplete="address-level1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('market.checkout.billing.postal')}
                testId="checkout-billing-postal"
                value={billing.postal_code}
                onChange={(v) => update('postal_code', v)}
                autoComplete="postal-code"
              />
              <Input
                label={t('market.checkout.billing.country')}
                testId="checkout-billing-country"
                value={billing.country}
                onChange={(v) => update('country', v)}
                autoComplete="country-name"
              />
            </div>
          </div>
        </section>

        {/* Right: provider + summary */}
        <section className="space-y-6" data-testid="checkout-summary">
          <div>
            <h2 className="mb-3 font-display text-base font-semibold text-fg">
              {t('market.checkout.payment')}
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {(['stripe', 'bkash', 'nagad'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  data-testid={`checkout-provider-${p}`}
                  onClick={() => setProvider(p)}
                  aria-pressed={provider === p}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase transition-colors ${
                    provider === p
                      ? 'border-accent bg-accent/12 text-accent'
                      : 'border-border bg-panel text-muted hover:border-accent/40'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-panel p-4 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-muted">{t('market.checkout.subtotal')}</span>
              <span data-testid="checkout-subtotal">
                {formatPrice(draft?.subtotal_cents ?? 0, currency, false)}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted">{t('market.checkout.tax')}</span>
              <span data-testid="checkout-tax">
                {formatPrice(draft?.tax_cents ?? 0, currency, false)}
              </span>
            </div>
            <div className="mt-2 flex justify-between border-t border-border/40 pt-2 text-base font-semibold">
              <span>{t('market.checkout.total')}</span>
              <span data-testid="checkout-total">{formatPrice(total, currency, false)}</span>
            </div>
          </div>

          <button
            type="button"
            data-testid="checkout-pay"
            disabled={!canSubmit || processing}
            onClick={handlePay}
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing
              ? t('market.checkout.processing')
              : t('market.checkout.pay', {
                  amount: formatPrice(total, currency, false),
                })}
          </button>
        </section>
      </div>
    </div>
  );
}

interface InputProps {
  label: string;
  testId: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}

function Input({ label, testId, value, onChange, autoComplete }: InputProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      <input
        type="text"
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
    </label>
  );
}
