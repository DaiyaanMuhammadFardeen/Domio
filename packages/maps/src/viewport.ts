/**
 * Default viewport math — zoom/lng/lat clamping and fit-to-bounds computation.
 *
 * All logic is deterministic and headless-testable.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ZOOM_MIN = 0;
export const ZOOM_MAX = 22;
export const LNG_MIN = -180;
export const LNG_MAX = 180;
export const LAT_MIN = -85;
export const LAT_MAX = 85;

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

export interface Viewport {
  readonly zoom: number;
  readonly lng: number;
  readonly lat: number;
}

// ---------------------------------------------------------------------------
// Clamp helpers
// ---------------------------------------------------------------------------

export function clampZoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

export function clampLng(lng: number): number {
  return Math.max(LNG_MIN, Math.min(LNG_MAX, lng));
}

export function clampLat(lat: number): number {
  return Math.max(LAT_MIN, Math.min(LAT_MAX, lat));
}

/** Clamp all three components of a viewport. */
export function clampViewport(vp: Viewport): Viewport {
  return {
    zoom: clampZoom(vp.zoom),
    lng: clampLng(vp.lng),
    lat: clampLat(vp.lat),
  };
}

// ---------------------------------------------------------------------------
// fitToBounds
// ---------------------------------------------------------------------------

export interface Bounds {
  /** West longitude (min lng). */
  readonly west: number;
  /** South latitude (min lat). */
  readonly south: number;
  /** East longitude (max lng). */
  readonly east: number;
  /** North latitude (max lat). */
  readonly north: number;
}

export interface ViewportSize {
  /** Width in CSS pixels. */
  readonly width: number;
  /** Height in CSS pixels. */
  readonly height: number;
}

/**
 * Compute a zoom level that fits the given geographic bounds inside a viewport
 * of the given size, using a deterministic Mercator-based formula.
 *
 * The returned zoom is clamped to [ZOOM_MIN, ZOOM_MAX].
 */
export function fitToBounds(bounds: Bounds, viewportSize: ViewportSize): number {
  const lngDiff = Math.abs(bounds.east - bounds.west);
  const latDiff = Math.abs(bounds.north - bounds.south);

  // Centre of bounds
  const centreLat = (bounds.south + bounds.north) / 2;

  // World size at zoom 0 in tiles (standard web-mercator 256px tiles)
  const worldTileSize = 256;

  // Mercator latitude缩scale — clamp to avoid Infinity at poles
  const clampedLat = Math.max(-85, Math.min(85, centreLat));
  const latRad = (clampedLat * Math.PI) / 180;
  const mercatorN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));

  // Pixels per degree at zoom 0
  const pxPerDegLng0 = worldTileSize / 360;
  const pxPerDegLat0 = worldTileSize / (2 * Math.PI);

  const pxPerDegLat =
    pxPerDegLat0 * Math.abs(Math.cos(latRad)) * Math.exp(-mercatorN);

  const requiredPxLng = lngDiff * pxPerDegLng0;
  const requiredPxLat = latDiff * pxPerDegLat;

  // We need the viewport to contain both dimensions
  const zoomLng =
    requiredPxLng > 0
      ? Math.log2(viewportSize.width / requiredPxLng)
      : ZOOM_MAX;
  const zoomLat =
    requiredPxLat > 0
      ? Math.log2(viewportSize.height / requiredPxLat)
      : ZOOM_MAX;

  // Take the smaller zoom so both dimensions fit
  const raw = Math.min(zoomLng, zoomLat);

  return clampZoom(Math.floor(raw));
}

/**
 * Compute the centre point of a set of bounds.
 */
export function boundsCentre(bounds: Bounds): { lng: number; lat: number } {
  return {
    lng: (bounds.west + bounds.east) / 2,
    lat: (bounds.south + bounds.north) / 2,
  };
}
