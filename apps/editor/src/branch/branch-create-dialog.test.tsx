import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BranchCreateDialog } from './branch-create-dialog.js';
import { InMemoryBranchClient } from './types.js';

const DECK = 'd1';

describe('BranchCreateDialog', () => {
  it('does not render when closed', () => {
    const client = new InMemoryBranchClient(DECK);
    const { container } = render(<BranchCreateDialog deckId={DECK} client={client} open={false} onClose={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('creates a branch with valid name', async () => {
    const client = new InMemoryBranchClient(DECK);
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<BranchCreateDialog deckId={DECK} client={client} open={true} onClose={onClose} onCreated={onCreated} baseCheckpoints={[{ id: 'cp1', name: 'v1' }]} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'feature/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('rejects names with invalid characters', async () => {
    const client = new InMemoryBranchClient(DECK);
    render(<BranchCreateDialog deckId={DECK} client={client} open={true} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'bad!name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/letters, numbers/);
  });
});