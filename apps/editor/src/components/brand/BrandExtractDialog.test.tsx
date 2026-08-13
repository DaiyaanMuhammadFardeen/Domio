/**
 * BrandExtractDialog — Wave 2 §S2.5 unit tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrandExtractDialog } from './BrandExtractDialog';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('BrandExtractDialog', () => {
  it('does not render when closed', () => {
    render(<BrandExtractDialog open={false} onClose={vi.fn()} onAccept={vi.fn()} />);
    expect(screen.queryByTestId('brand-extract-dialog')).toBeNull();
  });

  it('renders when open', () => {
    render(<BrandExtractDialog open onClose={vi.fn()} onAccept={vi.fn()} />);
    expect(screen.getByTestId('brand-extract-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('brand-extract-url')).toBeInTheDocument();
  });

  it('extracts a brand kit from a URL when Extract is clicked', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const onAccept = vi.fn();
    render(<BrandExtractDialog open onClose={vi.fn()} onAccept={onAccept} />);
    const input = screen.getByTestId('brand-extract-url');
    fireEvent.change(input, { target: { value: 'https://example.com' } });
    fireEvent.click(screen.getByTestId('brand-extract-go'));
    await waitFor(() => {
      expect(screen.getByTestId('brand-extract-result')).toBeInTheDocument();
    });
    expect(screen.getByTestId('brand-extract-name')).toBeInTheDocument();
  });

  it('accepts an extracted kit and emits onAccept with a built kit', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const onAccept = vi.fn();
    const onClose = vi.fn();
    render(<BrandExtractDialog open onClose={onClose} onAccept={onAccept} />);
    fireEvent.change(screen.getByTestId('brand-extract-url'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByTestId('brand-extract-go'));
    await waitFor(() => {
      expect(screen.getByTestId('brand-extract-result')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('brand-extract-accept'));
    expect(onAccept).toHaveBeenCalled();
    const kit = onAccept.mock.calls[0]?.[0] as {
      id: string;
      primaryHex: string;
      typography: unknown[];
    };
    expect(kit.id).toContain('brand-extracted-');
    expect(kit.primaryHex).toMatch(/^#[0-9a-f]{6}$/);
    expect(kit.typography.length).toBeGreaterThan(0);
  });

  it('closes the dialog backdrop on click', () => {
    const onClose = vi.fn();
    render(<BrandExtractDialog open onClose={onClose} onAccept={vi.fn()} />);
    fireEvent.click(document.querySelector('.brand-extract-dialog__backdrop') as Element);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<BrandExtractDialog open onClose={onClose} onAccept={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
