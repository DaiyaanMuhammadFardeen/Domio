/**
 * useViewport — exposes the editor viewport state (zoom + pan) and the
 * helpers needed by Rulers, Guides, GridOverlay, ZoomHUD, and SnapEngine.
 *
 * Wave 2 §Phase A. The ZoomHUD pill in Wave 2 §S2.1 reads from this
 * hook; the canvas's SVG `viewBox` is wrapped in a `<g transform>`
 * controlled here.
 */

import { useCallback } from 'react';
import { useEditorStore } from '../store/editor-store';

export interface UseViewportResult {
  zoom: number;
  pan: { x: number; y: number };
  setZoom: (z: number) => void;
  setPan: (p: { x: number; y: number }) => void;
  reset: () => void;
  fitToSlide: (slideWidth: number, slideHeight: number, viewportWidth: number, viewportHeight: number) => void;
  zoomIn: (step?: number) => void;
  zoomOut: (step?: number) => void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

function clampZoom(z: number): number {
  if (Number.isNaN(z) || !Number.isFinite(z)) return 1;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

export function useViewport(): UseViewportResult {
  const zoom = useEditorStore((s) => s.zoom);
  const pan = useEditorStore((s) => s.pan);
  const setZoomRaw = useEditorStore((s) => s.setZoom);
  const setPanRaw = useEditorStore((s) => s.setPan);
  const reset = useEditorStore((s) => s.resetViewport);

  const setZoom = useCallback((z: number) => setZoomRaw(clampZoom(z)), [setZoomRaw]);
  const setPan = useCallback(
    (p: { x: number; y: number }) => setPanRaw(p),
    [setPanRaw],
  );

  const fitToSlide = useCallback(
    (sw: number, sh: number, vw: number, vh: number) => {
      const fit = Math.min(vw / sw, vh / sh);
      const z = clampZoom(fit * 0.95);
      const px = (vw - sw * z) / 2;
      const py = (vh - sh * z) / 2;
      setZoomRaw(z);
      setPanRaw({ x: px, y: py });
    },
    [setZoomRaw, setPanRaw],
  );

  const zoomIn = useCallback((step = 0.1) => setZoomRaw(clampZoom(zoom + step)), [zoom, setZoomRaw]);
  const zoomOut = useCallback(
    (step = 0.1) => setZoomRaw(clampZoom(zoom - step)),
    [zoom, setZoomRaw],
  );

  return { zoom, pan, setZoom, setPan, reset, fitToSlide, zoomIn, zoomOut };
}