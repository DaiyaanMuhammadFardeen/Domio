/**
 * DarkModeGenerator — Wave 2 §S2.5 unit tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DarkModeGenerator } from './DarkModeGenerator';
import type { ThemeDetail } from '../../lib/brand-service';

const LIGHT: ThemeDetail = {
  id: 'theme-light',
  name: 'Light',
  scheme: 'light',
  isDark: false,
  tokens: {
    'color.bg': '#ffffff',
    'color.fg': '#000000',
    'color.accent': '#58a6ff',
    'color.border': '#d0d7de',
  },
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('DarkModeGenerator', () => {
  it('renders the current scheme label', () => {
    render(
      <DarkModeGenerator
        activeTheme={LIGHT}
        colorScheme="light"
        onSchemeToggle={vi.fn()}
        onGenerated={vi.fn()}
      />,
    );
    expect(screen.getByTestId('dark-mode-toggle')).toHaveTextContent('Light');
  });

  it('toggles to dark when clicked and calls onGenerated', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const onSchemeToggle = vi.fn();
    const onGenerated = vi.fn();
    render(
      <DarkModeGenerator
        activeTheme={LIGHT}
        colorScheme="light"
        onSchemeToggle={onSchemeToggle}
        onGenerated={onGenerated}
      />,
    );
    fireEvent.click(screen.getByTestId('dark-mode-toggle'));
    expect(onSchemeToggle).toHaveBeenCalledWith('dark');
    await waitFor(() => {
      expect(onGenerated).toHaveBeenCalled();
    });
    const theme = onGenerated.mock.calls[0]?.[0] as ThemeDetail;
    expect(theme.isDark).toBe(true);
    expect(theme.tokens['color.bg']).toBe('#0a0e14');
  });

  it('switches the label to Dark when the scheme is dark', () => {
    render(
      <DarkModeGenerator
        activeTheme={LIGHT}
        colorScheme="dark"
        onSchemeToggle={vi.fn()}
        onGenerated={vi.fn()}
      />,
    );
    expect(screen.getByTestId('dark-mode-toggle')).toHaveTextContent('Dark');
  });

  it('renders the preview tile with theme tokens', () => {
    render(
      <DarkModeGenerator
        activeTheme={LIGHT}
        colorScheme="light"
        onSchemeToggle={vi.fn()}
        onGenerated={vi.fn()}
      />,
    );
    const preview = screen.getByTestId('dark-mode-preview');
    expect(preview).toBeInTheDocument();
  });
});
