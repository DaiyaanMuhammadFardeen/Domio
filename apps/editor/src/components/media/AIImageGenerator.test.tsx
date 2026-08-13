/**
 * AIImageGenerator — Wave 6 §S6.5 unit tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AIImageGenerator } from './AIImageGenerator';
import { LocaleProvider } from '../../lib/locale';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function renderGenerator(overrides?: { onInsert?: ReturnType<typeof vi.fn>; apiBaseUrl?: string }) {
  const onInsert = overrides?.onInsert ?? vi.fn();
  return {
    onInsert,
    ...render(
      <LocaleProvider locale="en">
        <AIImageGenerator onInsert={onInsert} {...(overrides?.apiBaseUrl ? { apiBaseUrl: overrides.apiBaseUrl } : {})} />
      </LocaleProvider>,
    ),
  };
}

describe('AIImageGenerator', () => {
  it('renders prompt + negative prompt + style picker', () => {
    renderGenerator();
    expect(screen.getByTestId('p6-ai-image-generator')).toBeInTheDocument();
    expect(screen.getByTestId('p6-ai-image-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('p6-ai-image-negative-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('p6-ai-image-style-photorealistic')).toBeInTheDocument();
    expect(screen.getByTestId('p6-ai-image-style-illustration')).toBeInTheDocument();
    expect(screen.getByTestId('p6-ai-image-style-minimal')).toBeInTheDocument();
    expect(screen.getByTestId('p6-ai-image-style-watercolor')).toBeInTheDocument();
  });

  it('disables Generate when prompt is empty', () => {
    renderGenerator();
    expect(screen.getByTestId('p6-ai-image-generate')).toBeDisabled();
  });

  it('enables Generate when prompt has text', () => {
    renderGenerator();
    fireEvent.change(screen.getByTestId('p6-ai-image-prompt'), { target: { value: 'A robot' } });
    expect(screen.getByTestId('p6-ai-image-generate')).not.toBeDisabled();
  });

  it('renders 4 candidates after clicking Generate (offline fallback)', async () => {
    renderGenerator();
    fireEvent.change(screen.getByTestId('p6-ai-image-prompt'), { target: { value: 'A robot on a beach' } });
    fireEvent.click(screen.getByTestId('p6-ai-image-generate'));

    await waitFor(() => {
      expect(screen.getByTestId('p6-ai-image-results')).toBeInTheDocument();
    });

    expect(screen.getByTestId('p6-ai-image-candidate-0')).toBeInTheDocument();
    expect(screen.getByTestId('p6-ai-image-candidate-1')).toBeInTheDocument();
    expect(screen.getByTestId('p6-ai-image-candidate-2')).toBeInTheDocument();
    expect(screen.getByTestId('p6-ai-image-candidate-3')).toBeInTheDocument();
  });

  it('calls onInsert when clicking a candidate', async () => {
    const onInsert = vi.fn();
    renderGenerator({ onInsert });
    fireEvent.change(screen.getByTestId('p6-ai-image-prompt'), { target: { value: 'A mountain' } });
    fireEvent.click(screen.getByTestId('p6-ai-image-generate'));

    await waitFor(() => {
      expect(screen.getByTestId('p6-ai-image-candidate-0')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('p6-ai-image-candidate-0').querySelector('button')!);
    expect(onInsert).toHaveBeenCalledWith('image', expect.objectContaining({ aiImageId: expect.any(String) }));
  });

  it('renders 4 candidates from a real fetch response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        prompt: 'hello',
        style: 'photorealistic',
        candidates: [
          { id: 'a', url: 'data:,', style: 'photorealistic', provenance: { model: 'm', seed: 1, generatedAtMs: 1 } },
          { id: 'b', url: 'data:,', style: 'photorealistic', provenance: { model: 'm', seed: 2, generatedAtMs: 2 } },
          { id: 'c', url: 'data:,', style: 'photorealistic', provenance: { model: 'm', seed: 3, generatedAtMs: 3 } },
          { id: 'd', url: 'data:,', style: 'photorealistic', provenance: { model: 'm', seed: 4, generatedAtMs: 4 } },
        ],
      }),
    }) as unknown as typeof fetch;

    renderGenerator();
    fireEvent.change(screen.getByTestId('p6-ai-image-prompt'), { target: { value: 'A robot' } });
    fireEvent.click(screen.getByTestId('p6-ai-image-generate'));

    await waitFor(() => {
      expect(screen.getByTestId('p6-ai-image-candidate-3')).toBeInTheDocument();
    });
    expect(screen.getByTestId('p6-ai-image-count')).toBeInTheDocument();
  });

  it('changing style updates selected style', () => {
    renderGenerator();
    fireEvent.click(screen.getByTestId('p6-ai-image-style-illustration'));
    expect(screen.getByTestId('p6-ai-image-style-illustration')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('p6-ai-image-style-photorealistic')).toHaveAttribute('aria-checked', 'false');
  });

  it('renders background removal buttons for each candidate', async () => {
    renderGenerator();
    fireEvent.change(screen.getByTestId('p6-ai-image-prompt'), { target: { value: 'A dog' } });
    fireEvent.click(screen.getByTestId('p6-ai-image-generate'));

    await waitFor(() => {
      expect(screen.getByTestId('p6-ai-image-candidate-0')).toBeInTheDocument();
    });

    expect(screen.getByTestId('p6-ai-image-candidate-0-remove-bg')).toBeInTheDocument();
    expect(screen.getByTestId('p6-ai-image-candidate-3-remove-bg')).toBeInTheDocument();
  });

  it('inserts a background-removed image when remove-bg is clicked', async () => {
    const onInsert = vi.fn();
    renderGenerator({ onInsert });
    fireEvent.change(screen.getByTestId('p6-ai-image-prompt'), { target: { value: 'A cat' } });
    fireEvent.click(screen.getByTestId('p6-ai-image-generate'));

    await waitFor(() => {
      expect(screen.getByTestId('p6-ai-image-candidate-0')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('p6-ai-image-candidate-0-remove-bg'));

    await waitFor(() => {
      expect(onInsert).toHaveBeenCalledWith('image', expect.objectContaining({ backgroundRemoved: true }));
    });
  });
});