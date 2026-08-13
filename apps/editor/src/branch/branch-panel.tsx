'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { BranchClient, BranchSummary } from './types.js';

export interface BranchPanelProps {
  deckId: string;
  client: BranchClient;
  activeBranchId?: string;
  hasUnsyncedOps?: boolean;
  onCheckout?: (branch: BranchSummary) => void;
  onCreateBranch?: (branch: BranchSummary) => void;
}

export function BranchPanel({
  deckId,
  client,
  activeBranchId,
  hasUnsyncedOps = false,
  onCheckout,
  onCreateBranch,
}: BranchPanelProps): ReactElement {
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBranches(await client.listBranches(deckId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load branches.');
    } finally {
      setLoading(false);
    }
  }, [client, deckId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createBranch(): Promise<void> {
    const name = newName.trim();
    if (!name) return;
    try {
      const branch = await client.createBranch(deckId, name);
      setBranches((current) => [...current, branch]);
      setNewName('');
      onCreateBranch?.(branch);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create branch.');
    }
  }

  async function checkout(branch: BranchSummary): Promise<void> {
    if (branch.id === activeBranchId) return;
    if (hasUnsyncedOps && !window.confirm('You have unsynced changes. Switch branches anyway?'))
      return;
    try {
      const result = await client.checkout(deckId, branch.id);
      onCheckout?.(result.branch);
      setNotice(`Switched to ${result.branch.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to switch branch.');
    }
  }

  async function archive(branch: BranchSummary): Promise<void> {
    if (!window.confirm(`Archive branch “${branch.name}”?`)) return;
    try {
      const updated = await client.archiveBranch(deckId, branch.id);
      setBranches((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to archive branch.');
    }
  }

  return (
    <section aria-label="Branches" className="branch-panel">
      <header>
        <h2>Branches</h2>
        <button type="button" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void createBranch();
        }}
      >
        <label htmlFor="branch-name">New branch</label>
        <input
          id="branch-name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="feature/name"
        />
        <button type="submit" disabled={!newName.trim()}>
          Create
        </button>
      </form>
      {loading && <p role="status">Loading branches…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!loading && (
        <ul>
          {branches.map((branch) => (
            <li key={branch.id}>
              <button
                type="button"
                onClick={() => void checkout(branch)}
                disabled={branch.status === 'archived'}
                aria-current={branch.id === activeBranchId ? 'page' : undefined}
              >
                {branch.name}{' '}
                <small>
                  r{branch.headRevision} · {branch.status}
                </small>
              </button>
              {branch.id !== 'main' && branch.status === 'active' && (
                <button
                  type="button"
                  onClick={() => void archive(branch)}
                  aria-label={`Archive ${branch.name}`}
                >
                  Archive
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
