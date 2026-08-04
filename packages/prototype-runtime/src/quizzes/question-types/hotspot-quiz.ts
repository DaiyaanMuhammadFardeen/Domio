/**
 * Hotspot-quiz question validator.
 *
 * Spec: the answer is `{ x, y }` in normalized [0..1] coordinates.
 *
 * Scoring strategy (in order):
 *   1. Point-in-shape — for polygon geometries, if the point is inside
 *      the polygon, score = 1.
 *   2. Centroid distance — for both `rect` and `polygon`, compute the
 *      Euclidean distance from the answer point to the centroid; if
 *      within `tolerance` (default 0.04 in [0..1] space), score = 1.
 *
 * Tolerance is configurable on the question.
 */

import type { HotspotGeometry, QuestionValidationResult } from '../../types.js';

export const DEFAULT_HOTSPOT_TOLERANCE = 0.04;

export function hotspotCentroid(g: HotspotGeometry): { x: number; y: number } {
  if (g.kind === 'rect') {
    return { x: g.x + g.w / 2, y: g.y + g.h / 2 };
  }
  // Polygon centroid = arithmetic mean of vertices.
  let sx = 0;
  let sy = 0;
  for (const p of g.points) {
    sx += p.x;
    sy += p.y;
  }
  const n = g.points.length;
  return { x: sx / n, y: sy / n };
}

export function pointInPolygon(
  x: number,
  y: number,
  points: ReadonlyArray<{ readonly x: number; readonly y: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i]!;
    const pj = points[j]!;
    const intersect =
      pi.y > y !== pj.y > y &&
      x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y + Number.EPSILON) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInRect(
  x: number,
  y: number,
  rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function validateHotspotQuiz(
  answer: unknown,
  expected: { readonly geometry: HotspotGeometry; readonly tolerance?: number },
): QuestionValidationResult {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
    return { correct: false, confidence: 1, score: 0 };
  }
  const point = answer as { x?: unknown; y?: unknown };
  if (typeof point.x !== 'number' || typeof point.y !== 'number') {
    return { correct: false, confidence: 1, score: 0 };
  }
  const { x, y } = point;
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return { correct: false, confidence: 1, score: 0 };
  }
  // Strategy 1: point-in-shape.
  if (expected.geometry.kind === 'polygon') {
    if (pointInPolygon(x, y, expected.geometry.points)) {
      return { correct: true, confidence: 1, score: 1 };
    }
  } else if (pointInRect(x, y, expected.geometry)) {
    return { correct: true, confidence: 1, score: 1 };
  }
  // Strategy 2: centroid distance.
  const tolerance = expected.tolerance ?? DEFAULT_HOTSPOT_TOLERANCE;
  const c = hotspotCentroid(expected.geometry);
  const dx = x - c.x;
  const dy = y - c.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= tolerance) return { correct: true, confidence: 1, score: 1 };
  // Partial credit for in-range up to 2× tolerance.
  if (dist <= tolerance * 2) {
    return { correct: false, confidence: 1, score: 1 - (dist - tolerance) / tolerance };
  }
  return { correct: false, confidence: 1, score: 0 };
}