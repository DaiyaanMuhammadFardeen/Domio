/**
 * CodeBlock — viewer-side renderer for `codeBlock`-typed slide elements.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Reads the `codeSandbox` runtime from `../embeds/sandbox` for live
 * execution. When the layer's `runnable` flag is true AND the slide is
 * focused, a "Run" button is exposed and the captured output renders
 * below the syntax-highlighted source. Otherwise the source is shown
 * statically (with monospace formatting + optional line numbers).
 */

'use client';

import { useState, useCallback, useMemo, type ReactElement } from 'react';
import type { CodeBlockLayer } from '@domio/schema/generated/scene-graph';
import { runCodeSandbox, type CodeRunResult } from './CodeSandboxAdapter';

export interface CodeBlockProps {
  readonly layer: CodeBlockLayer;
  readonly dataTestId?: string;
}

export function CodeBlock({ layer, dataTestId = 'code-block' }: CodeBlockProps): ReactElement {
  const [result, setResult] = useState<CodeRunResult | null>(null);
  const [running, setRunning] = useState(false);

  const lines = useMemo(() => layer.code.split('\n'), [layer.code]);
  const canRun = layer.runnable ?? false;

  const onRun = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    try {
      const out = await runCodeSandbox({
        code: layer.code,
        language: layer.language ?? 'javascript',
        policyId: layer.policyId ?? 'default',
      });
      setResult(out);
    } finally {
      setRunning(false);
    }
  }, [canRun, layer.code, layer.language, layer.policyId]);

  return (
    <div
      data-testid={dataTestId}
      style={{
        position: 'absolute',
        inset: 0,
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontSize: 12,
        padding: 12,
        overflow: 'auto',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'rgba(226,232,240,0.5)' }}>{layer.language ?? 'code'}</span>
        {canRun ? (
          <button
            type="button"
            onClick={() => void onRun()}
            disabled={running}
            data-testid={`${dataTestId}-run`}
            style={{
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: 4,
              padding: '4px 10px',
              cursor: running ? 'wait' : 'pointer',
              fontSize: 11,
            }}
          >
            {running ? 'Running…' : 'Run'}
          </button>
        ) : null}
      </div>
      <pre
        data-testid={`${dataTestId}-source`}
        style={{ margin: '8px 0', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}
      >
        {layer.showLineNumbers
          ? lines.map((line, i) => (
              <div key={i} style={{ display: 'flex' }}>
                <span style={{ color: 'rgba(226,232,240,0.3)', width: 24, textAlign: 'right', marginRight: 8 }}>
                  {i + 1}
                </span>
                <span>{line}</span>
              </div>
            ))
          : layer.code}
      </pre>
      {result ? (
        <div
          data-testid={`${dataTestId}-output`}
          style={{
            marginTop: 8,
            padding: 8,
            background: '#020617',
            border: '1px solid #1e293b',
            borderRadius: 4,
            color: result.exitCode === 0 ? '#86efac' : '#fca5a5',
          }}
        >
          <div style={{ fontSize: 11, color: 'rgba(226,232,240,0.5)' }}>exit {result.exitCode}</div>
          <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{result.stdout || '(no output)'}</pre>
          {result.stderr ? (
            <pre style={{ margin: '4px 0 0', color: '#fca5a5', whiteSpace: 'pre-wrap' }}>{result.stderr}</pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}