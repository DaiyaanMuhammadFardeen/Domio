'use client';

import { useLocale } from '@/hooks/useLocale';
import type { FacetKey, SearchFacets } from '@/lib/types';

interface FacetSidebarProps {
  facets: SearchFacets;
  selectedKind: ReadonlyArray<string>;
  selectedTheme: ReadonlyArray<string>;
  selectedColor: ReadonlyArray<string>;
  selectedLanguage: ReadonlyArray<string>;
  selectedPrice: 'free' | 'paid' | null;
  selectedRating: number | null;
  onKindToggle: (value: string) => void;
  onThemeToggle: (value: string) => void;
  onColorToggle: (value: string) => void;
  onLanguageToggle: (value: string) => void;
  onPriceChange: (value: 'free' | 'paid' | null) => void;
  onRatingChange: (value: number | null) => void;
  onClear: () => void;
}

const RATING_OPTIONS: ReadonlyArray<number> = [5, 4, 3, 2, 1];

export function FacetSidebar({
  facets,
  selectedKind,
  selectedTheme,
  selectedColor,
  selectedLanguage,
  selectedPrice,
  selectedRating,
  onKindToggle,
  onThemeToggle,
  onColorToggle,
  onLanguageToggle,
  onPriceChange,
  onRatingChange,
  onClear,
}: FacetSidebarProps) {
  const { t } = useLocale();

  const hasAny =
    selectedKind.length > 0 ||
    selectedTheme.length > 0 ||
    selectedColor.length > 0 ||
    selectedLanguage.length > 0 ||
    selectedPrice !== null ||
    selectedRating !== null;

  return (
    <aside className="w-full shrink-0 space-y-6 lg:w-56" aria-label="Filters">
      <FacetGroup
        facetKey="kind"
        label={t('market.search.facets.kind')}
        values={facets.kind.map((v) => ({ value: v.value, count: v.count }))}
        selected={selectedKind}
        onToggle={onKindToggle}
      />
      <FacetGroup
        facetKey="theme"
        label={t('market.search.facets.theme')}
        values={facets.theme.map((v) => ({ value: v.value, count: v.count }))}
        selected={selectedTheme}
        onToggle={onThemeToggle}
      />
      <FacetGroup
        facetKey="color"
        label={t('market.search.facets.color')}
        values={facets.color.map((v) => ({ value: v.value, count: v.count }))}
        selected={selectedColor}
        onToggle={onColorToggle}
      />
      <FacetGroup
        facetKey="language"
        label={t('market.search.facets.language')}
        values={facets.language.map((v) => ({ value: v.value, count: v.count }))}
        selected={selectedLanguage}
        onToggle={onLanguageToggle}
      />

      {/* Price — single-select (free vs paid) */}
      <fieldset data-testid="facet-price">
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          {t('market.search.facets.price')}
        </legend>
        <div className="space-y-1">
          {[
            { value: 'free' as const, label: 'Free', count: facets.price.free },
            { value: 'paid' as const, label: 'Paid', count: facets.price.paid },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              data-testid={`facet-price-${opt.value}`}
              onClick={() =>
                onPriceChange(selectedPrice === opt.value ? null : opt.value)
              }
              aria-pressed={selectedPrice === opt.value}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                selectedPrice === opt.value
                  ? 'bg-accent/12 text-accent font-medium'
                  : 'text-muted hover:bg-panel hover:text-fg'
              }`}
            >
              <span className="flex w-full items-center justify-between">
                <span>{opt.label}</span>
                <span className="text-[11px] text-muted">{opt.count}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* Rating — single-select lowest star floor */}
      <fieldset data-testid="facet-rating">
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          {t('market.search.facets.rating')}
        </legend>
        <div className="space-y-1">
          {RATING_OPTIONS.map((value) => {
            const count = facets.rating.find((r) => r.value === value)?.count ?? 0;
            const active = selectedRating === value;
            return (
              <button
                key={value}
                type="button"
                data-testid={`facet-rating-${value}`}
                onClick={() =>
                  onRatingChange(active ? null : value)
                }
                aria-pressed={active}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? 'bg-accent/12 text-accent font-medium'
                    : 'text-muted hover:bg-panel hover:text-fg'
                }`}
              >
                <span className="flex w-full items-center justify-between">
                  <span>{value}+ stars</span>
                  <span className="text-[11px] text-muted">{count}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {hasAny && (
        <button
          type="button"
          onClick={onClear}
          className="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-fg"
        >
          {t('sidebar.clear')}
        </button>
      )}
    </aside>
  );
}

interface FacetGroupProps {
  facetKey: FacetKey;
  label: string;
  values: ReadonlyArray<{ value: string; count: number }>;
  selected: ReadonlyArray<string>;
  onToggle: (value: string) => void;
}

function FacetGroup({ facetKey, label, values, selected, onToggle }: FacetGroupProps) {
  if (values.length === 0) return null;
  return (
    <fieldset data-testid={`facet-${facetKey}`}>
      <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </legend>
      <div className="space-y-1">
        {values.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              data-testid={`facet-${facetKey}-${opt.value}`}
              onClick={() => onToggle(opt.value)}
              aria-pressed={active}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? 'bg-accent/12 text-accent font-medium'
                  : 'text-muted hover:bg-panel hover:text-fg'
              }`}
            >
              <span className="flex w-full items-center justify-between">
                <span>{opt.value}</span>
                <span className="text-[11px] text-muted">{opt.count}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
