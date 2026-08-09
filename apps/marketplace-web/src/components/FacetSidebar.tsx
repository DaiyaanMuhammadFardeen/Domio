'use client';

import { useLocale } from '@/hooks/useLocale';
import type { ListingKind, PriceModel } from '@/lib/types';

interface FacetSidebarProps {
  selectedKind: ListingKind | undefined;
  selectedPrice: PriceModel | undefined;
  onKindChange: (kind: ListingKind | undefined) => void;
  onPriceChange: (price: PriceModel | undefined) => void;
}

const KIND_OPTIONS: Array<{ value: ListingKind; labelKey: string }> = [
  { value: 'component', labelKey: 'sidebar.kind.component' },
  { value: 'template', labelKey: 'sidebar.kind.template' },
  { value: 'theme', labelKey: 'sidebar.kind.theme' },
  { value: 'sticker_pack', labelKey: 'sidebar.kind.sticker_pack' },
  { value: 'icon_pack', labelKey: 'sidebar.kind.icon_pack' },
];

const PRICE_OPTIONS: Array<{ value: PriceModel; labelKey: string }> = [
  { value: 'free', labelKey: 'sidebar.price.free' },
  { value: 'one_time', labelKey: 'sidebar.price.one_time' },
  { value: 'subscription', labelKey: 'sidebar.price.subscription' },
  { value: 'team_seats', labelKey: 'sidebar.price.team' },
];

export function FacetSidebar({
  selectedKind,
  selectedPrice,
  onKindChange,
  onPriceChange,
}: FacetSidebarProps) {
  const { t } = useLocale();
  const hasFilters = selectedKind || selectedPrice;

  return (
    <aside className="w-full shrink-0 space-y-6 lg:w-56" aria-label="Filters">
      {/* Kind filter */}
      <fieldset>
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          {t('sidebar.kind')}
        </legend>
        <div className="space-y-1">
          {KIND_OPTIONS.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              onClick={() => onKindChange(selectedKind === value ? undefined : value)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                selectedKind === value
                  ? 'bg-accent/12 text-accent font-medium'
                  : 'text-muted hover:bg-panel hover:text-fg'
              }`}
              aria-pressed={selectedKind === value}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Price filter */}
      <fieldset>
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          {t('sidebar.price')}
        </legend>
        <div className="space-y-1">
          {PRICE_OPTIONS.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              onClick={() => onPriceChange(selectedPrice === value ? undefined : value)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                selectedPrice === value
                  ? 'bg-accent/12 text-accent font-medium'
                  : 'text-muted hover:bg-panel hover:text-fg'
              }`}
              aria-pressed={selectedPrice === value}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Clear */}
      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            onKindChange(undefined);
            onPriceChange(undefined);
          }}
          className="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-fg"
        >
          {t('sidebar.clear')}
        </button>
      )}
    </aside>
  );
}
