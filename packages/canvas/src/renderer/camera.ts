/**
 * Camera state — view of the infinite canvas. World coordinates are float64
 * with a camera-relative origin offset (`originX`, `originY`) so distant
 * frames do not lose precision (see docs/editor-canvas.md §1 Feature 11).
 *
 * Coordinates flow:
 *   world  →  screen  via  (world - origin) * zoom + viewport / 2
 *   screen →  world   via  ((screen - viewport / 2) / zoom) + origin
 *
 * Origin offset is the camera's anchored world coordinate; moving the camera
 * never moves the origin until precision demands it.
 */

export interface ViewportSize {
  width: number;
  height: number;
}

export interface CameraState {
  /** World x of the camera anchor. */
  x: number;
  /** World y of the camera anchor. */
  y: number;
  /** Zoom factor; 1.0 == 100%. */
  zoom: number;
  /** World x of the origin offset (for precision). */
  originX: number;
  /** World y of the origin offset (for precision). */
  originY: number;
}

export function createCamera(initial: Partial<CameraState> = {}): CameraState {
  return {
    x: initial.x ?? 0,
    y: initial.y ?? 0,
    zoom: initial.zoom ?? 1,
    originX: initial.originX ?? initial.x ?? 0,
    originY: initial.originY ?? initial.y ?? 0,
  };
}

export interface WorldPoint {
  x: number;
  y: number;
}

export function worldToScreen(
  camera: CameraState,
  world: WorldPoint,
  viewport: ViewportSize,
): WorldPoint {
  return {
    x: (world.x - camera.originX) * camera.zoom + viewport.width / 2,
    y: (world.y - camera.originY) * camera.zoom + viewport.height / 2,
  };
}

export function screenToWorld(
  camera: CameraState,
  screen: WorldPoint,
  viewport: ViewportSize,
): WorldPoint {
  return {
    x: (screen.x - viewport.width / 2) / camera.zoom + camera.originX,
    y: (screen.y - viewport.height / 2) / camera.zoom + camera.originY,
  };
}

export interface Aabb {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function cameraBounds(
  camera: CameraState,
  viewport: ViewportSize,
): Aabb {
  const halfW = viewport.width / 2 / camera.zoom;
  const halfH = viewport.height / 2 / camera.zoom;
  return {
    x: camera.originX - halfW,
    y: camera.originY - halfH,
    w: halfW * 2,
    h: halfH * 2,
  };
}