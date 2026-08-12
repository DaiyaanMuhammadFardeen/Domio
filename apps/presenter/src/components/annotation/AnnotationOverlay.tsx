'use client';

/**
 * AnnotationOverlay — the on-slide overlay that combines canvas + toolbar.
 *
 * Lifecycle:
 *   1. Mount → load existing layers for the current slide via AnnotationClient.list.
 *   2. Pen strokes complete → onStrokeComplete → AnnotationClient.commit.
 *   3. Save button → AnnotationClient.promote (latest ephemeral → saved overlay).
 *   4. Undo button → AnnotationClient.rollback (latest ephemeral).
 *   5. Slide changes → reset layers to those for the new slide id.
 *
 * When the parent passes a new `slideId`, this overlay clears its
 * in-progress stroke and re-fetches.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnnotationClient, type AnnotationClientError, type AnnotationCommitBody, type AnnotationLayerDto } from '../../lib/annotation-service';
import type { AnnotationKind, PenGeometry } from '@domio/annotation-engine';
import { AnnotationCanvas, type AnnotationCanvasHandle } from './AnnotationCanvas';
import { InkToolbar } from './InkToolbar';

export interface AnnotationOverlayProps {
  sessionId: string;
  slideId: string;
  presenterId: string;
  displayName?: string;
  apiBaseUrl?: string;
  disabled?: boolean;
}

const DEFAULT_COLOR = '#f85149';
const DEFAULT_WIDTH = 4;

export function AnnotationOverlay(props: AnnotationOverlayProps) {
  const { sessionId, slideId, presenterId, displayName, apiBaseUrl, disabled } = props;
  const client = useMemo(() => new AnnotationClient({ baseUrl: apiBaseUrl ?? '' }), [apiBaseUrl]);
  const canvasRef = useRef<AnnotationCanvasHandle | null>(null);
  const [layers, setLayers] = useState<AnnotationLayerDto[]>([]);
  const [tool, setTool] = useState<AnnotationKind | null>(null);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  // Load layers for the active slide; reset when slideId changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await client.list(sessionId, true);
        if (!cancelled) setLayers(items);
      } catch (e) {
        const err = e as AnnotationClientError;
        if (!cancelled) setStatus({ kind: 'error', message: `load failed: HTTP ${err.status}` });
      }
    })();
    return () => { cancelled = true; };
  }, [client, sessionId, slideId]);

  const slideLayers = useMemo(
    () => layers.filter((l) => l.slide_id === slideId && l.ephemeral),
    [layers, slideId],
  );

  const onStrokeComplete = useCallback(async (geom: PenGeometry) => {
    try {
      const commitBody: AnnotationCommitBody = {
        slide_id: slideId,
        kind: tool === 'highlighter' ? 'highlighter' : 'pen',
        geometry: geom,
        color,
        stroke_width: width,
        ephemeral: true,
        drawn_by: presenterId,
      };
      if (displayName !== undefined) commitBody.drawn_by_display_name = displayName;
      const layer = await client.commit(sessionId, commitBody);
      setLayers((prev) => [...prev, layer]);
      setStatus({ kind: 'ok', message: 'stroke committed' });
    } catch (e) {
      const err = e as AnnotationClientError;
      setStatus({ kind: 'error', message: `commit failed: HTTP ${err.status}` });
    }
  }, [client, sessionId, slideId, tool, color, width, presenterId, displayName]);

  // Latest ephemeral for undo/save (last in slideLayers).
  const latest = slideLayers.length > 0 ? slideLayers[slideLayers.length - 1] : null;

  const onUndo = useCallback(async () => {
    if (!latest) return;
    try {
      await client.rollback(sessionId, latest.id);
      setLayers((prev) => prev.filter((l) => l.id !== latest.id));
      setStatus({ kind: 'ok', message: 'rolled back last stroke' });
    } catch (e) {
      const err = e as AnnotationClientError;
      setStatus({ kind: 'error', message: `undo failed: HTTP ${err.status}` });
    }
  }, [client, sessionId, latest]);

  const onSave = useCallback(async () => {
    if (!latest) return;
    try {
      const promoted = await client.promote(sessionId, latest.id);
      setLayers((prev) => prev.map((l) => (l.id === promoted.id ? promoted : l)));
      setStatus({ kind: 'ok', message: 'saved to slide' });
    } catch (e) {
      const err = e as AnnotationClientError;
      setStatus({ kind: 'error', message: `save failed: HTTP ${err.status}` });
    }
  }, [client, sessionId, latest]);

  return (
    <div className="annotation-overlay">
      <InkToolbar
        tool={tool}
        color={color}
        strokeWidth={width}
        onToolChange={setTool}
        onColorChange={setColor}
        onStrokeWidthChange={setWidth}
        onUndo={onUndo}
        onSave={onSave}
        canUndo={!!latest}
        canSave={!!latest}
        disabled={disabled === true}
      />
      <div className="annotation-overlay__stage">
        <AnnotationCanvas
          ref={canvasRef}
          layers={layers}
          slideId={slideId}
          tool={tool}
          color={color}
          strokeWidth={width}
          enabled={!disabled}
          onStrokeComplete={onStrokeComplete}
        />
        {status && (
          <div className={`annotation-overlay__status annotation-overlay__status--${status.kind}`} role="status" aria-live="polite">
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}