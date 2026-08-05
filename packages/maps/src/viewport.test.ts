import { describe, it, expect } from 'vitest';
import {
  ZOOM_MIN,
  ZOOM_MAX,
  clampZoom,
  clampLng,
  clampLat,
  clampViewport,
  fitToBounds,
  boundsCentre,
} from './viewport.js';

// ---------------------------------------------------------------------------
// Clamp tests
// ---------------------------------------------------------------------------

describe('clampZoom', () => {
  it('returns the value unchanged when within range', () => {
    expect(clampZoom(5)).toBe(5);
    expect(clampZoom(0)).toBe(0);
    expect(clampZoom(22)).toBe(22);
  });

  it('clamps below minimum to 0', () => {
    expect(clampZoom(-1)).toBe(0);
    expect(clampZoom(-100)).toBe(0);
  });

  it('clamps above maximum to 22', () => {
    expect(clampZoom(23)).toBe(22);
    expect(clampZoom(100)).toBe(22);
  });
});

describe('clampLng', () => {
  it('returns the value unchanged when within range', () => {
    expect(clampLng(0)).toBe(0);
    expect(clampLng(-90)).toBe(-90);
    expect(clampLng(180)).toBe(180);
  });

  it('clamps below -180', () => {
    expect(clampLng(-181)).toBe(-180);
    expect(clampLng(-360)).toBe(-180);
  });

  it('clamps above 180', () => {
    expect(clampLng(181)).toBe(180);
    expect(clampLng(360)).toBe(180);
  });
});

describe('clampLat', () => {
  it('returns the value unchanged when within range', () => {
    expect(clampLat(0)).toBe(0);
    expect(clampLat(-45)).toBe(-45);
    expect(clampLat(85)).toBe(85);
  });

  it('clamps below -85', () => {
    expect(clampLat(-86)).toBe(-85);
    expect(clampLat(-90)).toBe(-85);
  });

  it('clamps above 85', () => {
    expect(clampLat(86)).toBe(85);
    expect(clampLat(90)).toBe(85);
  });
});

describe('clampViewport', () => {
  it('clamps all three components', () => {
    const result = clampViewport({ zoom: 30, lng: 200, lat: 100 });
    expect(result).toEqual({ zoom: 22, lng: 180, lat: 85 });
  });

  it('returns unchanged when already in range', () => {
    const result = clampViewport({ zoom: 10, lng: -45, lat: 30 });
    expect(result).toEqual({ zoom: 10, lng: -45, lat: 30 });
  });
});

// ---------------------------------------------------------------------------
// fitToBounds tests
// ---------------------------------------------------------------------------

describe('fitToBounds', () => {
  it('returns a zoom that fits a small bounding box in a 1024×768 viewport', () => {
    // A small area around London
    const londonBounds = { west: -0.5, south: 51.0, east: 0.5, north: 51.5 };
    const viewport = { width: 1024, height: 768 };
    const zoom = fitToBounds(londonBounds, viewport);
    // Should be a high zoom (small area) — typically around 8-10
    expect(zoom).toBeGreaterThanOrEqual(5);
    expect(zoom).toBeLessThanOrEqual(15);
  });

  it('returns zoom 0 for the entire world', () => {
    const worldBounds = { west: -180, south: -85, east: 180, north: 85 };
    const viewport = { width: 256, height: 256 };
    const zoom = fitToBounds(worldBounds, viewport);
    expect(zoom).toBe(0);
  });

  it('clamps result to ZOOM_MIN..ZOOM_MAX', () => {
    // Very large bounds → zoom should clamp to 0
    const huge = { west: -180, south: -85, east: 180, north: 85 };
    const zoom = fitToBounds(huge, { width: 1024, height: 768 });
    expect(zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(zoom).toBeLessThanOrEqual(ZOOM_MAX);
  });

  it('is deterministic — same inputs always produce the same output', () => {
    const bounds = { west: 10, south: 40, east: 12, north: 42 };
    const viewport = { width: 800, height: 600 };
    const z1 = fitToBounds(bounds, viewport);
    const z2 = fitToBounds(bounds, viewport);
    expect(z1).toBe(z2);
  });
});

// ---------------------------------------------------------------------------
// boundsCentre tests
// ---------------------------------------------------------------------------

describe('boundsCentre', () => {
  it('returns the midpoint of the bounds', () => {
    const bounds = { west: 0, south: 0, east: 10, north: 20 };
    const centre = boundsCentre(bounds);
    expect(centre.lng).toBe(5);
    expect(centre.lat).toBe(10);
  });

  it('handles negative coordinates', () => {
    const bounds = { west: -10, south: -20, east: -5, north: -10 };
    const centre = boundsCentre(bounds);
    expect(centre.lng).toBe(-7.5);
    expect(centre.lat).toBe(-15);
  });

  it('handles zero-size bounds', () => {
    const bounds = { west: 5, south: 5, east: 5, north: 5 };
    const centre = boundsCentre(bounds);
    expect(centre.lng).toBe(5);
    expect(centre.lat).toBe(5);
  });
});
