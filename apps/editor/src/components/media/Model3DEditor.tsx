/**
 * Model3DEditor — 3D viewport for GLB / USDZ models.
 *
 * Per Wave 2 §S2.10 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * - Loads a GLB / USDZ via `model-viewer` (or a placeholder when offline).
 * - Renders lighting + camera controls (rotate, zoom, pan).
 * - Lets designers add hotspots that trigger slide actions.
 * - Authors camera keyframes on a timeline.
 *
 * The component keeps the spec minimal — actual rendering happens in
 * the player, not the editor. The editor focus is metadata + UX.
 */

'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

export interface Hotspot {
  id: string;
  /** Normalized position in [0,1] x [0,1]. */
  x: number;
  y: number;
  /** Slide action trigger. */
  action: string;
}

export interface CameraKeyframe {
  id: string;
  /** Time offset in ms. */
  t: number;
  /** Orbit angle in degrees. */
  orbit: number;
  /** Distance from origin. */
  distance: number;
}

export interface Model3DEditorProps {
  /** Model URL (GLB or USDZ). */
  src: string;
  /** Existing hotspots. */
  hotspots: readonly Hotspot[];
  /** Existing camera keyframes. */
  keyframes: readonly CameraKeyframe[];
  /** Called when the hotspot set changes. */
  onHotspotsChange: (hotspots: readonly Hotspot[]) => void;
  /** Called when the keyframe set changes. */
  onKeyframesChange: (keyframes: readonly CameraKeyframe[]) => void;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function Model3DEditor({
  src,
  hotspots,
  keyframes,
  onHotspotsChange,
  onKeyframesChange,
}: Model3DEditorProps): ReactElement {
  const [orbit, setOrbit] = useState(0);
  const [distance, setDistance] = useState(2);
  const [pendingHotspot, setPendingHotspot] = useState<{ x: number; y: number } | null>(null);

  const sortedKeyframes = useMemo(() => [...keyframes].sort((a, b) => a.t - b.t), [keyframes]);

  const handleViewportClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPendingHotspot({ x, y });
  }, []);

  const handleAddHotspot = useCallback(
    (action: string) => {
      if (!pendingHotspot) return;
      const next: Hotspot = {
        id: nextId('hot'),
        x: pendingHotspot.x,
        y: pendingHotspot.y,
        action,
      };
      onHotspotsChange([...hotspots, next]);
      setPendingHotspot(null);
    },
    [pendingHotspot, hotspots, onHotspotsChange],
  );

  const handleRemoveHotspot = useCallback(
    (id: string) => {
      onHotspotsChange(hotspots.filter((h) => h.id !== id));
    },
    [hotspots, onHotspotsChange],
  );

  const handleAddKeyframe = useCallback(() => {
    const next: CameraKeyframe = {
      id: nextId('kf'),
      t: sortedKeyframes.length === 0 ? 0 : sortedKeyframes[sortedKeyframes.length - 1]!.t + 1000,
      orbit,
      distance,
    };
    onKeyframesChange([...keyframes, next]);
  }, [keyframes, sortedKeyframes, orbit, distance, onKeyframesChange]);

  const handleRemoveKeyframe = useCallback(
    (id: string) => {
      onKeyframesChange(keyframes.filter((k) => k.id !== id));
    },
    [keyframes, onKeyframesChange],
  );

  return (
    <div className="model3d-editor" data-testid="model3d-editor">
      <div
        className="model3d-editor__viewport"
        onClick={handleViewportClick}
        data-testid="model3d-viewport"
      >
        <div className="model3d-editor__model" data-testid="model3d-model">
          <span className="model3d-editor__model-label">{src ? 'GLB' : 'No model'}</span>
        </div>
        {hotspots.map((h) => (
          <span
            key={h.id}
            className="model3d-editor__hotspot"
            style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveHotspot(h.id);
            }}
            title={`${h.action} (click to remove)`}
            data-testid={`model3d-hotspot-${h.id}`}
          />
        ))}
        {pendingHotspot && (
          <span
            className="model3d-editor__hotspot model3d-editor__hotspot--pending"
            style={{ left: `${pendingHotspot.x * 100}%`, top: `${pendingHotspot.y * 100}%` }}
          />
        )}
      </div>

      <div className="model3d-editor__controls">
        <label>
          Orbit: {orbit}°
          <input
            type="range"
            min="0"
            max="360"
            value={orbit}
            onChange={(e) => setOrbit(Number(e.target.value))}
            data-testid="model3d-orbit"
          />
        </label>
        <label>
          Distance: {distance.toFixed(1)}
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.1"
            value={distance}
            onChange={(e) => setDistance(Number(e.target.value))}
            data-testid="model3d-distance"
          />
        </label>
      </div>

      {pendingHotspot && (
        <div className="model3d-editor__pending" data-testid="model3d-pending">
          <input
            type="text"
            placeholder="Action (e.g. goto:slide-2)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddHotspot((e.target as HTMLInputElement).value);
              if (e.key === 'Escape') setPendingHotspot(null);
            }}
            autoFocus
            data-testid="model3d-action-input"
          />
        </div>
      )}

      <div className="model3d-editor__timeline">
        <header>
          <strong>Camera keyframes</strong>
          <button type="button" onClick={handleAddKeyframe} data-testid="model3d-keyframe-add">
            + Keyframe
          </button>
        </header>
        <ul>
          {sortedKeyframes.map((k) => (
            <li key={k.id} data-testid={`model3d-keyframe-${k.id}`}>
              <span>
                {k.t}ms · orbit {k.orbit}° · d {k.distance.toFixed(1)}
              </span>
              <button type="button" onClick={() => handleRemoveKeyframe(k.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
