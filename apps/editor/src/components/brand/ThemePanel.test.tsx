/**
 * ThemePanel — Wave 2 §S2.5 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemePanel, type ThemePanelProps } from './ThemePanel';
import type { BrandKitDetail, LintIssue, ThemeDetail } from '../../lib/brand-service';
import type { A11yAuditFinding } from '../../lib/theme-audit';

const KIT: BrandKitDetail = {
  id: 'brand-acme',
  name: 'Acme',
  primaryHex: '#33180c',
  accentHex: '#aa3a14',
  colors: [
    {
      id: 'color.brand.primary',
      label: 'Primary',
      stops: [{ id: '500', label: '500', value: '#33180c' }],
    },
  ],
  typography: [
    {
      id: 'type.heading',
      label: 'Heading',
      fontFamily: 'Inter',
      fontSizePx: 32,
      lineHeight: 1.2,
      fontWeight: 700,
      letterSpacingEm: -0.01,
    },
    {
      id: 'type.body',
      label: 'Body',
      fontFamily: 'Inter',
      fontSizePx: 16,
      lineHeight: 1.5,
      fontWeight: 400,
      letterSpacingEm: 0,
    },
  ],
  spacing: [
    {
      id: 'space',
      label: 'Spacing',
      stops: [
        { id: '1', label: '1×', value: '4px' },
        { id: '4', label: '4×', value: '16px' },
      ],
    },
  ],
  radius: [{ id: 'radius', label: 'Radius', stops: [{ id: 'md', label: 'MD', value: '8px' }] }],
  shadows: [
    {
      id: 'shadow',
      label: 'Shadow',
      stops: [{ id: 'md', label: 'MD', value: '0 4px 8px rgba(0,0,0,0.15)' }],
    },
  ],
};

const THEMES: ThemePanelProps['themes'] = [
  { id: 'theme-acme-light', name: 'Acme Light', scheme: 'light' as const },
];

const KITS: ThemePanelProps['brandKits'] = [
  { id: 'brand-acme', name: 'Acme', primaryHex: '#33180c', accentHex: '#aa3a14' },
];

function baseProps(overrides: Partial<ThemePanelProps> = {}): ThemePanelProps {
  return {
    themes: THEMES,
    activeThemeId: 'theme-acme-light',
    onThemeChange: vi.fn(),
    brandKits: KITS,
    activeBrandKitId: 'brand-acme',
    onBrandKitChange: vi.fn(),
    colorScheme: 'light',
    onSchemeToggle: vi.fn(),
    override: null,
    onOverrideChange: vi.fn(),
    activeKitDetail: KIT,
    onKitDetailChange: vi.fn(),
    slideKitId: null,
    onSlideKitChange: vi.fn(),
    lintElements: [],
    onLintFix: vi.fn(),
    onMarketplaceInstall: vi.fn(),
    onDarkGenerated: vi.fn(),
    ...overrides,
  };
}

describe('ThemePanel', () => {
  it('renders all five tabs', () => {
    render(<ThemePanel {...baseProps()} />);
    expect(screen.getByTestId('theme-panel-tab-kits')).toBeInTheDocument();
    expect(screen.getByTestId('theme-panel-tab-tokens')).toBeInTheDocument();
    expect(screen.getByTestId('theme-panel-tab-multi-brand')).toBeInTheDocument();
    expect(screen.getByTestId('theme-panel-tab-marketplace')).toBeInTheDocument();
    expect(screen.getByTestId('theme-panel-tab-lint')).toBeInTheDocument();
  });

  it('starts on the Brand kits tab', () => {
    render(<ThemePanel {...baseProps()} />);
    expect(screen.getByTestId('theme-panel-body-kits')).toBeInTheDocument();
  });

  it('switches to the Tokens tab', () => {
    render(<ThemePanel {...baseProps()} />);
    fireEvent.click(screen.getByTestId('theme-panel-tab-tokens'));
    expect(screen.getByTestId('token-editor')).toBeInTheDocument();
  });

  it('switches to the Multi-brand tab', () => {
    render(<ThemePanel {...baseProps()} />);
    fireEvent.click(screen.getByTestId('theme-panel-tab-multi-brand'));
    expect(screen.getByTestId('multi-brand-switcher')).toBeInTheDocument();
  });

  it('switches to the Marketplace tab', () => {
    render(<ThemePanel {...baseProps()} />);
    fireEvent.click(screen.getByTestId('theme-panel-tab-marketplace'));
    expect(screen.getByTestId('theme-marketplace')).toBeInTheDocument();
  });

  it('switches to the Lint tab', () => {
    render(<ThemePanel {...baseProps()} />);
    fireEvent.click(screen.getByTestId('theme-panel-tab-lint'));
    expect(screen.getByTestId('style-lint')).toBeInTheDocument();
  });

  it('opens the BrandExtractDialog when Extract is clicked', () => {
    render(<ThemePanel {...baseProps()} />);
    fireEvent.click(screen.getByTestId('theme-panel-extract-btn'));
    expect(screen.getByTestId('brand-extract-dialog')).toBeInTheDocument();
  });

  it('forwards theme selection', () => {
    const onThemeChange = vi.fn();
    render(
      <ThemePanel
        {...baseProps({
          themes: [
            { id: 'theme-a', name: 'A', scheme: 'light' },
            { id: 'theme-b', name: 'B', scheme: 'dark' },
          ],
          onThemeChange,
        })}
      />,
    );
    fireEvent.change(screen.getByTestId('theme-panel-theme-select'), {
      target: { value: 'theme-b' },
    });
    expect(onThemeChange).toHaveBeenCalledWith('theme-b');
  });

  it('shows the override note when an override exists', () => {
    render(
      <ThemePanel {...baseProps({ override: { tokenId: 'color.brand.primary', hex: '#f00' } })} />,
    );
    expect(screen.getByTestId('theme-panel-override-note')).toBeInTheDocument();
  });
});

// Suppress unused import warnings (these types are used implicitly by the runtime but tree-shaken in tests).
void ({} as A11yAuditFinding);
void ({} as LintIssue);
void ({} as ThemeDetail);
