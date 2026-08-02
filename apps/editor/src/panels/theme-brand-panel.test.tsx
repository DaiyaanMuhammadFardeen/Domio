/**
 * ThemeBrandPanel tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { asULID } from '@domio/schema';
import { ThemeBrandPanel, type ThemeOption, type BrandKitOption } from './theme-brand-panel.js';
import type { A11yAuditFinding } from '../lib/theme-audit.js';

const THEMES: readonly ThemeOption[] = [
  { id: 'theme-light', name: 'Light', scheme: 'light' },
  { id: 'theme-dark', name: 'Dark', scheme: 'dark' },
];

const KITS: readonly BrandKitOption[] = [
  { id: 'brand-acme', name: 'Acme', primaryHex: '#33180c', accentHex: '#aa3a14' },
  { id: 'brand-domio', name: 'Domio', primaryHex: '#0a0e14', accentHex: '#58a6ff' },
];

const SLIDE_ID = asULID('01H00000000000000000000000');

const FINDINGS: readonly A11yAuditFinding[] = [
  {
    severity: 'BLOCK',
    tokenId: 'color.content.body',
    issue: 'WCAG 2.1:1 against color.bg.surface',
    suggestion: 'color.content.primary',
  },
];

describe('ThemeBrandPanel', () => {
  it('renders the theme picker, brand kit list, and a11y audit section', () => {
    render(
      <ThemeBrandPanel
        themes={THEMES}
        activeThemeId="theme-light"
        onThemeChange={vi.fn()}
        brandKits={KITS}
        activeBrandKitId="brand-acme"
        onBrandKitChange={vi.fn()}
        colorScheme="light"
        onSchemeToggle={vi.fn()}
        override={null}
        onOverrideChange={vi.fn()}
        a11yFindings={[]}
        onAudit={vi.fn()}
        isAuditing={false}
        slideId={SLIDE_ID}
      />,
    );
    expect(screen.getByTestId('theme-section')).toBeInTheDocument();
    expect(screen.getByTestId('brand-section')).toBeInTheDocument();
    expect(screen.getByTestId('override-section')).toBeInTheDocument();
    expect(screen.getByTestId('audit-section')).toBeInTheDocument();
  });

  it('emits a theme change when the dropdown selection changes', () => {
    const onChange = vi.fn();
    render(
      <ThemeBrandPanel
        themes={THEMES}
        activeThemeId="theme-light"
        onThemeChange={onChange}
        brandKits={KITS}
        activeBrandKitId="brand-acme"
        onBrandKitChange={vi.fn()}
        colorScheme="light"
        onSchemeToggle={vi.fn()}
        override={null}
        onOverrideChange={vi.fn()}
        a11yFindings={[]}
        onAudit={vi.fn()}
        isAuditing={false}
        slideId={SLIDE_ID}
      />,
    );
    fireEvent.change(screen.getByLabelText('Active theme'), { target: { value: 'theme-dark' } });
    expect(onChange).toHaveBeenCalledWith('theme-dark');
  });

  it('marks the active brand kit and emits a change on click', () => {
    const onChange = vi.fn();
    render(
      <ThemeBrandPanel
        themes={THEMES}
        activeThemeId="theme-light"
        onThemeChange={vi.fn()}
        brandKits={KITS}
        activeBrandKitId="brand-acme"
        onBrandKitChange={onChange}
        colorScheme="light"
        onSchemeToggle={vi.fn()}
        override={null}
        onOverrideChange={vi.fn()}
        a11yFindings={[]}
        onAudit={vi.fn()}
        isAuditing={false}
        slideId={SLIDE_ID}
      />,
    );
    const active = screen.getByTestId('brand-kit-brand-acme');
    expect(active.className).toContain('is-active');
    fireEvent.click(screen.getByTestId('brand-kit-brand-domio'));
    expect(onChange).toHaveBeenCalledWith('brand-domio');
  });

  it('toggles the color scheme radio group', () => {
    const onToggle = vi.fn();
    render(
      <ThemeBrandPanel
        themes={THEMES}
        activeThemeId="theme-light"
        onThemeChange={vi.fn()}
        brandKits={KITS}
        activeBrandKitId="brand-acme"
        onBrandKitChange={vi.fn()}
        colorScheme="light"
        onSchemeToggle={onToggle}
        override={null}
        onOverrideChange={vi.fn()}
        a11yFindings={[]}
        onAudit={vi.fn()}
        isAuditing={false}
        slideId={SLIDE_ID}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Color scheme' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Dark' }));
    expect(onToggle).toHaveBeenCalledWith('dark');
  });

  it('applies a per-slide override', () => {
    const onOverrideChange = vi.fn();
    render(
      <ThemeBrandPanel
        themes={THEMES}
        activeThemeId="theme-light"
        onThemeChange={vi.fn()}
        brandKits={KITS}
        activeBrandKitId="brand-acme"
        onBrandKitChange={vi.fn()}
        colorScheme="light"
        onSchemeToggle={vi.fn()}
        override={null}
        onOverrideChange={onOverrideChange}
        a11yFindings={[]}
        onAudit={vi.fn()}
        isAuditing={false}
        slideId={SLIDE_ID}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onOverrideChange).toHaveBeenCalledWith({
      tokenId: 'color.brand.primary',
      hex: '#ffffff',
    });
  });

  it('clears the override when Clear is pressed', () => {
    const onOverrideChange = vi.fn();
    render(
      <ThemeBrandPanel
        themes={THEMES}
        activeThemeId="theme-light"
        onThemeChange={vi.fn()}
        brandKits={KITS}
        activeBrandKitId="brand-acme"
        onBrandKitChange={vi.fn()}
        colorScheme="light"
        onSchemeToggle={vi.fn()}
        override={{ tokenId: 'color.brand.primary', hex: '#aa3a14' }}
        onOverrideChange={onOverrideChange}
        a11yFindings={[]}
        onAudit={vi.fn()}
        isAuditing={false}
        slideId={SLIDE_ID}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onOverrideChange).toHaveBeenCalledWith(null);
  });

  it('runs the a11y audit and surfaces findings', () => {
    const onAudit = vi.fn();
    render(
      <ThemeBrandPanel
        themes={THEMES}
        activeThemeId="theme-light"
        onThemeChange={vi.fn()}
        brandKits={KITS}
        activeBrandKitId="brand-acme"
        onBrandKitChange={vi.fn()}
        colorScheme="light"
        onSchemeToggle={vi.fn()}
        override={null}
        onOverrideChange={vi.fn()}
        a11yFindings={FINDINGS}
        onAudit={onAudit}
        isAuditing={false}
        slideId={SLIDE_ID}
      />,
    );
    const list = screen.getByTestId('audit-findings');
    expect(within(list).getByText('BLOCK')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('audit-button'));
    expect(onAudit).toHaveBeenCalled();
  });
});
