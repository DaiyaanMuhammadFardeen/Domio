import { describe, it, expect } from 'vitest';
import {
  clampZoom,
  fitBounds,
  isOneToOne,
  snapZoom,
  zoomBy,
  zoomTo,
  MIN_ZOOM,
  MAX_ZOOM,
} from '../src/renderer/zoom.js';

describe('zoom', () => {
  it('clampZoom respects [0.02, 64]', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(0.5)).toBe(0.5);
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(NaN)).toBe(1);
  });

  it('zoomBy multiplies via exponential mapping', () => {
    const cam = { zoom: 1 };
    zoomBy(cam, Math.log(2));
    expect(cam.zoom).toBeCloseTo(2);
  });

  it('zoomTo clamps to the bounds', () => {
    const cam = { zoom: 1 };
    zoomTo(cam, 1000);
    expect(cam.zoom).toBe(MAX_ZOOM);
  });

  it('snapZoom picks 1.0 and 2.0 when Cmd-held', () => {
    expect(snapZoom(true, 1.0)).toBe(1);
    expect(snapZoom(true, 2.0)).toBe(2);
    expect(snapZoom(true, 0.99)).toBe(1);
    expect(snapZoom(true, 2.01)).toBe(2);
  });

  it('snapZoom falls back to nearest preset without Cmd', () => {
    const out = snapZoom(false, 0.5);
    expect([0.5, 1]).toContain(out);
  });

  it('isOneToOne is true only at zoom = 1', () => {
    expect(isOneToOne(1)).toBe(true);
    expect(isOneToOne(1.0001)).toBe(false);
    expect(isOneToOne(0.9999)).toBe(false);
  });

  it('fitBounds fills the viewport with padding', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    fitBounds(cam, { x: 0, y: 0, w: 100, h: 50 }, { width: 800, height: 600 });
    // 800 / 100 = 8, 600 / 50 = 12; min wins → 8.
    expect(cam.zoom).toBeCloseTo(8);
    expect(cam.x).toBe(50);
    expect(cam.y).toBe(25);
  });
});
