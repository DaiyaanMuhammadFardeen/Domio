'use client';

/**
 * DeepLinksPanel — left-side tab that lists the short deep links
 * minted for the active deck. The user can copy / resolve / delete
 * any link, or mint a sample one to test the resolver.
 *
 * Phase 10 M7.2. data-testid prefix `m7-deep-link-`. Mounted
 * under `m7-deep-links-tab` in `EditorRoot.tsx`.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

export interface DeepLinkRecord {
  readonly id: string;
  readonly click_count: number;
  readonly expires_at: number;
  readonly viewer_scope: 'public' | 'tenant' | 'private';
  readonly single_use: boolean;
  readonly created_at: number;
}

export interface DeepLinksPanelProps {
  /** Active deck id (used for "create sample" payload). */
  readonly deckId: string;
  /** Active slide id. */
  readonly activeSlideId: string;
  /** Records currently in the deck (from the service list endpoint). */
  readonly links: readonly DeepLinkRecord[];
  /** Generate a fresh sample payload + token. */
  readonly onCreateSample: (input: {
    readonly deck_id: string;
    readonly slide_id: string;
    readonly scenario: string;
  }) => Promise<{ readonly id: string; readonly token: string } | null>;
  /** Resolve a record (decode + verify). Returns the resolved payload or null. */
  readonly onResolve: (id: string) => Promise<{
    readonly slide_id: string;
    readonly scenario: string;
    readonly exp: number;
  } | null>;
  /** Delete a record. Returns true on success. */
  readonly onDelete: (id: string) => Promise<boolean>;
  /** Copy a URL to the clipboard. */
  readonly copyToClipboard?: (text: string) => Promise<boolean>;
}

interface ResolvedState {
  readonly id: string;
  readonly slide_id: string;
  readonly scenario: string;
  readonly exp: number;
}

function formatExpiry(expires_at: number): string {
  const d = new Date(expires_at);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export function DeepLinksPanel({
  deckId,
  activeSlideId,
  links,
  onCreateSample,
  onResolve,
  onDelete,
  copyToClipboard = async () => false,
}: DeepLinksPanelProps): ReactElement {
  const [resolved, setResolved] = useState<ResolvedState | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const sorted = useMemo(() => [...links].sort((a, b) => b.created_at - a.created_at), [links]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setResolveError(null);
    try {
      await onCreateSample({
        deck_id: deckId,
        slide_id: activeSlideId,
        scenario: 'bear',
      });
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setCreating(false);
    }
  }, [deckId, activeSlideId, onCreateSample]);

  const handleResolve = useCallback(
    async (id: string) => {
      setResolveError(null);
      try {
        const r = await onResolve(id);
        if (r) setResolved({ id, ...r });
      } catch (e) {
        setResolveError(e instanceof Error ? e.message : 'unknown');
      }
    },
    [onResolve],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await onDelete(id);
    },
    [onDelete],
  );

  const handleCopy = useCallback(
    async (url: string) => {
      await copyToClipboard(url);
    },
    [copyToClipboard],
  );

  return (
    <div className="deep-links-panel" data-testid="m7-deep-links-panel">
      <header className="deep-links-panel__header">
        <h3>Deep links</h3>
        <button
          type="button"
          className="deep-links-panel__create"
          data-testid="m7-deep-link-create"
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? 'Creating…' : 'Test resolve'}
        </button>
      </header>

      {resolveError ? (
        <p className="deep-links-panel__error" role="alert" data-testid="m7-deep-link-error">
          {resolveError}
        </p>
      ) : null}

      {resolved ? (
        <section className="deep-links-panel__resolved" data-testid="m7-deep-link-resolved">
          <p>
            Resolved <code>{resolved.id}</code> → slide <code>{resolved.slide_id}</code>
            {resolved.scenario ? (
              <>
                {' '}
                · scenario <code>{resolved.scenario}</code>
              </>
            ) : null}
          </p>
          <p className="deep-links-panel__resolved-exp">
            expires <code>{formatExpiry(resolved.exp)}</code>
          </p>
        </section>
      ) : null}

      <ul className="deep-links-panel__list" data-testid="m7-deep-link-list">
        {sorted.length === 0 ? (
          <li className="deep-links-panel__empty">No deep links minted yet.</li>
        ) : null}
        {sorted.map((link) => (
          <li key={link.id} className="deep-links-panel__row" data-testid="m7-deep-link-row">
            <code className="deep-links-panel__id" data-testid="m7-deep-link-id">
              {link.id}
            </code>
            <span className="deep-links-panel__scope" data-testid="m7-deep-link-scope">
              {link.viewer_scope}
            </span>
            <span className="deep-links-panel__clicks" data-testid="m7-deep-link-clicks">
              {link.click_count} click{link.click_count === 1 ? '' : 's'}
            </span>
            <span className="deep-links-panel__expiry" data-testid="m7-deep-link-expiry">
              exp {formatExpiry(link.expires_at)}
            </span>
            <button
              type="button"
              className="deep-links-panel__action"
              data-testid="m7-deep-link-copy"
              onClick={() => handleCopy(`/d/${link.id}`)}
            >
              Copy URL
            </button>
            <button
              type="button"
              className="deep-links-panel__action"
              data-testid="m7-deep-link-resolve"
              onClick={() => handleResolve(link.id)}
            >
              Resolve
            </button>
            <button
              type="button"
              className="deep-links-panel__action deep-links-panel__action--danger"
              data-testid="m7-deep-link-delete"
              onClick={() => handleDelete(link.id)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
