/**
 * Renderer selection — chooses the optimal backend based on data volume.
 *
 * Thresholds:
 *  - < 1000 points: SVG
 *  - 1000–10000: SVG (with note that canvas is available)
 *  - > 10000: canvas2d
 */

import type { RenderBackend } from './types.js';

/** Select renderer backend based on point count. */
export function selectRenderer(pointCount: number): RenderBackend {
  if (pointCount > 10000) return 'canvas2d';
  return 'svg';
}

/**
 * Render with escalation — returns the backend used.
 * Same thresholds as selectRenderer.
 */
export function renderWithEscalation(
  pointCount: number,
  _renderFn: (backend: RenderBackend) => void,
): RenderBackend {
  const backend = selectRenderer(pointCount);
  _renderFn(backend);
  return backend;
}
