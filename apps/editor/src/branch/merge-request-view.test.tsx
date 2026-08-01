import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MergeRequestView } from './merge-request-view.js';
import type { BranchClient, MergeRequestSummary } from './types.js';

const DECK = 'd1';

function makeRequest(overrides: Partial<MergeRequestSummary> = {}): MergeRequestSummary {
  return {
    id: 'mr1',
    deckId: DECK,
    sourceBranchId: 'feature/x',
    targetBranchId: 'main',
    status: 'open',
    sourceRevision: 2,
    targetRevision: 1,
    baseRevision: 0,
    diffSummary: {
      slides: { added: [], removed: [], modified: [{ slideId: 's1' }] },
      elements: [],
      conflicts: [{ slideId: 's1', elementId: 'e1', path: '/text', sourceValue: 'A', targetValue: 'B', baseValue: '' }],
    },
    resolutionStrategy: null,
    resolvedBy: null,
    resolvedAt: null,
    createdBy: 'u',
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function makeClient(): BranchClient {
  const resolve = vi.fn().mockResolvedValue(makeRequest({ status: 'resolved', resolutionStrategy: 'manual' }));
  const commit = vi.fn().mockResolvedValue({ mergeRequest: makeRequest({ status: 'merged' }), newRevision: 9 });
  return {
    listBranches: vi.fn(), createBranch: vi.fn(), archiveBranch: vi.fn(), checkout: vi.fn(), getLineage: vi.fn(),
    listMergeRequests: vi.fn(), createMergeRequest: vi.fn(), resolveMergeRequest: resolve, commitMergeRequest: commit,
    listCheckpoints: vi.fn(), createCheckpoint: vi.fn(), renameCheckpoint: vi.fn(), restoreCheckpoint: vi.fn(),
  } as unknown as BranchClient;
}

describe('MergeRequestView', () => {
  it('renders source and target information', () => {
    render(<MergeRequestView deckId={DECK} client={makeClient()} request={makeRequest()} />);
    expect(screen.getByText(/Merge feature\/x → main/)).toBeInTheDocument();
    expect(screen.getByText(/1 conflicts/)).toBeInTheDocument();
  });

  it('invokes resolveMergeRequest when Resolve is clicked', async () => {
    const client = makeClient();
    render(<MergeRequestView deckId={DECK} client={client} request={makeRequest()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(client.resolveMergeRequest).toHaveBeenCalled());
  });

  it('invokes commitMergeRequest when Merge is clicked', async () => {
    const client = makeClient();
    const onMerged = vi.fn();
    render(<MergeRequestView deckId={DECK} client={client} request={makeRequest({ status: 'resolved' })} onMerged={onMerged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(onMerged).toHaveBeenCalledWith(9));
  });
});