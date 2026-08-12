/**
 * CodeBlockEditor — code editor + run button.
 *
 * Per Wave 2 §S2.10 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * - Source textarea (Monaco-style stand-in — full Monaco is a later
 *   optimization).
 * - Run button posts to `POST /v1/sandbox-runs`.
 * - Output (stdout / stderr) renders below the block.
 */

'use client';

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { submitSandboxRun, type SandboxRunResult } from '../../lib/media-service';

export interface CodeBlockEditorProps {
  /** Default source. */
  initialSource?: string;
  /** Default language. */
  language?: 'js' | 'ts' | 'python' | 'wasm';
  /** Called when a run completes. */
  onResult?: (result: SandboxRunResult) => void;
}

export function CodeBlockEditor({
  initialSource = 'console.log("Hello from Domio")',
  language = 'js',
  onResult,
}: CodeBlockEditorProps): ReactElement {
  const [source, setSource] = useState(initialSource);
  const [result, setResult] = useState<SandboxRunResult | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true);
    try {
      const r = await submitSandboxRun({ language, source });
      setResult(r);
      onResult?.(r);
    } finally {
      setRunning(false);
    }
  }, [source, language, onResult]);

  return (
    <div className="code-block-editor" data-testid="code-block-editor">
      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        spellCheck={false}
        className="code-block-editor__source"
        data-testid="code-block-source"
      />
      <button
        type="button"
        onClick={() => void handleRun()}
        disabled={running}
        className="code-block-editor__run"
        data-testid="code-block-run"
      >
        {running ? 'Running…' : '▶ Run'}
      </button>
      {result && (
        <div className="code-block-editor__output" data-testid="code-block-output">
          {result.stdout && (
            <pre className="code-block-editor__stdout">
              <strong>stdout</strong>
              <br />
              {result.stdout}
            </pre>
          )}
          {result.stderr && (
            <pre className="code-block-editor__stderr" data-testid="code-block-stderr">
              <strong>stderr</strong>
              <br />
              {result.stderr}
            </pre>
          )}
          <small>exit {result.exitCode} · {result.durationMs}ms</small>
        </div>
      )}
    </div>
  );
}