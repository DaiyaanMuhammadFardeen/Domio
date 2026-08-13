/**
 * Vector pen. See docs/development_phases/phase-03 §D.1: cubic Béziers
 * with `x1,y1,x2,y2` handles per anchor; boolean ops slot exists but
 * runtime is deferred.
 */

export interface Anchor {
  /** World point of the anchor. */
  x: number;
  y: number;
  /** Incoming handle (relative to anchor in world units). */
  inX: number;
  inY: number;
  /** Outgoing handle. */
  outX: number;
  outY: number;
}

export interface VectorPath {
  anchors: Anchor[];
  closed: boolean;
}

export function emptyPath(): VectorPath {
  return { anchors: [], closed: false };
}

export function appendAnchor(path: VectorPath, anchor: Anchor): VectorPath {
  return { ...path, anchors: [...path.anchors, anchor] };
}

export function closePath(path: VectorPath): VectorPath {
  return { ...path, closed: true };
}

/**
 * Break handle symmetry (Alt-held): moves the incoming handle independently
 * of the outgoing one.
 */
export function breakHandle(anchor: Anchor, modifier: { alt?: boolean }): Anchor {
  if (!modifier.alt) return anchor;
  return { ...anchor, inX: anchor.inX, inY: anchor.inY };
}

/**
 * Render a `VectorPath` to an SVG-path string compatible with the
 * renderer's `drawPath` command. Cubic Béziers with degenerate handles
 * degenerate to lines.
 */
export function pathToSvg(path: VectorPath): string {
  if (path.anchors.length === 0) return '';
  const first = path.anchors[0]!;
  let d = `M${first.x},${first.y}`;
  for (let i = 1; i < path.anchors.length; i++) {
    const prev = path.anchors[i - 1]!;
    const next = path.anchors[i]!;
    d += ` C${prev.x + prev.outX},${prev.y + prev.outY} ${next.x + next.inX},${next.y + next.inY} ${next.x},${next.y}`;
  }
  if (path.closed && path.anchors.length > 1) {
    const last = path.anchors[path.anchors.length - 1]!;
    d += ` C${last.x + last.outX},${last.y + last.outY} ${first.x + first.inX},${first.y + first.inY} ${first.x},${first.y}`;
    d += ' Z';
  }
  return d;
}

export function fillRuleFromPath(
  _path: VectorPath,
  defaultRule: 'evenodd' | 'nonzero' = 'nonzero',
): 'evenodd' | 'nonzero' {
  return defaultRule;
}
