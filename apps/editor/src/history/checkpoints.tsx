'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { BranchClient, CheckpointSummary } from '../branch/types.js';

export interface CheckpointsProps {
  deckId: string;
  client: BranchClient;
  branchId?: string;
  onRestore?: (result: { newRevision: number; branchId: string }) => void;
}

export function Checkpoints({
  deckId,
  client,
  branchId,
  onRestore,
}: CheckpointsProps): ReactElement {
  const [items, setItems] = useState<CheckpointSummary[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void client
      .listCheckpoints(deckId, branchId)
      .then(setItems)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Unable to load checkpoints.'),
      );
  }, [client, deckId, branchId]);
  async function create(): Promise<void> {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const cp = await client.createCheckpoint(deckId, name.trim(), branchId);
      setItems((old) => [cp, ...old]);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create checkpoint.');
    } finally {
      setBusy(false);
    }
  }
  async function rename(cp: CheckpointSummary): Promise<void> {
    const next = window.prompt('Checkpoint name', cp.name);
    if (!next || next === cp.name) return;
    try {
      const updated = await client.renameCheckpoint(deckId, cp.id, next);
      setItems((old) => old.map((item) => (item.id === updated.id ? updated : item)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to rename checkpoint.');
    }
  }
  async function restore(cp: CheckpointSummary): Promise<void> {
    if (!window.confirm(`Restore ${cp.name}? This creates a new revision.`)) return;
    setBusy(true);
    try {
      const result = await client.restoreCheckpoint(deckId, cp.id);
      onRestore?.(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to restore checkpoint.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Checkpoints">
      <h2>Checkpoints</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input
          aria-label="Checkpoint name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Version name"
        />
        <button type="submit" disabled={busy || !name.trim()}>
          Save
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul>
        {items.map((cp) => (
          <li key={cp.id}>
            <strong>{cp.name}</strong>{' '}
            <span>
              r{cp.revision} · {cp.kind}
            </span>
            <button type="button" onClick={() => void rename(cp)}>
              Rename
            </button>
            <button type="button" disabled={busy} onClick={() => void restore(cp)}>
              Restore
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { Checkpoints as CheckpointPanel };
export default Checkpoints;
