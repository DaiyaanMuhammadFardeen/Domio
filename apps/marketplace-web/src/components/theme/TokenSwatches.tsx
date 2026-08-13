'use client';

import { useLocale } from '@/hooks/useLocale';
import type { ThemeTokens } from '@/lib/theme-service';

export interface TokenSwatchesProps {
  tokens: ThemeTokens;
}

interface ColorRow {
  name: string;
  hex: string;
}

const COLOR_ROWS: ReadonlyArray<ColorRow> = [
  { name: 'primary', hex: 'primary' },
  { name: 'secondary', hex: 'secondary' },
  { name: 'accent', hex: 'accent' },
  { name: 'bg', hex: 'bg' },
  { name: 'surface', hex: 'surface' },
  { name: 'fg', hex: 'fg' },
];

const SPACING_KEYS = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

export function TokenSwatches({ tokens }: TokenSwatchesProps) {
  const { t } = useLocale();

  return (
    <div className="space-y-8" data-testid="theme-token-swatches">
      {/* Colors */}
      <section data-testid="theme-token-colors">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          {t('market.theme.colors')}
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {COLOR_ROWS.map((row) => {
            const value = tokens.color[row.hex as keyof ThemeTokens['color']];
            return (
              <div key={row.name} className="flex flex-col items-center gap-2">
                <div
                  className="h-12 w-12 rounded-full border border-border"
                  style={{ background: value }}
                  aria-hidden="true"
                />
                <p className="text-[11px] font-medium text-fg">{row.name}</p>
                <p className="font-mono text-[10px] text-muted">{value}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Typography */}
      <section data-testid="theme-token-typography">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          {t('market.theme.typography')}
        </h3>
        <div className="space-y-3 rounded-xl border border-border bg-panel p-5">
          <p
            className="text-3xl font-bold text-fg"
            style={{ fontFamily: tokens.fontFamily.heading }}
          >
            Heading · {tokens.fontFamily.heading.split(',')[0]}
          </p>
          <p
            className="text-lg font-semibold text-fg"
            style={{ fontFamily: tokens.fontFamily.heading }}
          >
            Subheading · {tokens.fontFamily.heading.split(',')[0]}
          </p>
          <p className="text-sm text-fg/80" style={{ fontFamily: tokens.fontFamily.body }}>
            Body copy set in {tokens.fontFamily.body.split(',')[0]} — the calm, readable face used
            across paragraphs and bullet lists.
          </p>
          <p
            className="font-mono text-xs text-muted"
            style={{ fontFamily: tokens.fontFamily.body }}
          >
            caption · monospace detail line, used for source notes and timestamps
          </p>
        </div>
      </section>

      {/* Spacing scale */}
      <section data-testid="theme-token-spacing">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          {t('market.theme.spacing')}
        </h3>
        <div className="space-y-2 rounded-xl border border-border bg-panel p-5">
          {SPACING_KEYS.map((key) => {
            const value = tokens.spacing[key];
            const numericPx = parseInt(value, 10) || 0;
            const widthPx = Math.max(numericPx, 8);
            return (
              <div key={key} className="flex items-center gap-4">
                <span className="w-8 font-mono text-[11px] uppercase text-muted">{key}</span>
                <div
                  className="h-3 rounded-sm bg-accent/70"
                  style={{ width: `${widthPx}px` }}
                  aria-hidden="true"
                />
                <span className="font-mono text-[11px] text-muted">{value}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
