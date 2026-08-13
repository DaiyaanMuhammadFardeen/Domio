/**
 * Legal Hold service — Wave 8 §S8.6.
 *
 * In-memory deterministic seed mirroring the governance service's
 * `GET /v1/admin/legal-holds` shape. Every mutation lives in a
 * module-singleton store so tests can observe side-effects across
 * calls without re-importing.
 */

import type {
  LegalHold,
  LegalHoldInput,
  LegalHoldTargetKind,
} from './types';

/** Thrown when a hold cannot be transitioned (already released, etc.). */
export class LegalHoldError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'LegalHoldError';
    this.code = code;
  }
}

const NOW = Date.UTC(2026, 6, 1);
const DAY_MS = 1000 * 60 * 60 * 24;

const SEED: readonly LegalHold[] = [
  {
    id: 'lh-acme-litigation',
    tenant_id: 'acme',
    target_kind: 'deck',
    target_id: 'deck-prospectus-q3',
    target_label: 'Investor prospectus — Q3 2026',
    reason: 'Outside counsel requested preservation pending litigation review.',
    status: 'active',
    applied_at_ms: NOW - 30 * DAY_MS,
    applied_by: 'compliance@acme.com',
    released_at_ms: null,
    released_by: null,
    release_notes: null,
  },
  {
    id: 'lh-acme-workspace',
    tenant_id: 'acme',
    target_kind: 'workspace',
    target_id: 'w-acme-finance',
    target_label: 'Finance workspace',
    reason: 'SOX-relevant audit cycle; cannot purge until FY26 close.',
    status: 'active',
    applied_at_ms: NOW - 14 * DAY_MS,
    applied_by: 'cfo@acme.com',
    released_at_ms: null,
    released_by: null,
    release_notes: null,
  },
  {
    id: 'lh-initech-user',
    tenant_id: 'initech',
    target_kind: 'user',
    target_id: 'u-peter',
    target_label: 'Peter Gibbons',
    reason: 'Investigation — retention of all authored decks and assets.',
    status: 'released',
    applied_at_ms: NOW - 90 * DAY_MS,
    applied_by: 'legal@initech.io',
    released_at_ms: NOW - 7 * DAY_MS,
    released_by: 'legal@initech.io',
    release_notes: 'Investigation closed; no findings. Approved by GC.',
  },
  {
    id: 'lh-stark-deck',
    tenant_id: 'stark',
    target_kind: 'deck',
    target_id: 'deck-merger-term-sheet',
    target_label: 'Merger term sheet (draft)',
    reason: 'Regulatory inquiry — preserve all draft versions.',
    status: 'active',
    applied_at_ms: NOW - 4 * DAY_MS,
    applied_by: 'legal@stark.dev',
    released_at_ms: null,
    released_by: null,
    release_notes: null,
  },
];

const STORE: LegalHold[] = SEED.map((h) => ({ ...h }));

function genId(): string {
  return `lh-${Math.random().toString(36).slice(2, 10)}`;
}

function clone(h: LegalHold): LegalHold {
  return { ...h };
}

export async function listLegalHolds(): Promise<ReadonlyArray<LegalHold>> {
  // Active first, then released, ordered newest applied within each bucket.
  const items = STORE.map(clone).sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'active' ? -1 : 1;
    }
    return b.applied_at_ms - a.applied_at_ms;
  });
  return items;
}

export async function getLegalHold(id: string): Promise<LegalHold | null> {
  const found = STORE.find((h) => h.id === id);
  return found ? clone(found) : null;
}

export async function applyLegalHold(
  input: LegalHoldInput,
): Promise<LegalHold> {
  if (!input.reason || input.reason.trim().length < 5) {
    throw new LegalHoldError(
      'invalid_reason',
      'Reason must be at least 5 characters.',
    );
  }
  if (!input.target_id || input.target_id.trim().length === 0) {
    throw new LegalHoldError(
      'invalid_target',
      'Target ID is required.',
    );
  }
  const targetLabel = inferLabel(input.target_kind, input.target_id);
  const created: LegalHold = {
    id: genId(),
    tenant_id: 'acme',
    target_kind: input.target_kind,
    target_id: input.target_id,
    target_label: targetLabel,
    reason: input.reason.trim(),
    status: 'active',
    applied_at_ms: NOW,
    applied_by: 'admin@domio.app',
    released_at_ms: null,
    released_by: null,
    release_notes: null,
  };
  STORE.unshift(created);
  return clone(created);
}

export async function releaseLegalHold(
  id: string,
  notes: string,
): Promise<LegalHold> {
  if (!notes || notes.trim().length < 5) {
    throw new LegalHoldError(
      'invalid_release_notes',
      'Release notes must be at least 5 characters.',
    );
  }
  const idx = STORE.findIndex((h) => h.id === id);
  if (idx < 0) {
    throw new LegalHoldError('not_found', `Hold ${id} not found.`);
  }
  const prev = STORE[idx];
  if (!prev) {
    throw new LegalHoldError('not_found', `Hold ${id} not found.`);
  }
  if (prev.status === 'released') {
    throw new LegalHoldError(
      'already_released',
      `Hold ${id} was already released at ${new Date(
        prev.released_at_ms ?? 0,
      ).toISOString()}.`,
    );
  }
  const next: LegalHold = {
    ...prev,
    status: 'released',
    released_at_ms: NOW,
    released_by: 'admin@domio.app',
    release_notes: notes.trim(),
  };
  STORE[idx] = next;
  return clone(next);
}

/**
 * Items that fall under a hold. Decks map directly; workspaces include
 * their constituent decks; users include decks they authored plus any
 * uploaded assets. Returns a stable, deterministic shape for the UI.
 */
export async function getAffectedItems(
  id: string,
): Promise<ReadonlyArray<{ kind: 'deck' | 'asset'; id: string; label: string }>> {
  const hold = STORE.find((h) => h.id === id);
  if (!hold) return [];
  switch (hold.target_kind) {
    case 'deck':
      return [{ kind: 'deck', id: hold.target_id, label: hold.target_label }];
    case 'workspace':
      return [
        {
          kind: 'deck',
          id: `${hold.target_id}-deck-1`,
          label: `${hold.target_label} — Q1 board update`,
        },
        {
          kind: 'deck',
          id: `${hold.target_id}-deck-2`,
          label: `${hold.target_label} — Mid-quarter review`,
        },
        {
          kind: 'asset',
          id: `${hold.target_id}-asset-1`,
          label: `${hold.target_label} — Logo set`,
        },
      ];
    case 'user':
      return [
        {
          kind: 'deck',
          id: `${hold.target_id}-deck-1`,
          label: `${hold.target_label} — Pitch deck`,
        },
        {
          kind: 'asset',
          id: `${hold.target_id}-asset-1`,
          label: `${hold.target_label} — Uploaded photos`,
        },
      ];
  }
}

function inferLabel(kind: LegalHoldTargetKind, id: string): string {
  switch (kind) {
    case 'deck':
      return `Deck ${id}`;
    case 'workspace':
      return `Workspace ${id}`;
    case 'user':
      return `User ${id}`;
  }
}
