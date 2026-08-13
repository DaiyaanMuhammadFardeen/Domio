'use client';

/**
 * NL Patch Panel — M8 surface for natural-language edits.
 * Decomposes a prompt into a list of tool calls and exposes
 * apply / rollback.
 */

import { useCallback, useState, type ReactElement } from 'react';

export interface NlToolCallSummary {
  readonly toolName: string;
  readonly input: unknown;
  readonly inverseInput?: unknown;
}

export interface NlPatchPanelProps {
  readonly deckId: string;
  readonly onParse?: (prompt: string) => Promise<readonly NlToolCallSummary[]>;
  readonly onApply?: (calls: readonly NlToolCallSummary[]) => Promise<void>;
  readonly onRollback?: (calls: readonly NlToolCallSummary[]) => Promise<void>;
}

export function NlPatchPanel({
  deckId,
  onParse,
  onApply,
  onRollback,
}: NlPatchPanelProps): ReactElement {
  const [prompt, setPrompt] = useState('');
  const [calls, setCalls] = useState<readonly NlToolCallSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const parsed = onParse ? await onParse(prompt) : [];
      setCalls(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'parse failed');
    } finally {
      setBusy(false);
    }
  }, [onParse, prompt]);

  const apply = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (onApply) await onApply(calls);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'apply failed');
    } finally {
      setBusy(false);
    }
  }, [calls, onApply]);

  const rollback = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (onRollback) await onRollback(calls);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'rollback failed');
    } finally {
      setBusy(false);
    }
  }, [calls, onRollback]);

  return (
    <section data-testid="m8-nl-root" aria-label="NL Patch">
      <header>
        <h2>NL Patch</h2>
        <span data-testid="m8-nl-deck-id">deck: {deckId}</span>
      </header>
      <label htmlFor="m8-nl-prompt">Prompt</label>
      <textarea
        id="m8-nl-prompt"
        data-testid="m8-nl-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
      />
      <button
        type="button"
        data-testid="m8-nl-patch"
        onClick={patch}
        disabled={busy || prompt.length === 0}
      >
        Patch
      </button>
      <div data-testid="m8-nl-diff">
        {calls.length === 0 ? (
          <em data-testid="m8-nl-diff-empty">No patch yet — enter a prompt.</em>
        ) : (
          <ul>
            {calls.map((c, i) => (
              <li key={`${c.toolName}-${i}`} data-testid="m8-nl-call">
                <span data-testid="m8-nl-call-tool">{c.toolName}</span>
                <pre data-testid="m8-nl-call-input">{JSON.stringify(c.input, null, 2)}</pre>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer>
        <button
          type="button"
          data-testid="m8-nl-apply"
          onClick={apply}
          disabled={busy || calls.length === 0}
        >
          Apply
        </button>
        <button
          type="button"
          data-testid="m8-nl-rollback"
          onClick={rollback}
          disabled={busy || calls.length === 0}
        >
          Rollback
        </button>
      </footer>
      {error ? (
        <p role="alert" data-testid="m8-nl-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export default NlPatchPanel;
