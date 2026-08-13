/**
 * LaTeX render adapter — local SVG fallback for `latex` elements.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * The viewer calls the `latex-render` service to obtain an SVG
 * (KaTeX/MathJax on the server). This adapter exposes the local
 * fallback so the viewer works end-to-end before the service lands.
 * The fallback renders the source verbatim inside an `<text>` node;
 * it does NOT parse LaTeX — it's a deterministic placeholder so a
 * slide with a `latex` element communicates intent.
 */

export interface LatexRenderRequest {
  readonly source: string;
  readonly displayMode: 'inline' | 'block';
  readonly themeHash?: string;
}

export interface LatexRenderResult {
  readonly svg: string;
  readonly error?: boolean;
}

export async function renderLatexToSvg(request: LatexRenderRequest): Promise<LatexRenderResult> {
  const escaped = escapeXml(request.source);
  const fontSize = request.displayMode === 'inline' ? 14 : 24;
  const viewBox = request.displayMode === 'inline' ? '0 0 240 32' : '0 0 480 56';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="KaTeX_Main, serif" font-size="${fontSize}" fill="currentColor">${escaped}</text></svg>`;
  return { svg };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
