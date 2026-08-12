'use client';

/**
 * ParkingLotDrawer — presenter-side parking lot UI.
 *
 * Items appear in insertion order (FIFO). The presenter can:
 *   - Add a new item.
 *   - Pin/unpin a top item (star).
 *   - Mark answered (with optional answer text).
 *   - Delete.
 *   - Promote to agenda (sets `promoted_to_agenda`).
 *
 * When `enabled` is false the drawer is hidden. Otherwise it overlays
 * the right edge of the chrome.
 */

import { useCallback, useEffect, useState } from 'react';
import { ParkingLotClient, type ParkingLotItem } from '../../lib/parking-lot-service';

export interface ParkingLotDrawerProps {
  sessionId: string;
  workspaceId: string;
  enabled: boolean;
  onClose: () => void;
  onPromoteToAgenda?: (item: ParkingLotItem) => void;
}

export function ParkingLotDrawer({ sessionId, workspaceId, enabled, onClose, onPromoteToAgenda }: ParkingLotDrawerProps) {
  const client = useMemoClient(sessionId);
  const [items, setItems] = useState<ParkingLotItem[]>(() => client.list(sessionId));
  const [draftText, setDraftText] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  const refresh = useCallback(() => setItems(client.list(sessionId)), [client, sessionId]);

  const onAdd = useCallback(() => {
    const text = draftText.trim();
    if (!text) return;
    try {
      client.add({ sessionId, workspaceId, text });
      setDraftText('');
      setStatus({ kind: 'ok', message: 'added' });
      refresh();
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
    }
  }, [client, draftText, refresh, sessionId, workspaceId]);

  const onPin = useCallback((id: string) => {
    const item = client.list(sessionId).find((i) => i.id === id);
    if (!item) return;
    client.pin(id);
    refresh();
  }, [client, refresh, sessionId]);

  const onUnpin = useCallback((id: string) => {
    client.unpin(id);
    refresh();
  }, [client, refresh]);

  const onAnswered = useCallback((id: string) => {
    const ans = window.prompt('Answer (optional):') ?? '';
    client.markAnswered(id, ans);
    refresh();
  }, [client, refresh]);

  const onDelete = useCallback((id: string) => {
    client.delete(id);
    refresh();
  }, [client, refresh]);

  const onPromote = useCallback((item: ParkingLotItem) => {
    onPromoteToAgenda?.(item);
    setStatus({ kind: 'ok', message: 'promoted to agenda' });
  }, [onPromoteToAgenda]);

  // Recompute digest from the items list so the PresenterView's
  // parking_lot digest reflects local state.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pinned = items.filter((i) => i.status === 'pinned').length;
    const open = items.filter((i) => i.status === 'open').length;
    window.dispatchEvent(new CustomEvent('domio:parking-lot-changed', { detail: { pinned, open } }));
  }, [items]);

  if (!enabled) return null;

  return (
    <aside className="parking-lot-drawer" role="dialog" aria-label="Parking lot">
      <header className="parking-lot-drawer__header">
        <h3>Parking lot</h3>
        <button type="button" className="parking-lot-drawer__close" onClick={onClose} aria-label="Close parking lot">
          ✕
        </button>
      </header>
      <div className="parking-lot-drawer__add">
        <textarea
          className="parking-lot-drawer__input"
          rows={2}
          placeholder="Add an item…"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onAdd();
            }
          }}
        />
        <button type="button" className="parking-lot-drawer__add-btn" onClick={onAdd}>
          Add
        </button>
      </div>
      <ul className="parking-lot-drawer__list">
        {items.length === 0 && <li className="parking-lot-drawer__empty">No items yet.</li>}
        {items.map((item) => (
          <li key={item.id} className={`parking-row parking-row--${item.status}`}>
            <span className="parking-row__status" title={item.status}>{statusIcon(item.status)}</span>
            <span className="parking-row__text">{item.text}</span>
            <div className="parking-row__actions">
              {item.status === 'pinned' ? (
                <button type="button" onClick={() => onUnpin(item.id)} title="Unpin">☆</button>
              ) : (
                <button type="button" onClick={() => onPin(item.id)} title="Pin">★</button>
              )}
              <button type="button" onClick={() => onAnswered(item.id)} title="Mark answered">✓</button>
              <button type="button" onClick={() => onPromote(item)} title="Promote to agenda">↑</button>
              <button type="button" onClick={() => onDelete(item.id)} title="Delete">✕</button>
            </div>
          </li>
        ))}
      </ul>
      {status && (
        <div className={`parking-lot-drawer__status parking-lot-drawer__status--${status.kind}`} role="status" aria-live="polite">
          {status.message}
        </div>
      )}
    </aside>
  );
}

function statusIcon(s: ParkingLotItem['status']): string {
  switch (s) {
    case 'open': return '○';
    case 'answered': return '✓';
    case 'pinned': return '★';
    case 'deferred': return '⏸';
    case 'deleted': return '✕';
  }
}

import { useMemo } from 'react';
function useMemoClient(_sessionId: string): ParkingLotClient {
  return useMemo(() => new ParkingLotClient(), []);
}