/**
 * Zoom — clamps and snap presets. See docs/development_phases/phase-03
 * §B.5: 2% to 6400%, Cmd-held snap to fit/100%/200%/zoom-to-fit.
 */

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 64.0;
export const SNAP_PRESETS = [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64] as const;

export function clampZoom(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function zoomTo(camera: { zoom: number }, value: number): void {
  camera.zoom = clampZoom(value);
}

export function zoomBy(camera: { zoom: number }, delta: number): void {
  const next = camera.zoom * Math.exp(delta);
  camera.zoom = clampZoom(next);
}

export interface FitTarget {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function fitBounds(
  camera: { x: number; y: number; zoom: number },
  target: FitTarget,
  viewport: { width: number; height: number },
  padding = 0,
): void {
  if (target.w <= 0 || target.h <= 0) return;
  const availableW = viewport.width * (1 - padding * 2);
  const availableH = viewport.height * (1 - padding * 2);
  const zoom = clampZoom(Math.min(availableW / target.w, availableH / target.h));
  camera.zoom = zoom;
  camera.x = target.x + target.w / 2;
  camera.y = target.y + target.h / 2;
}

/**
 * Cmd-held snap-to-fit. Picks the nearest preset or exactly 1.0/2.0.
 */
export function snapZoom(cmdHeld: boolean, value: number): number {
  if (!cmdHeld) return clampZoom(value);
  if (value <= 1.05 && value >= 0.95) return 1;
  if (value <= 2.05 && value >= 1.95) return 2;
  let nearest: number = SNAP_PRESETS[0] as number;
  let bestDelta = Math.abs(Math.log(value / nearest));
  for (const preset of SNAP_PRESETS) {
    const delta = Math.abs(Math.log(value / preset));
    if (delta < bestDelta) {
      bestDelta = delta;
      nearest = preset;
    }
  }
  return clampZoom(nearest);
}

export function isOneToOne(zoom: number): boolean {
  return Math.abs(zoom - 1) < 1e-6;
}