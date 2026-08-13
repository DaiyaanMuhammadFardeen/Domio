/**
 * LatexBlock — viewer-side renderer for `latex`-typed slide elements.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Calls the `latex-render` service to obtain an SVG. The service is
 * authoritative — the viewer never parses LaTeX itself. The bootstrap
 * path here constructs an SVG with the formula rendered as a `<text>`
 * node (font + positioning only) so a viewer without a real backend
 * still shows a meaningful placeholder.
 */

'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { LatexLayer } from '@domio/schema/generated/scene-graph';
import { renderLatexToSvg, type LatexRenderResult } from './LatexRenderAdapter';

export interface LatexBlockProps {
  readonly layer: LatexLayer;
  readonly dataTestId?: string;
}

export function LatexBlock({ layer, dataTestId = 'latex-block' }: LatexBlockProps): ReactElement {
  const [svg, setSvg] = useState<LatexRenderResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await renderLatexToSvg({
          source: layer.source,
          displayMode: layer.displayMode ?? 'block',
          ...(layer.themeHash ? { themeHash: layer.themeHash } : {}),
        });
        if (!cancelled) setSvg(result);
      } catch {
        if (!cancelled) setSvg({ svg: '', error: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [layer]);

  const display = layer.displayMode === 'inline' ? 'inline-block' : 'block';
  const sizing = useMemo(
    () => ({ fontSize: layer.displayMode === 'inline' ? 14 : 24 }),
    [layer.displayMode],
  );

  return (
    <div
      data-testid={dataTestId}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      {svg && !svg.error && svg.svg ? (
        <div
          data-testid={`${dataTestId}-svg`}
          style={{ display, ...sizing }}
          dangerouslySetInnerHTML={{ __html: svg.svg }}
        />
      ) : (
        <code
          data-testid={`${dataTestId}-placeholder`}
          style={{
            display,
            ...sizing,
            fontFamily: 'serif',
            whiteSpace: 'pre-wrap',
            textAlign: 'center',
          }}
        >
          {layer.source}
        </code>
      )}
    </div>
  );
}
