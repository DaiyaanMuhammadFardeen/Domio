import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeckDiffPanel } from './deck-diff-panel.js';

describe('DeckDiffPanel', () => {
  it('renders two inputs and a Compare button', () => {
    render(
      <DeckDiffPanel onCompare={vi.fn(async () => ({ added: [], removed: [], changed: [] }))} />,
    );
    expect(screen.getByTestId('m8-diff-input-a')).toBeInTheDocument();
    expect(screen.getByTestId('m8-diff-input-b')).toBeInTheDocument();
    expect(screen.getByTestId('m8-diff-compare')).toBeInTheDocument();
  });

  it('disables Compare when one input is empty', () => {
    render(
      <DeckDiffPanel onCompare={vi.fn(async () => ({ added: [], removed: [], changed: [] }))} />,
    );
    fireEvent.change(screen.getByTestId('m8-diff-input-a'), {
      target: { value: 'a' },
    });
    expect(screen.getByTestId('m8-diff-compare')).toBeDisabled();
  });

  it('runs onCompare when Compare is clicked', async () => {
    const onCompare = vi.fn(async () => ({
      added: [{ kind: 'hotspot', id: 'hs1' }],
      removed: [],
      changed: [],
    }));
    render(<DeckDiffPanel onCompare={onCompare} />);
    fireEvent.change(screen.getByTestId('m8-diff-input-a'), {
      target: { value: 'a' },
    });
    fireEvent.change(screen.getByTestId('m8-diff-input-b'), {
      target: { value: 'b' },
    });
    fireEvent.click(screen.getByTestId('m8-diff-compare'));
    await waitFor(() => expect(onCompare).toHaveBeenCalledWith('a', 'b'));
    expect(screen.getByTestId('m8-diff-added-row').textContent).toContain('hotspot: hs1');
  });

  it('shows an error when onCompare rejects', async () => {
    const onCompare = vi.fn(async () => {
      throw new Error('down');
    });
    render(<DeckDiffPanel onCompare={onCompare} />);
    fireEvent.change(screen.getByTestId('m8-diff-input-a'), {
      target: { value: 'a' },
    });
    fireEvent.change(screen.getByTestId('m8-diff-input-b'), {
      target: { value: 'b' },
    });
    fireEvent.click(screen.getByTestId('m8-diff-compare'));
    await waitFor(() => expect(screen.getByTestId('m8-diff-error')).toBeInTheDocument());
  });

  it('renders added, removed, changed lists', async () => {
    const onCompare = vi.fn(async () => ({
      added: [{ kind: 'rule', id: 'r1' }],
      removed: [{ kind: 'variable', id: 'v1' }],
      changed: [{ kind: 'overlay', id: 'o1' }],
    }));
    render(<DeckDiffPanel onCompare={onCompare} />);
    fireEvent.change(screen.getByTestId('m8-diff-input-a'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('m8-diff-input-b'), { target: { value: 'b' } });
    fireEvent.click(screen.getByTestId('m8-diff-compare'));
    await waitFor(() => screen.getByTestId('m8-diff-added-row'));
    expect(screen.getByTestId('m8-diff-added-row').textContent).toContain('rule: r1');
    expect(screen.getByTestId('m8-diff-removed-row').textContent).toContain('variable: v1');
    expect(screen.getByTestId('m8-diff-changed-row').textContent).toContain('overlay: o1');
  });
});
