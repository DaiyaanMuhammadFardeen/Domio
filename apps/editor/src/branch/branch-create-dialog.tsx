'use client';

import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { BranchClient, BranchSummary } from './types.js';

export interface BranchCreateDialogProps {
  deckId: string;
  client: BranchClient;
  /** Available base checkpoints to anchor the new branch to. */
  baseCheckpoints?: { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
  onCreated?: (branch: BranchSummary) => void;
}

const VALID_BRANCH_NAME = /^[A-Za-z0-9._\-/ ]{1,256}$/;

export function BranchCreateDialog({
  deckId,
  client,
  baseCheckpoints = [],
  open,
  onClose,
  onCreated,
}: BranchCreateDialogProps): ReactElement | null {
  const [name, setName] = useState('');
  const [baseId, setBaseId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!VALID_BRANCH_NAME.test(name)) {
      setError('Branch name may only contain letters, numbers, spaces, and . _ - / characters.');
      return;
    }
    setSubmitting(true);
    try {
      const branch = await client.createBranch(deckId, name, baseId || undefined);
      onCreated?.(branch);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create branch.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Create branch" className="branch-create-dialog">
      <form onSubmit={submit}>
        <h2>New branch</h2>
        <label htmlFor="bc-dialog-name">Name</label>
        <input id="bc-dialog-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="bc-dialog-base">Base checkpoint</label>
        <select id="bc-dialog-base" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
          <option value="">Use current head</option>
          {baseCheckpoints.map((cp) => <option key={cp.id} value={cp.id}>{cp.name}</option>)}
        </select>
        {error && <p role="alert">{error}</p>}
        <menu>
          <button type="button" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" disabled={submitting || !name.trim()}>Create</button>
        </menu>
      </form>
    </div>
  );
}