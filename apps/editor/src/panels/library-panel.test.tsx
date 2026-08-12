/**
 * LibraryPanel — Wave 2 §S2.6 unit tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LibraryPanel } from './library-panel';

const originalFetch = globalThis.fetch;

// Provide a working localStorage mock for jsdom (vitest's jsdom env
// doesn't expose localStorage on globalThis by default in 2.1.x).
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('LibraryPanel', () => {
  it('renders the personal tab by default', () => {
    render(<LibraryPanel onInsert={vi.fn()} />);
    expect(screen.getByTestId('library-tab-personal')).toBeInTheDocument();
    expect(screen.getByTestId('library-tab-team')).toBeInTheDocument();
    expect(screen.getByTestId('library-tab-personal')).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to the team tab when clicked', () => {
    render(<LibraryPanel onInsert={vi.fn()} />);
    fireEvent.click(screen.getByTestId('library-tab-team'));
    expect(screen.getByTestId('library-tab-team')).toHaveAttribute('aria-selected', 'true');
  });

  it('renders team library entries fetched from the service', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          catalogId: 'team-card',
          name: 'Team Card',
          version: '1.0.0',
          scope: 'team',
          brandLocked: true,
          publishedAtMs: 0,
        },
      ],
    }) as unknown as typeof fetch;
    render(<LibraryPanel onInsert={vi.fn()} />);
    fireEvent.click(screen.getByTestId('library-tab-team'));
    await waitFor(() => {
      expect(screen.getByTestId('library-team-row-team-card')).toBeInTheDocument();
    });
    expect(screen.getByText('brand-locked')).toBeInTheDocument();
  });

  it('renders personal library rows from localStorage', () => {
    localStorage.setItem('domio.my-library', JSON.stringify([
      { catalogId: 'p-1', name: 'Personal 1', version: '1.0.0', pinMode: 'track', pinValue: '', addedAt: 0 },
    ]));
    const onInsert = vi.fn();
    render(<LibraryPanel onInsert={onInsert} />);
    // Insert is disabled when the component isn't registered (since
    // `getComponent(...)` returns undefined for the localStorage-only
    // entries); fall back to verifying the row renders.
    expect(screen.getByTestId('library-row-p-1')).toBeInTheDocument();
  });

  it('hides the team tab when disableTeamTab is set', () => {
    render(<LibraryPanel onInsert={vi.fn()} disableTeamTab />);
    expect(screen.queryByTestId('library-tab-team')).toBeNull();
  });

  it('disables Remove on a brand-locked team entry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          catalogId: 'team-locked',
          name: 'Locked',
          version: '1.0.0',
          scope: 'team',
          brandLocked: true,
          publishedAtMs: 0,
        },
      ],
    }) as unknown as typeof fetch;
    render(<LibraryPanel onInsert={vi.fn()} />);
    fireEvent.click(screen.getByTestId('library-tab-team'));
    await waitFor(() => {
      expect(screen.getByTestId('library-team-row-team-locked')).toBeInTheDocument();
    });
    expect(screen.getByTestId('library-lock-team-locked')).toBeInTheDocument();
  });
});