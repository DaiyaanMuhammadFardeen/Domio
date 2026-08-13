'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/hooks/useLocale';
import { marketplaceWeb } from '@domio/ui/routing';
import type { Receipt } from '@/lib/types';

export default function CheckoutSuccessPage() {
  const { t, formatPrice } = useLocale();
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem('domio.receipt');
      if (raw) setReceipt(JSON.parse(raw) as Receipt);
    } catch {
      /* no-op */
    }
  }, []);

  return (
    <div
      className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8"
      data-testid="checkout-success"
    >
      <div className="rounded-2xl border border-border bg-panel p-8 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success/12">
          <svg className="h-8 w-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="mb-2 font-display text-3xl font-bold text-fg">
          {t('market.success.heading')}
        </h1>

        {receipt && (
          <p className="text-sm text-muted">
            {receipt.purchase_id} · {receipt.provider}
          </p>
        )}
      </div>

      {receipt && (
        <section className="mt-8 rounded-2xl border border-border bg-panel p-6" data-testid="checkout-receipt">
          <h2 className="mb-4 font-display text-base font-semibold text-fg">
            {t('market.success.receipt')}
          </h2>

          <div className="space-y-2 text-sm">
            {receipt.lines.map((line) => (
              <div
                key={line.listing_id}
                className="flex items-center justify-between border-b border-border/40 py-2 last:border-0"
              >
                <span className="text-fg">{line.title}</span>
                <a
                  href={receipt.receipt_pdf_url}
                  data-testid="checkout-receipt-pdf"
                  className="text-xs text-accent hover:underline"
                >
                  {t('market.success.downloadPdf')}
                </a>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-1 text-sm">
            <div className="flex justify-between text-muted">
              <span>{t('market.checkout.subtotal')}</span>
              <span>{formatPrice(receipt.subtotal_cents, receipt.currency, false)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>{t('market.checkout.tax')}</span>
              <span>{formatPrice(receipt.tax_cents, receipt.currency, false)}</span>
            </div>
            <div className="flex justify-between border-t border-border/40 pt-2 text-base font-semibold">
              <span>{t('market.checkout.total')}</span>
              <span>{formatPrice(receipt.total_cents, receipt.currency, false)}</span>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link
              href={marketplaceWeb('library')}
              data-testid="checkout-library-link"
              className="inline-flex rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t('market.success.viewLibrary')}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
