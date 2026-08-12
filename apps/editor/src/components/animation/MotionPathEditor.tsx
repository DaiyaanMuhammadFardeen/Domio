'use client';

/**
 * MotionPathEditor — interactive bezier path editor for layer timelines.
 *
 * Wave 2 §S2.11 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * The editor renders the element's natural position at the centre of a
 * square SVG canvas and lets the designer place anchor + control
 * points that the element follows during playback. The preview dot
 * traces the path in real-time (a slow auto-play so the designer can
 * see the easing curve and bezier continuity without entering the
 * viewer).
 *
 * Inputs/outputs:
 *   - `value`: a MotionPath (see lib/motion-path.ts).
 *   - `onChange`: fires when the user releases a drag, or adds /
 *     removes a keyframe, or changes the timeline duration.
 *   - `onLiveChange`: fires on every drag tick so the canvas can show
 *     a live ghost preview.
 *
 * Triggers:
 *   The editor exposes a small dropdown for the path's trigger kind,
 *   mirroring the timeline's trigger. The selected trigger is part of
 *   the timeline config (this editor writes both the path and a
 *   `trigger` override on the timeline).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, PointerEvent as ReactPointerEvent } from 'react';
import {
  defaultMotionPath,
  sampleMotionPath,
  type MotionPath,
  type MotionPathKeyframe,
} from '../../lib/motion-path';
import type { TriggerConfig } from '@domio/canvas';
import { EasingBezierEditor, formatBezierTuple, parseBezierTuple } from './EasingBezierEditor';

export interface MotionPathEditorProps {
  value: MotionPath | null;
  durationMs: number;
  trigger?: TriggerConfig | undefined;
  /** Width of the canvas in pixels. Height is computed from the width. */
  width?: number | undefined;
  /** Whether the editor is read-only. */
  readOnly?: boolean | undefined;
  /** Optional id for testing. */
  id?: string | undefined;
  onChange: (path: MotionPath | null) => void;
  onLiveChange?: ((path: MotionPath) => void) | undefined;
  onTriggerChange?: ((trigger: TriggerConfig | undefined) => void) | undefined;
  /** Optional title + subtitle for the editor shell. */
  title?: string | undefined;
  subtitle?: string | undefined;
}

interface DragState {
  /** Index of the keyframe being dragged, or null when dragging a handle. */
  keyframeIdx: number;
  /** Which point is being dragged ('anchor' | 'handle'). */
  target: 'anchor' | 'handle';
}

const TRIGGER_KINDS: { value: TriggerConfig['kind']; label: string }[] = [
  { value: 'on_click', label: 'On click' },
  { value: 'on_enter', label: 'On enter' },
  { value: 'on_hover', label: 'On hover' },
  { value: 'on_data_change', label: 'On data change' },
  { value: 'on_timer', label: 'On timer' },
];

export function MotionPathEditor(props: MotionPathEditorProps): ReactElement {
  const width = props.width ?? 320;
  const height = width; // square canvas keeps distance math consistent
  const path = props.value ?? defaultMotionPath();
  const [livePath, setLivePath] = useState<MotionPath | null>(null);
  // Ref-based mirror of livePath so the pointer-up handler always sees
  // the latest drag value (React state updates are async).
  const livePathRef = useRef<MotionPath | null>(null);
  // The drag state is held only in a ref because pointermove/up need
  // synchronous access (React state updates are async).
  const dragRef = useRef<DragState | null>(null);
  const [previewT, setPreviewT] = useState<number>(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const working = livePath ?? path;

  // ── Auto-play preview ────────────────────────────────────────────────
  // A continuous loop that scrubs previewT from 0..durationMs so the
  // designer can see the easing + path shape without leaving the panel.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - start) % Math.max(500, props.durationMs);
      setPreviewT(elapsed);
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [props.durationMs]);

  // ── Coordinate conversion ───────────────────────────────────────────
  // Canvas coordinate space is centred on the element's natural
  // position. We map pixel space (0..width, 0..height) to a 200-px
  // radius centred on (width/2, height/2). 1 px on screen = 1 unit.
  const centreX = width / 2;
  const centreY = height / 2;

  const svgToPathDelta = useCallback(
    (svgX: number, svgY: number): { x: number; y: number } => {
      return { x: svgX - centreX, y: svgY - centreY };
    },
    [centreX, centreY],
  );

  const pathToSvg = useCallback(
    (x: number, y: number): { x: number; y: number } => {
      return { x: centreX + x, y: centreY + y };
    },
    [centreX, centreY],
  );

  const eventToSvg = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height,
    };
  }, [width, height]);

  // ── Drag handlers ──────────────────────────────────────────────────
  const beginDrag = useCallback(
    (keyframeIdx: number, target: 'anchor' | 'handle') => (e: ReactPointerEvent<SVGElement>) => {
      if (props.readOnly) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.target as Element & { setPointerCapture?: (id: number) => void };
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        // jsdom + non-browser environments may not implement setPointerCapture.
      }
      const next: DragState = { keyframeIdx, target };
      dragRef.current = next;
    },
    [props.readOnly],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!dragRef.current) return;
      const current_drag = dragRef.current;
      const { x: svgX, y: svgY } = eventToSvg(e.clientX, e.clientY);
      const delta = svgToPathDelta(svgX, svgY);
      const next = updateKeyframe(working, current_drag.keyframeIdx, (kf) => {
        if (current_drag.target === 'anchor') {
          return { ...kf, x: delta.x, y: delta.y };
        }
        // Handle = controlOut relative to anchor.
        const anchor = pathToSvg(kf.x, kf.y);
        return {
          ...kf,
          controlOut: { x: svgX - anchor.x, y: svgY - anchor.y },
        };
      });
      livePathRef.current = next;
      setLivePath(next);
      props.onLiveChange?.(next);
    },
    [working, eventToSvg, svgToPathDelta, pathToSvg, props],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!dragRef.current) return;
      const live = livePathRef.current;
      dragRef.current = null;
      setLivePath(null);
      livePathRef.current = null;
      if (live) props.onChange(live);
      try {
        const el = e.target as Element & { releasePointerCapture?: (id: number) => void };
        el.releasePointerCapture?.(e.pointerId);
      } catch {
        // Already released.
      }
    },
    [props],
  );

  // ── Keyframe add/remove/time ────────────────────────────────────────
  const handleAddKeyframe = useCallback(() => {
    const newKf: MotionPathKeyframe = {
      timeMs: Math.min(props.durationMs, working.keyframes.length * 200),
      x: 40,
      y: 40,
      controlOut: null,
    };
    const next: MotionPath = {
      ...working,
      keyframes: [...working.keyframes, newKf].sort((a, b) => a.timeMs - b.timeMs),
    };
    props.onChange(next);
  }, [working, props]);

  const handleRemoveKeyframe = useCallback(
    (idx: number) => {
      if (working.keyframes.length <= 2) return; // keep at least start + end
      const next: MotionPath = {
        ...working,
        keyframes: working.keyframes.filter((_, i) => i !== idx),
      };
      props.onChange(next);
    },
    [working, props],
  );

  const handleKeyframeTimeChange = useCallback(
    (idx: number, timeMs: number) => {
      const clamped = Math.max(0, Math.min(props.durationMs, Math.round(timeMs)));
      const next = updateKeyframe(working, idx, (kf) => ({ ...kf, timeMs: clamped }));
      props.onChange(next);
    },
    [working, props],
  );

  const handleKeyframeEasingChange = useCallback(
    (idx: number, easing: string) => {
      const next = updateKeyframe(working, idx, (kf) => ({ ...kf, easing }));
      props.onChange(next);
    },
    [working, props],
  );

  // ── Path SVG path-d ─────────────────────────────────────────────────
  const pathD = useMemo(() => buildPathD(working), [working]);
  const sample = useMemo(() => sampleMotionPath(working, previewT), [working, previewT]);

  // ── Trigger dropdown ────────────────────────────────────────────────
  const triggerKind = props.trigger?.kind ?? 'none';

  return (
    <div className="motion-path-editor" data-testid={props.id ?? 'motion-path-editor'}>
      {(props.title || props.subtitle) && (
        <div className="motion-path-editor__header">
          {props.title && <h3 className="motion-path-editor__title">{props.title}</h3>}
          {props.subtitle && <p className="motion-path-editor__subtitle">{props.subtitle}</p>}
        </div>
      )}

      <div className="motion-path-editor__trigger-row">
        <label className="motion-path-editor__label" htmlFor="mp-trigger">
          Trigger
        </label>
        <select
          id="mp-trigger"
          className="data-panel__add-input"
          value={triggerKind}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'none') {
              props.onTriggerChange?.(undefined);
              return;
            }
            const kind = v as TriggerConfig['kind'];
            if (kind === 'on_click' || kind === 'on_enter' || kind === 'on_hover') {
              props.onTriggerChange?.({ kind });
            } else {
              props.onTriggerChange?.({ kind, seconds: 1, debounceMs: 0 });
            }
          }}
          data-testid="motion-path-trigger"
          disabled={props.readOnly}
        >
          <option value="none">None (manual)</option>
          {TRIGGER_KINDS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          type="button"
          className="motion-path-editor__btn"
          onClick={() => props.onChange(null)}
          disabled={props.readOnly}
          data-testid="motion-path-clear"
        >
          Clear path
        </button>
      </div>

      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="motion-path-editor__canvas"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-testid="motion-path-canvas"
      >
        {/* Grid */}
        <defs>
          <pattern id="mp-grid" width={20} height={20} patternUnits="userSpaceOnUse">
            <path d={`M 20 0 L 0 0 0 20`} fill="none" stroke="var(--border, #333)" strokeOpacity={0.4} strokeWidth={0.5} />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#mp-grid)" />

        {/* Centre cross */}
        <line x1={centreX} x2={centreX} y1={0} y2={height} stroke="var(--border, #555)" strokeDasharray="2,4" strokeOpacity={0.4} />
        <line y1={centreY} y2={centreY} x1={0} x2={width} stroke="var(--border, #555)" strokeDasharray="2,4" strokeOpacity={0.4} />
        <circle cx={centreX} cy={centreY} r={3} fill="var(--muted, #666)" />

        {/* Bezier handle segments (dashed lines from each anchor to its control) */}
        {working.keyframes.map((kf, i) => {
          if (!kf.controlOut) return null;
          const anchor = pathToSvg(kf.x, kf.y);
          const handle = { x: anchor.x + kf.controlOut.x, y: anchor.y + kf.controlOut.y };
          return (
            <line
              key={`handle-${i}`}
              x1={anchor.x}
              y1={anchor.y}
              x2={handle.x}
              y2={handle.y}
              stroke="var(--accent, #58a6ff)"
              strokeOpacity={0.4}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          );
        })}

        {/* Path */}
        <path d={pathD} fill="none" stroke="var(--accent, #58a6ff)" strokeWidth={2} />

        {/* Anchor points */}
        {working.keyframes.map((kf, i) => {
          const p = pathToSvg(kf.x, kf.y);
          return (
            <g key={`kf-${i}`}>
              <circle
                cx={p.x}
                cy={p.y}
                r={6}
                fill="var(--bg, #fff)"
                stroke="var(--accent, #58a6ff)"
                strokeWidth={2}
                style={{ cursor: props.readOnly ? 'default' : 'grab' }}
                onPointerDown={beginDrag(i, 'anchor')}
                data-testid={`motion-path-anchor-${i}`}
              />
              <text
                x={p.x + 8}
                y={p.y - 8}
                fontSize={9}
                fill="var(--muted, #888)"
                pointerEvents="none"
              >
                {Math.round(kf.timeMs)}ms
              </text>
            </g>
          );
        })}

        {/* Handle points */}
        {working.keyframes.map((kf, i) => {
          if (!kf.controlOut) return null;
          const anchor = pathToSvg(kf.x, kf.y);
          const handle = { x: anchor.x + kf.controlOut.x, y: anchor.y + kf.controlOut.y };
          return (
            <circle
              key={`handle-pt-${i}`}
              cx={handle.x}
              cy={handle.y}
              r={4}
              fill="var(--accent, #58a6ff)"
              style={{ cursor: props.readOnly ? 'default' : 'grab' }}
              onPointerDown={beginDrag(i, 'handle')}
              data-testid={`motion-path-handle-${i}`}
            />
          );
        })}

        {/* Live preview dot */}
        {(() => {
          const p = pathToSvg(sample.x - working.origin.x, sample.y - working.origin.y);
          return (
            <circle
              cx={p.x}
              cy={p.y}
              r={5}
              fill="var(--success, #3fb950)"
              stroke="white"
              strokeWidth={1.5}
              data-testid="motion-path-preview-dot"
            />
          );
        })()}
      </svg>

      <div className="motion-path-editor__keyframe-list">
        <div className="motion-path-editor__section-title">
          <span>Keyframes ({working.keyframes.length})</span>
          <button
            type="button"
            className="motion-path-editor__btn"
            onClick={handleAddKeyframe}
            disabled={props.readOnly}
            data-testid="motion-path-add-keyframe"
          >
            + Add keyframe
          </button>
        </div>
        {working.keyframes.map((kf, i) => (
          <div key={`kf-row-${i}`} className="motion-path-editor__kf-row" data-testid={`motion-path-kf-${i}`}>
            <span className="motion-path-editor__kf-idx">{i}</span>
            <label className="motion-path-editor__field">
              <span>time (ms)</span>
              <input
                type="number"
                min={0}
                max={props.durationMs}
                value={kf.timeMs}
                onChange={(e) => handleKeyframeTimeChange(i, Number(e.target.value))}
                disabled={props.readOnly}
                className="data-panel__add-input"
                data-testid={`motion-path-kf-time-${i}`}
              />
            </label>
            <label className="motion-path-editor__field">
              <span>x</span>
              <input
                type="number"
                value={Math.round(kf.x)}
                onChange={(e) => {
                  const next = updateKeyframe(working, i, (k) => ({ ...k, x: Number(e.target.value) }));
                  props.onChange(next);
                }}
                disabled={props.readOnly}
                className="data-panel__add-input"
                data-testid={`motion-path-kf-x-${i}`}
              />
            </label>
            <label className="motion-path-editor__field">
              <span>y</span>
              <input
                type="number"
                value={Math.round(kf.y)}
                onChange={(e) => {
                  const next = updateKeyframe(working, i, (k) => ({ ...k, y: Number(e.target.value) }));
                  props.onChange(next);
                }}
                disabled={props.readOnly}
                className="data-panel__add-input"
                data-testid={`motion-path-kf-y-${i}`}
              />
            </label>
            <label className="motion-path-editor__field">
              <span>easing</span>
              <input
                type="text"
                value={kf.easing ?? ''}
                placeholder="linear"
                onChange={(e) => handleKeyframeEasingChange(i, e.target.value)}
                disabled={props.readOnly}
                className="data-panel__add-input"
                data-testid={`motion-path-kf-easing-${i}`}
              />
            </label>
            <button
              type="button"
              className="motion-path-editor__btn motion-path-editor__btn--danger"
              onClick={() => handleRemoveKeyframe(i)}
              disabled={props.readOnly || working.keyframes.length <= 2}
              data-testid={`motion-path-kf-remove-${i}`}
              title="Remove keyframe"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="motion-path-editor__easing-editor">
        <div className="motion-path-editor__section-title">
          <span>Per-keyframe easing curve</span>
          <span className="motion-path-editor__hint">
            Edit bezier control points visually. Applies to the segment leaving keyframe 0.
          </span>
        </div>
        <KeyframeEasingEditor
          keyframe={working.keyframes[0]}
          onChange={(tuple) => handleKeyframeEasingChange(0, formatBezierTuple(tuple))}
          disabled={props.readOnly}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-keyframe easing sub-editor
// ---------------------------------------------------------------------------

interface KeyframeEasingEditorProps {
  keyframe: MotionPathKeyframe | undefined;
  onChange: (tuple: [number, number, number, number]) => void;
  disabled?: boolean | undefined;
}

function KeyframeEasingEditor(props: KeyframeEasingEditorProps): ReactElement {
  const tuple = useMemo<[number, number, number, number]>(() => {
    const parsed = props.keyframe?.easing ? parseBezierTuple(props.keyframe.easing) : null;
    return parsed ?? [0.42, 0, 0.58, 1];
  }, [props.keyframe?.easing]);
  return (
    <EasingBezierEditor
      value={tuple}
      onChange={props.onChange}
      size={160}
      {...(props.disabled !== undefined ? { readOnly: props.disabled } : {})}
      id="motion-path-easing-editor"
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function updateKeyframe(
  path: MotionPath,
  idx: number,
  fn: (kf: MotionPathKeyframe) => MotionPathKeyframe,
): MotionPath {
  const next = path.keyframes.map((kf, i) => (i === idx ? fn(kf) : kf));
  next.sort((a, b) => a.timeMs - b.timeMs);
  return { ...path, keyframes: next };
}

function buildPathD(path: MotionPath): string {
  if (path.keyframes.length === 0) return '';
  const kfs = path.keyframes;
  const first = kfs[0]!;
  const cmds: string[] = [`M ${first.x},${first.y}`];
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i]!;
    const b = kfs[i + 1]!;
    const cOut = a.controlOut;
    const c1 = cOut ? `${a.x + cOut.x},${a.y + cOut.y}` : `${a.x},${a.y}`;
    cmds.push(`C ${c1} ${b.x},${b.y} ${b.x},${b.y}`);
  }
  if (path.closed) {
    const last = kfs[kfs.length - 1]!;
    cmds.push('Z');
    void last; // satisfy noUnusedLocals
  }
  return cmds.join(' ');
}
