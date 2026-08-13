'use client';

/**
 * SyncIndicator — shows "Synced", "Syncing… N pending", or "Offline".
 * Subscribes to the autosave facade and re-renders on state change.
 *
 * See docs/development_phases/phase-03 §E.4 (autosave indicator).
 */

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { AutosaveFacade, AutosaveState } from '../lib/autosave';

export interface SyncIndicatorProps {
  facade: AutosaveFacade;
}

export function SyncIndicator({ facade }: SyncIndicatorProps): ReactElement {
  const [state, setState] = useState<AutosaveState>(facade.state());

  useEffect(() => {
    return facade.subscribe(setState);
  }, [facade]);

  return (
    <div
      className={`sync-indicator sync-indicator--${state.status}`}
      role="status"
      aria-live="polite"
    >
      <span className="sync-indicator__dot" aria-hidden />
      <span className="sync-indicator__label">{labelFor(state)}</span>
    </div>
  );
}

function labelFor(state: AutosaveState): string {
  switch (state.status) {
    case 'idle':
      return 'Idle';
    case 'pending':
      return `Saving… ${state.pending} pending`;
    case 'syncing':
      return `Syncing… ${state.pending} pending`;
    case 'synced':
      return state.lastSyncedAt ? 'Synced' : 'Ready';
    case 'offline':
      return 'Offline';
  }
}
