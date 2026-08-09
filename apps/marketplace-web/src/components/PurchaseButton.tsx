'use client';

import { useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { createPurchase, ApiError } from '@/lib/api';

interface PurchaseButtonProps {
  listingId: string;
  priceCents: number;
  currency: string;
  isFree: boolean;
  slug: string;
}

export function PurchaseButton({
  listingId,
  priceCents,
  currency,
  isFree,
  slug,
}: PurchaseButtonProps) {
  const { t, formatPrice } = useLocale();
  const [status, setStatus] = useState<'idle' | 'loading' | 'redirecting' | 'success' | 'failed' | 'expired' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const priceText = formatPrice(priceCents, currency, isFree);

  async function handlePurchase() {
    setStatus('loading');

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const result = await createPurchase(listingId, {
        listing_id: listingId,
        provider: 'stripe',
        currency,
        idempotency_key: crypto.randomUUID(),
        success_url: `${origin}/listing/${slug}?purchase=success`,
        cancel_url: `${origin}/listing/${slug}?purchase=cancelled`,
      });

      if (result.checkout_url) {
        setStatus('redirecting');
        // Brief pause so user sees the status, then redirect
        setTimeout(() => {
          window.location.href = result.checkout_url!;
        }, 800);
      } else if (result.status === 'succeeded') {
        setStatus('success');
      } else if (result.status === 'expired') {
        setStatus('expired');
      } else {
        setStatus('redirecting');
        setTimeout(() => {
          window.location.href = result.checkout_url ?? `/listing/${slug}`;
        }, 1200);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.body.detail);
        if (err.body.status === 404) {
          setStatus('failed');
        } else {
          setStatus('error');
        }
      } else {
        setErrorMessage(t('error.title'));
        setStatus('error');
      }
    }
  }

  // Checkout states
  if (status === 'redirecting') {
    return (
      <div className="rounded-xl bg-accent/8 p-4 text-center" role="status">
        <div className="mb-2 inline-block h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
        <p className="text-sm text-accent">{t('checkout.redirecting')}</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="rounded-xl bg-success/8 p-4 text-center" role="status">
        <p className="text-sm font-medium text-success">{t('checkout.success')}</p>
      </div>
    );
  }

  if (status === 'failed' || status === 'expired') {
    return (
      <div className="rounded-xl bg-error/8 p-4 text-center">
        <p className="mb-3 text-sm text-error">
          {status === 'expired' ? t('checkout.expired') : t('checkout.failed')}
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors hover:text-fg"
        >
          {t('checkout.backToItem')}
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl bg-error/8 p-4 text-center">
        <p className="mb-1 text-sm text-error">{t('error.title')}</p>
        {errorMessage && (
          <p className="mb-3 text-xs text-muted">{errorMessage}</p>
        )}
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors hover:text-fg"
        >
          {t('error.retry')}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handlePurchase}
      disabled={status === 'loading'}
      className="w-full rounded-xl bg-accent py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-lg hover:shadow-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={isFree ? t('detail.freeInstall') : `${t('detail.buy')} — ${priceText}`}
    >
      {status === 'loading' ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          {t('loading')}
        </span>
      ) : isFree ? (
        t('detail.freeInstall')
      ) : (
        `${t('detail.buy')} · ${priceText}`
      )}
    </button>
  );
}
