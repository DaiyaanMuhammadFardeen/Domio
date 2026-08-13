'use client';

/**
 * Deck Comparison Panel — M8 surface.
 * Two inputs for deck IDs, a Compare button, and three lists: added,
 * removed, changed.
 */

import { useCallback, useState, type ReactElement } from 'react';

export interface DeckDiffEntry {
  readonly kind: string;
  readonly id: string;
  readonly a?: unknown;
  readonly b?: unknown;
}

export interface DeckDiffPanelProps {
  readonly defaultDeckId?: string;
  readonly onCompare: (
    deckIdA: string,
    deckIdB: string,
  ) => Promise<{
    added: readonly DeckDiffEntry[];
    removed: readonly DeckDiffEntry[];
    changed: readonly DeckDiffEntry[];
  }>;
}

export function DeckDiffPanel({ defaultDeckId, onCompare }: DeckDiffPanelProps): ReactElement {
  const [deckIdA, setDeckIdA] = useState(defaultDeckId ?? '');
  const [deckIdB, setDeckIdB] = useState(defaultDeckId ?? '');
  const [result, setResult] = useState<{
    added: readonly DeckDiffEntry[];
    removed: readonly DeckDiffEntry[];
    changed: readonly DeckDiffEntry[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compare = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await onCompare(deckIdA, deckIdB);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'compare failed');
    } finally {
      setBusy(false);
    }
  }, [deckIdA, deckIdB, onCompare]);

  return (
    <section data-testid="m8-diff-root" aria-label="Deck Diff">
      <header>
        <h2>Deck Diff</h2>
      </header>
      <label htmlFor="m8-diff-a">Deck A</label>
      <input
        id="m8-diff-a"
        data-testid="m8-diff-input-a"
        value={deckIdA}
        onChange={(e) => setDeckIdA(e.target.value)}
      />
      <label htmlFor="m8-diff-b">Deck B</label>
      <input
        id="m8-diff-b"
        data-testid="m8-diff-input-b"
        value={deckIdB}
        onChange={(e) => setDeckIdB(e.target.value)}
      />
      <button
        type="button"
        data-testid="m8-diff-compare"
        onClick={compare}
        disabled={busy || deckIdA.length === 0 || deckIdB.length === 0}
      >
        Compare
      </button>
      {error ? (
        <p role="alert" data-testid="m8-diff-error">
          {error}
        </p>
      ) : null}
      {result ? (
        <div data-testid="m8-diff-result">
          <section data-testid="m8-diff-added">
            <h3>Added ({result.added.length})</h3>
            <ul>
              {result.added.map((e) => (
                <li key={`${e.kind}-${e.id}`} data-testid="m8-diff-added-row">
                  {e.kind}: {e.id}
                </li>
              ))}
            </ul>
          </section>
          <section data-testid="m8-diff-removed">
            <h3>Removed ({result.removed.length})</h3>
            <ul>
              {result.removed.map((e) => (
                <li key={`${e.kind}-${e.id}`} data-testid="m8-diff-removed-row">
                  {e.kind}: {e.id}
                </li>
              ))}
            </ul>
          </section>
          <section data-testid="m8-diff-changed">
            <h3>Changed ({result.changed.length})</h3>
            <ul>
              {result.changed.map((e) => (
                <li key={`${e.kind}-${e.id}`} data-testid="m8-diff-changed-row">
                  {e.kind}: {e.id}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default DeckDiffPanel;
