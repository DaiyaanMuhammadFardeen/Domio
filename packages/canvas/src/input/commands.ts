/**
 * Input commands — maps semantic intents to drag/transform commands that
 * the history engine consumes. Decoupled from the scene graph so it can
 * run in tests and reused in workers.
 */

import type { Intent } from './pointer.js';
import type { Transform2D, ULID } from '@domio/schema';

export interface CommandRequest {
  kind: 'begin' | 'update' | 'end' | 'commit';
  intent: Intent;
  targetIds: ULID[];
  currentTransforms: Map<ULID, Transform2D>;
  /** Optional snap resolution. */
  snap?: (delta: { dx: number; dy: number }) => { dx: number; dy: number };
}

export interface CommandOutcome {
  ephemeralTransforms: Map<ULID, Transform2D>;
  /** Final transforms to commit on `commit`. */
  committed?: Map<ULID, Transform2D>;
}

export function applyCommand(req: CommandRequest): CommandOutcome {
  const ephemeral = new Map<ULID, Transform2D>();
  if (req.intent.kind === 'beginDrag') {
    for (const id of req.targetIds) {
      const t = req.currentTransforms.get(id);
      if (t) ephemeral.set(id, { ...t });
    }
    return { ephemeralTransforms: ephemeral };
  }
  if (req.intent.kind === 'updateDrag' && req.intent.kind === 'updateDrag') {
    // No-op; the editor's DragController computes deltas. This module is
    // a thin shim that demonstrates the contract.
  }
  if (req.intent.kind === 'endDrag') {
    return { ephemeralTransforms: ephemeral, committed: ephemeral };
  }
  return { ephemeralTransforms: ephemeral };
}

export function emptyOutcome(): CommandOutcome {
  return { ephemeralTransforms: new Map() };
}