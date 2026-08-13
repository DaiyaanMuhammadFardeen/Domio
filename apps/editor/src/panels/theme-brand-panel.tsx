/**
 * ThemeBrandPanel — left-side panel for theme + brand kit selection,
 * dark/light mode toggle, per-slide palette override, and an
 * accessibility audit affordance (Phase 07 #38, #39, #44, #47).
 */

'use client';

import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { ULID } from '@domio/schema/generated/scene-graph';
import type { A11yAuditFinding } from '../lib/theme-audit';
import { cn } from '../lib/cn';

export type ColorScheme = 'light' | 'dark';

export interface ThemeOption {
  readonly id: string;
  readonly name: string;
  readonly scheme: ColorScheme;
}

export interface BrandKitOption {
  readonly id: string;
  readonly name: string;
  readonly primaryHex: string;
  readonly accentHex: string;
}

export interface PaletteOverride {
  readonly tokenId: string;
  readonly hex: string;
}

export interface ThemeBrandPanelProps {
  readonly themes: readonly ThemeOption[];
  readonly activeThemeId: string;
  readonly onThemeChange: (themeId: string) => void;
  readonly brandKits: readonly BrandKitOption[];
  readonly activeBrandKitId: string;
  readonly onBrandKitChange: (brandKitId: string) => void;
  readonly colorScheme: ColorScheme;
  readonly onSchemeToggle: (next: ColorScheme) => void;
  readonly override: PaletteOverride | null;
  readonly onOverrideChange: (next: PaletteOverride | null) => void;
  readonly a11yFindings: readonly A11yAuditFinding[];
  readonly onAudit: () => void;
  readonly isAuditing: boolean;
  readonly slideId: ULID;
}

export function ThemeBrandPanel(props: ThemeBrandPanelProps): ReactElement {
  const {
    themes,
    activeThemeId,
    onThemeChange,
    brandKits,
    activeBrandKitId,
    onBrandKitChange,
    colorScheme,
    onSchemeToggle,
    override,
    onOverrideChange,
    a11yFindings,
    onAudit,
    isAuditing,
    slideId,
  } = props;
  const [paletteDraft, setPaletteDraft] = useState<string>(override?.hex ?? '#ffffff');

  const blockCount = useMemo(
    () => a11yFindings.filter((f) => f.severity === 'BLOCK').length,
    [a11yFindings],
  );

  const activeTheme = themes.find((t) => t.id === activeThemeId);
  const activeKit = brandKits.find((b) => b.id === activeBrandKitId);

  return (
    <section className="theme-brand-panel" data-testid="theme-brand-panel">
      <header className="theme-brand-panel__header">
        <h2 className="theme-brand-panel__title">Theme &amp; brand</h2>
        <p className="theme-brand-panel__sub">
          Slide {slideId.slice(-6)} · {activeTheme?.name ?? 'unset'}
        </p>
      </header>

      <ThemeSection themes={themes} activeThemeId={activeThemeId} onThemeChange={onThemeChange} />

      <SchemeToggle colorScheme={colorScheme} onSchemeToggle={onSchemeToggle} />

      <BrandSection
        brandKits={brandKits}
        activeBrandKitId={activeBrandKitId}
        onBrandKitChange={onBrandKitChange}
      />

      <OverrideSection
        draft={paletteDraft}
        setDraft={setPaletteDraft}
        override={override}
        onOverrideChange={onOverrideChange}
        accentHex={activeKit?.accentHex ?? '#58a6ff'}
        primaryHex={activeKit?.primaryHex ?? '#33180c'}
      />

      <AuditSection
        blockCount={blockCount}
        isAuditing={isAuditing}
        onAudit={onAudit}
        findings={a11yFindings}
      />
    </section>
  );
}

function ThemeSection({
  themes,
  activeThemeId,
  onThemeChange,
}: {
  themes: readonly ThemeOption[];
  activeThemeId: string;
  onThemeChange: (themeId: string) => void;
}): ReactElement {
  return (
    <fieldset className="theme-brand-panel__field" data-testid="theme-section">
      <legend className="theme-brand-panel__legend">Theme</legend>
      <select
        className="theme-brand-panel__select"
        aria-label="Active theme"
        value={activeThemeId}
        onChange={(e) => onThemeChange(e.target.value)}
      >
        {themes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </fieldset>
  );
}

function SchemeToggle({
  colorScheme,
  onSchemeToggle,
}: {
  colorScheme: ColorScheme;
  onSchemeToggle: (next: ColorScheme) => void;
}): ReactElement {
  return (
    <fieldset className="theme-brand-panel__field" data-testid="scheme-toggle">
      <legend className="theme-brand-panel__legend">Color scheme</legend>
      <div className="theme-brand-panel__scheme" role="radiogroup" aria-label="Color scheme">
        <button
          type="button"
          role="radio"
          aria-checked={colorScheme === 'light'}
          className={cn('theme-brand-panel__scheme-btn', colorScheme === 'light' && 'is-active')}
          onClick={() => onSchemeToggle('light')}
        >
          Light
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={colorScheme === 'dark'}
          className={cn('theme-brand-panel__scheme-btn', colorScheme === 'dark' && 'is-active')}
          onClick={() => onSchemeToggle('dark')}
        >
          Dark
        </button>
      </div>
    </fieldset>
  );
}

function BrandSection({
  brandKits,
  activeBrandKitId,
  onBrandKitChange,
}: {
  brandKits: readonly BrandKitOption[];
  activeBrandKitId: string;
  onBrandKitChange: (brandKitId: string) => void;
}): ReactElement {
  return (
    <fieldset className="theme-brand-panel__field" data-testid="brand-section">
      <legend className="theme-brand-panel__legend">Brand kit</legend>
      <div className="theme-brand-panel__kits" role="radiogroup" aria-label="Brand kit">
        {brandKits.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={b.id === activeBrandKitId}
            className={cn('theme-brand-panel__kit', b.id === activeBrandKitId && 'is-active')}
            onClick={() => onBrandKitChange(b.id)}
            data-testid={`brand-kit-${b.id}`}
          >
            <span
              className="theme-brand-panel__kit-swatch"
              style={{ background: b.primaryHex }}
              aria-hidden
            />
            <span
              className="theme-brand-panel__kit-swatch theme-brand-panel__kit-swatch--accent"
              style={{ background: b.accentHex }}
              aria-hidden
            />
            <span className="theme-brand-panel__kit-name">{b.name}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function OverrideSection({
  draft,
  setDraft,
  override,
  onOverrideChange,
  primaryHex,
  accentHex,
}: {
  draft: string;
  setDraft: (next: string) => void;
  override: PaletteOverride | null;
  onOverrideChange: (next: PaletteOverride | null) => void;
  primaryHex: string;
  accentHex: string;
}): ReactElement {
  return (
    <fieldset className="theme-brand-panel__field" data-testid="override-section">
      <legend className="theme-brand-panel__legend">Per-slide override</legend>
      <p className="theme-brand-panel__hint">
        {override
          ? `Override on ${override.tokenId}`
          : 'Inherits deck theme → brand context → org default'}
      </p>
      <div className="theme-brand-panel__override">
        <input
          type="color"
          aria-label="Override color"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="theme-brand-panel__color"
        />
        <input
          type="text"
          aria-label="Override hex"
          className="theme-brand-panel__hex"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          className="theme-brand-panel__apply"
          onClick={() =>
            onOverrideChange({
              tokenId: 'color.brand.primary',
              hex: draft,
            })
          }
        >
          Apply
        </button>
        <button
          type="button"
          className="theme-brand-panel__clear"
          onClick={() => onOverrideChange(null)}
        >
          Clear
        </button>
      </div>
      <div className="theme-brand-panel__quick" aria-label="Quick brand swatches">
        <button
          type="button"
          className="theme-brand-panel__swatch"
          style={{ background: primaryHex }}
          aria-label={`Brand primary ${primaryHex}`}
          onClick={() => setDraft(primaryHex)}
        />
        <button
          type="button"
          className="theme-brand-panel__swatch"
          style={{ background: accentHex }}
          aria-label={`Brand accent ${accentHex}`}
          onClick={() => setDraft(accentHex)}
        />
      </div>
    </fieldset>
  );
}

function AuditSection({
  blockCount,
  isAuditing,
  onAudit,
  findings,
}: {
  blockCount: number;
  isAuditing: boolean;
  onAudit: () => void;
  findings: readonly A11yAuditFinding[];
}): ReactElement {
  return (
    <section className="theme-brand-panel__audit" data-testid="audit-section">
      <header className="theme-brand-panel__audit-head">
        <h3 className="theme-brand-panel__audit-title">Accessibility</h3>
        <span className={cn('theme-brand-panel__audit-badge', blockCount > 0 && 'is-block')}>
          {blockCount} BLOCK
        </span>
      </header>
      <button
        type="button"
        className="theme-brand-panel__audit-btn"
        onClick={onAudit}
        disabled={isAuditing}
        data-testid="audit-button"
      >
        {isAuditing ? 'Auditing…' : 'Run a11y audit'}
      </button>
      <ul className="theme-brand-panel__audit-list" data-testid="audit-findings">
        {findings.length === 0 ? (
          <li className="theme-brand-panel__audit-empty">
            Run the audit to see WCAG + CVD findings.
          </li>
        ) : (
          findings.slice(0, 6).map((f) => (
            <li
              key={`${f.tokenId}-${f.issue}`}
              className={cn(
                'theme-brand-panel__audit-row',
                f.severity === 'BLOCK' && 'is-block',
                f.severity === 'WARN' && 'is-warn',
              )}
            >
              <span className="theme-brand-panel__audit-sev">{f.severity}</span>
              <span className="theme-brand-panel__audit-token">{f.tokenId}</span>
              <span className="theme-brand-panel__audit-issue">{f.issue}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
