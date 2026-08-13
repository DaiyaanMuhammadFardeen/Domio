import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BranchPanel } from './branch-panel.js';
import { InMemoryBranchClient } from './types.js';

const DECK = 'd1';

describe('BranchPanel', () => {
  it('lists existing branches', async () => {
    const client = new InMemoryBranchClient(DECK);
    await client.createBranch(DECK, 'feature/ui');
    render(<BranchPanel deckId={DECK} client={client} activeBranchId="main" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /feature\/ui\s+r0/ })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /main/ })).toBeInTheDocument();
  });

  it('creates a branch when the form is submitted', async () => {
    const client = new InMemoryBranchClient(DECK);
    const onCreated = vi.fn();
    render(<BranchPanel deckId={DECK} client={client} onCreateBranch={onCreated} />);
    await waitFor(() => expect(screen.queryByText(/Loading branches/)).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('New branch'), { target: { value: 'feature/new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated.mock.calls[0]![0]!.name).toBe('feature/new');
  });

  it('shows errors when loading fails', async () => {
    const client = new InMemoryBranchClient(DECK);
    const failing = {
      ...client,
      listBranches: vi.fn().mockRejectedValue(new Error('offline')),
    } as unknown as InMemoryBranchClient;
    render(<BranchPanel deckId={DECK} client={failing} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('offline'));
  });
});
