import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Checkpoints } from './checkpoints.js';
import { InMemoryBranchClient } from '../branch/types.js';

const DECK = 'd1';

describe('Checkpoints', () => {
  it('renders existing checkpoints', async () => {
    const client = new InMemoryBranchClient(DECK);
    await client.createCheckpoint(DECK, 'v1.0', 'main');
    render(<Checkpoints deckId={DECK} client={client} branchId="main" />);
    await waitFor(() => expect(screen.getByText('v1.0')).toBeInTheDocument());
  });

  it('creates a checkpoint via the form', async () => {
    const client = new InMemoryBranchClient(DECK);
    render(<Checkpoints deckId={DECK} client={client} />);
    fireEvent.change(screen.getByLabelText('Checkpoint name'), { target: { value: 'release' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('release')).toBeInTheDocument());
  });
});