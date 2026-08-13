/**
 * LatexEditor — LaTeX editor with live preview.
 *
 * Per Wave 2 §S2.10 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Renders source via `POST /v1/latex` (or a bootstrap fallback that
 * returns a bare SVG). Toggle display mode (inline vs block).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { renderLatex, type LatexRenderResult } from '../../lib/media-service';

export interface LatexEditorProps {
  initialSource?: string;
}

export function LatexEditor({ initialSource = 'E = mc^2' }: LatexEditorProps): ReactElement {
  const [source, setSource] = useState(initialSource);
  const [displayMode, setDisplayMode] = useState(true);
  const [result, setResult] = useState<LatexRenderResult | null>(null);

  // Re-render on source / displayMode change.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      renderLatex({ source, displayMode }).then((r) => {
        if (!cancelled) setResult(r);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [source, displayMode]);

  const handleRender = useCallback(async () => {
    const r = await renderLatex({ source, displayMode });
    setResult(r);
  }, [source, displayMode]);

  return (
    <div className="latex-editor" data-testid="latex-editor">
      <div className="latex-editor__toolbar">
        <label>
          <input
            type="checkbox"
            checked={displayMode}
            onChange={(e) => setDisplayMode(e.target.checked)}
            data-testid="latex-display-mode"
          />
          Display mode
        </label>
        <button type="button" onClick={() => void handleRender()} data-testid="latex-render">
          Render
        </button>
      </div>
      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        spellCheck={false}
        className="latex-editor__source"
        data-testid="latex-source"
      />
      <div className="latex-editor__preview" data-testid="latex-preview">
        {result?.ok ? (
          <div dangerouslySetInnerHTML={{ __html: result.svg }} />
        ) : (
          <div className="latex-editor__error">{result?.error ?? 'No preview yet'}</div>
        )}
      </div>
    </div>
  );
}
