'use client';

import { Star } from 'lucide-react';
import type { WizardDraft } from '../../lib/types';

export interface PreviewTabProps {
  readonly draft: WizardDraft;
}

function formatPrice(draft: WizardDraft): string {
  const p = draft.pricing;
  if (!p) return '—';
  if (p.model === 'free') return 'Free';
  if (p.model === 'enterprise_quote') return 'Enterprise — contact';
  if (p.model === 'subscription' && p.subscription_interval) {
    return `${(p.price_cents / 100).toFixed(2)} ${p.currency} / ${p.subscription_interval}`;
  }
  return `${(p.price_cents / 100).toFixed(2)} ${p.currency}`;
}

export function PreviewTab({ draft }: PreviewTabProps) {
  const cover = draft.assets.find((a) => a.kind === 'cover' && a.uploaded_url);
  const title = draft.details?.title ?? 'Untitled listing';
  const description = draft.details?.description ?? '';
  const tags = draft.details?.tags ?? [];

  return (
    <aside
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"
      data-testid="wizard-preview"
      aria-label="Listing preview"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Marketplace preview
      </h3>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <div className="flex aspect-video items-center justify-center bg-slate-100 text-xs text-slate-500">
          {cover ? (
            <img
              src={cover.uploaded_url ?? ''}
              alt={title}
              className="h-full w-full object-cover"
            />
          ) : (
            'No cover yet'
          )}
        </div>
        <div className="space-y-1 p-3">
          <p className="line-clamp-1 text-sm font-semibold text-slate-900">{title}</p>
          {description && <p className="line-clamp-2 text-xs text-slate-500">{description}</p>}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-medium text-slate-900">{formatPrice(draft)}</span>
            <span className="inline-flex items-center gap-0.5 text-xs text-amber-500">
              <Star className="h-3.5 w-3.5 fill-current" />
              <Star className="h-3.5 w-3.5 fill-current" />
              <Star className="h-3.5 w-3.5 fill-current" />
              <Star className="h-3.5 w-3.5 fill-current" />
              <Star className="h-3.5 w-3.5" />
            </span>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        This is how your listing will appear once it has been published.
      </p>
    </aside>
  );
}
