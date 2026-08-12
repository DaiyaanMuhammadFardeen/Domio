'use client';

/**
 * ThemePanel — full right-side panel for theme + brand.
 *
 * Per Wave 2 §S2.5 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Tab strip:
 *   - Tokens  — full editor for color / type / spacing / radius / shadow
 *   - Brand kits  — list, edit, extract from URL
 *   - Multi-brand — per-slide / per-deck active kit
 *   - Marketplace — install themes
 *   - Lint — style lint + one-click fix
 *
 * This is a composition root: the existing `ThemeBrandPanel` is
 * rendered inside the "Brand kits" tab so the legacy user-facing
 * experience still works. A dark-mode generator sits at the top of
 * every tab.
 *
 * Hosts wire the panel to the editor's theme slice + the engine
 * bridge via the props. The panel is unopinionated about
 * persistence.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { ThemeOption, BrandKitOption, PaletteOverride, ColorScheme } from '../../panels/theme-brand-panel';
import { BrandExtractDialog } from './BrandExtractDialog';
import { DarkModeGenerator } from './DarkModeGenerator';
import { MultiBrandSwitcher } from './MultiBrandSwitcher';
import { StyleLintPanel, type LintElementSummary } from './StyleLintPanel';
import { ThemeMarketplace } from './ThemeMarketplace';
import { TokenEditor } from './TokenEditor';
import type { BrandKitDetail, LintIssue, ThemeDetail } from '../../lib/brand-service';
import { DEFAULT_THEMES } from '../../lib/brand-service';

export type ThemePanelTab = 'tokens' | 'kits' | 'multi-brand' | 'marketplace' | 'lint';

export interface ThemePanelProps {
  // Theme + brand kit selection (kept compatible with the legacy panel).
  themes: readonly ThemeOption[];
  activeThemeId: string;
  onThemeChange: (themeId: string) => void;
  brandKits: readonly BrandKitOption[];
  activeBrandKitId: string;
  onBrandKitChange: (brandKitId: string) => void;
  colorScheme: ColorScheme;
  onSchemeToggle: (next: ColorScheme) => void;
  override: PaletteOverride | null;
  onOverrideChange: (next: PaletteOverride | null) => void;
  // Full token detail for the active kit, used by the Tokens tab.
  activeKitDetail: BrandKitDetail;
  onKitDetailChange: (kit: BrandKitDetail) => void;
  // Multi-brand: per-slide kit override.
  slideKitId: string | null;
  onSlideKitChange: (kitId: string | null) => void;
  // Stylelint.
  lintElements: readonly LintElementSummary[];
  onLintFix: (elementId: string, issue: LintIssue) => void;
  // Marketplace install.
  onMarketplaceInstall: (theme: ThemeDetail) => void;
  // Optional: dark-mode generator success.
  onDarkGenerated: (theme: ThemeDetail) => void;
  // Optional id.
  id?: string | undefined;
  readOnly?: boolean | undefined;
}

export function ThemePanel(props: ThemePanelProps): ReactElement {
  const [tab, setTab] = useState<ThemePanelTab>('kits');
  const [extractOpen, setExtractOpen] = useState(false);

  const activeTheme = useMemo<ThemeDetail>(
    () => DEFAULT_THEMES.find((t) => t.id === props.activeThemeId) ?? DEFAULT_THEMES[0]!,
    [props.activeThemeId],
  );

  const handleAcceptExtracted = useCallback(
    (kit: BrandKitDetail) => {
      props.onKitDetailChange(kit);
      props.onBrandKitChange(kit.id);
      setExtractOpen(false);
    },
    [props],
  );

  return (
    <section className="theme-panel" data-testid={props.id ?? 'theme-panel'}>
      <header className="theme-panel__head">
        <h2 className="theme-panel__title">Theme &amp; brand</h2>
        <select
          className="theme-panel__theme-select"
          aria-label="Active theme"
          value={props.activeThemeId}
          onChange={(e) => props.onThemeChange(e.target.value)}
          data-testid="theme-panel-theme-select"
        >
          {props.themes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </header>

      <DarkModeGenerator
        activeTheme={activeTheme}
        colorScheme={props.colorScheme}
        onSchemeToggle={props.onSchemeToggle}
        onGenerated={props.onDarkGenerated}
      />

      <nav className="theme-panel__tabs" role="tablist" aria-label="Theme panel tabs">
        {(['kits', 'tokens', 'multi-brand', 'marketplace', 'lint'] as const).map((id2) => (
          <button
            key={id2}
            type="button"
            role="tab"
            aria-selected={tab === id2}
            className={`theme-panel__tab${tab === id2 ? ' is-active' : ''}`}
            onClick={() => setTab(id2)}
            data-testid={`theme-panel-tab-${id2}`}
          >
            {TAB_LABELS[id2]}
          </button>
        ))}
      </nav>

      <div className="theme-panel__body" data-testid={`theme-panel-body-${tab}`}>
        {tab === 'tokens' && (
          <TokenEditor kit={props.activeKitDetail} onChange={props.onKitDetailChange} readOnly={props.readOnly} />
        )}
        {tab === 'kits' && (
          <div className="theme-panel__kits">
            <div className="theme-panel__kits-list">
              {props.brandKits.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`theme-panel__kits-row${b.id === props.activeBrandKitId ? ' is-active' : ''}`}
                  onClick={() => props.onBrandKitChange(b.id)}
                  data-testid={`theme-panel-kit-${b.id}`}
                >
                  <span
                    className="theme-panel__kits-swatch"
                    style={{ background: b.primaryHex }}
                    aria-hidden
                  />
                  <span
                    className="theme-panel__kits-swatch theme-panel__kits-swatch--accent"
                    style={{ background: b.accentHex }}
                    aria-hidden
                  />
                  <span className="theme-panel__kits-name">{b.name}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="theme-panel__extract"
              onClick={() => setExtractOpen(true)}
              data-testid="theme-panel-extract-btn"
            >
              Extract from URL…
            </button>
          </div>
        )}
        {tab === 'multi-brand' && (
          <MultiBrandSwitcher
            kits={[props.activeKitDetail]}
            deckKitId={props.activeBrandKitId}
            activeSlideKitId={props.slideKitId}
            onDeckKitChange={props.onBrandKitChange}
            onSlideKitChange={props.onSlideKitChange}
            onUpdateKit={(id2, patch) =>
              props.onKitDetailChange({ ...props.activeKitDetail, id: id2, ...patch })
            }
            readOnly={props.readOnly}
          />
        )}
        {tab === 'marketplace' && (
          <ThemeMarketplace
            brandKitId={props.activeBrandKitId}
            onInstall={props.onMarketplaceInstall}
          />
        )}
        {tab === 'lint' && (
          <StyleLintPanel
            brandKitId={props.activeBrandKitId}
            elements={props.lintElements}
            onFix={props.onLintFix}
          />
        )}
      </div>

      {props.override && (
        <div className="theme-panel__override-note" data-testid="theme-panel-override-note">
          Overriding <code>{props.override.tokenId}</code> on this slide
          <button
            type="button"
            className="theme-panel__override-clear"
            onClick={() => props.onOverrideChange(null)}
          >
            Clear
          </button>
        </div>
      )}

      <BrandExtractDialog
        open={extractOpen}
        onClose={() => setExtractOpen(false)}
        onAccept={handleAcceptExtracted}
      />
    </section>
  );
}

const TAB_LABELS: Record<ThemePanelTab, string> = {
  kits: 'Brand kits',
  tokens: 'Tokens',
  'multi-brand': 'Multi-brand',
  marketplace: 'Marketplace',
  lint: 'Lint',
};
