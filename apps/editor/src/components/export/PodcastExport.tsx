'use client';

/**
 * PodcastExport — Deck-to-podcast export surface.
 *
 * Per Wave 11 §S11.12 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Layout:
 *   1. Deck selector (defaults to the current deck).
 *   2. Script editor — a list of two-voice segments (Host + Guest) each
 *      with text + slide reference, with Add/Remove buttons.
 *   3. Action row — Generate / Regenerate / Save / Render MP3.
 *   4. Progress bar while a render is in flight.
 *   5. On completion: download link + HTML5 audio preview player.
 *
 * Today the underlying pipeline is a deterministic bootstrap (see
 * `podcast-export-service`). The TTS service will replace `startRender`
 * + `getRenderStatus` in a later wave.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';
import {
  generateScript,
  getDraft,
  getRenderStatus,
  saveDraft,
  startRender,
  type PodcastDraft,
  type PodcastRender,
  type ScriptSegment,
  type Voice,
} from '../../lib/podcast-export-service.js';
import { PodcastPreviewPlayer } from './PodcastPreviewPlayer.js';
import { ScriptSegmentRow } from './ScriptSegmentRow.js';

const DEFAULT_DECK_ID = 'demo';

const SLIDE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = Array.from(
  { length: 12 },
  (_, i) => ({ id: `slide-${i + 1}`, label: `Slide ${i + 1}` }),
);

const POLL_MS = 1500;

export interface PodcastExportProps {
  readonly currentDeckId?: string;
  readonly dataTestId?: string;
}

type ActionState =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'saving' }
  | { kind: 'rendering'; renderId: string }
  | { kind: 'saved'; atMs: number }
  | { kind: 'error'; message: string };

function genLocalId(): string {
  return `seg-local-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function nextOrder(segments: ReadonlyArray<ScriptSegment>): number {
  return segments.length === 0 ? 0 : (segments[segments.length - 1]?.order ?? 0) + 1;
}

export function PodcastExport({
  currentDeckId = DEFAULT_DECK_ID,
  dataTestId = 'podcast-export',
}: PodcastExportProps): ReactElement {
  const [deckId, setDeckId] = useState<string>(currentDeckId);
  const [draft, setDraft] = useState<PodcastDraft | null>(null);
  const [render, setRender] = useState<PodcastRender | null>(null);
  const [state, setState] = useState<ActionState>({ kind: 'idle' });
  const pollHandleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load existing draft when deck id changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const existing = await getDraft(deckId);
      if (cancelled) return;
      setDraft(existing);
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  // Cleanup polling on unmount.
  useEffect(() => {
    return () => {
      if (pollHandleRef.current) clearInterval(pollHandleRef.current);
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollHandleRef.current) {
      clearInterval(pollHandleRef.current);
      pollHandleRef.current = null;
    }
  }, []);

  const onGenerate = useCallback(async () => {
    setState({ kind: 'generating' });
    try {
      const next = await generateScript(deckId);
      setDraft(next);
      setRender(null);
      setState({ kind: 'idle' });
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  }, [deckId]);

  const onSave = useCallback(async () => {
    if (!draft) return;
    setState({ kind: 'saving' });
    try {
      const saved = await saveDraft(draft);
      setDraft(saved);
      setState({ kind: 'saved', atMs: Date.now() });
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  }, [draft]);

  const onRender = useCallback(async () => {
    if (!draft) return;
    setState({ kind: 'rendering', renderId: '' });
    try {
      const queued = await startRender(draft.id);
      setRender(queued);
      setState({ kind: 'rendering', renderId: queued.id });
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  }, [draft]);

  // Poll render progress while rendering.
  useEffect(() => {
    if (state.kind !== 'rendering' || !state.renderId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await getRenderStatus(state.kind === 'rendering' ? state.renderId : '');
        if (cancelled) return;
        setRender(next);
        if (next.status === 'complete' || next.status === 'failed') {
          stopPolling();
          if (next.status === 'failed') {
            setState({ kind: 'error', message: next.error ?? 'Render failed.' });
          } else {
            setState({ kind: 'idle' });
          }
        }
      } catch (err) {
        if (cancelled) return;
        stopPolling();
        setState({ kind: 'error', message: (err as Error).message });
      }
    };
    void tick();
    pollHandleRef.current = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [state, stopPolling]);

  const onSegmentChange = useCallback((idx: number, next: ScriptSegment) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const segments = prev.segments.map((s, i) => (i === idx ? next : s));
      return { ...prev, segments, updated_at_ms: Date.now() };
    });
  }, []);

  const onSegmentRemove = useCallback((idx: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const segments = prev.segments
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, order: i }));
      return { ...prev, segments, updated_at_ms: Date.now() };
    });
  }, []);

  const onAddSegment = useCallback(() => {
    setDraft((prev) => {
      if (!prev) return prev;
      const order = nextOrder(prev.segments);
      const voice: Voice = order % 2 === 0 ? 'host' : 'guest';
      const segments: ScriptSegment[] = [
        ...prev.segments,
        { id: genLocalId(), voice, text: '', order },
      ];
      return { ...prev, segments, updated_at_ms: Date.now() };
    });
  }, []);

  const isRendering = state.kind === 'rendering';
  const isGenerating = state.kind === 'generating';
  const showProgress = isRendering && render !== null;
  const progressPct = render?.progress ?? 0;
  const isComplete = render?.status === 'complete' && typeof render.audio_url === 'string';

  const downloadHref = render?.audio_url;
  const audioUrl = render?.audio_url;

  const deckOptions = useMemo(
    () => [currentDeckId, deckId].filter((v, i, arr) => arr.indexOf(v) === i),
    [currentDeckId, deckId],
  );

  return (
    <section
      data-testid={dataTestId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 16,
        borderRadius: 8,
        background: '#fafafa',
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <header>
        <h2 style={{ margin: 0, fontSize: 18 }}>
          <FormattedMessage id="editor.podcast.heading" />
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(0,0,0,0.6)' }}>
          <FormattedMessage id="editor.podcast.subheading" />
        </p>
      </header>

      <label
        style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, maxWidth: 320 }}
      >
        <span>Deck</span>
        <select
          data-testid={`${dataTestId}-deck`}
          value={deckId}
          onChange={(e) => setDeckId(e.target.value)}
          style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.2)' }}
        >
          {deckOptions.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>

      {draft ? (
        <div
          data-testid={`${dataTestId}-segments`}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {draft.segments.map((seg, idx) => (
            <ScriptSegmentRow
              key={seg.id}
              segment={seg}
              slideOptions={SLIDE_OPTIONS}
              onChange={(next) => onSegmentChange(idx, next)}
              onRemove={() => onSegmentRemove(idx)}
              dataTestId={`${dataTestId}-segment-${idx}`}
            />
          ))}
          <button
            type="button"
            onClick={onAddSegment}
            data-testid={`${dataTestId}-add-segment`}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 12px',
              borderRadius: 4,
              border: '1px dashed rgba(0,0,0,0.3)',
              background: '#fff',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <FormattedMessage id="editor.podcast.segment.add" />
          </button>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating || isRendering}
          data-testid={`${dataTestId}-generate`}
          style={btnStyle('primary')}
        >
          {isGenerating ? (
            <FormattedMessage id="editor.podcast.actions.generating" />
          ) : draft ? (
            <FormattedMessage id="editor.podcast.actions.regenerate" />
          ) : (
            <FormattedMessage id="editor.podcast.actions.generate" />
          )}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!draft || isRendering || isGenerating || state.kind === 'saving'}
          data-testid={`${dataTestId}-save`}
          style={btnStyle('secondary')}
        >
          <FormattedMessage id="editor.podcast.actions.save" />
        </button>
        <button
          type="button"
          onClick={onRender}
          disabled={!draft || isRendering || isGenerating}
          data-testid={`${dataTestId}-render`}
          style={btnStyle('primary')}
        >
          <FormattedMessage id="editor.podcast.actions.render" />
        </button>
      </div>

      {showProgress ? (
        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          data-testid={`${dataTestId}-progress`}
          style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          <div
            style={{
              width: '100%',
              height: 8,
              borderRadius: 4,
              background: 'rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                background: '#3b82f6',
                transition: 'width 200ms ease',
              }}
            />
          </div>
          <span
            data-testid={`${dataTestId}-progress-label`}
            style={{ fontSize: 11, color: 'rgba(0,0,0,0.6)' }}
          >
            <FormattedMessage
              id={
                isRendering ? 'editor.podcast.actions.rendering' : 'editor.podcast.actions.progress'
              }
              values={{ pct: progressPct }}
            />
          </span>
        </div>
      ) : null}

      {state.kind === 'saved' ? (
        <div data-testid={`${dataTestId}-saved`} style={{ fontSize: 12, color: '#059669' }}>
          <FormattedMessage id="editor.podcast.actions.saved" />
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div
          role="alert"
          data-testid={`${dataTestId}-error`}
          style={{ fontSize: 12, color: '#dc2626' }}
        >
          <FormattedMessage id="editor.podcast.actions.failed" values={{ error: state.message }} />
        </div>
      ) : null}

      {isComplete && downloadHref ? (
        <div
          data-testid={`${dataTestId}-complete`}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <a
            href={downloadHref}
            download
            data-testid={`${dataTestId}-download`}
            style={{
              alignSelf: 'flex-start',
              padding: '8px 14px',
              borderRadius: 4,
              background: '#059669',
              color: '#fff',
              textDecoration: 'none',
              fontSize: 13,
            }}
          >
            <FormattedMessage id="editor.podcast.actions.download" />
          </a>
          {audioUrl ? <PodcastPreviewPlayer audioUrl={audioUrl} /> : null}
        </div>
      ) : null}
    </section>
  );
}

type ButtonVariant = 'primary' | 'secondary';

function btnStyle(variant: ButtonVariant): React.CSSProperties {
  if (variant === 'primary') {
    return {
      padding: '8px 14px',
      borderRadius: 4,
      border: 'none',
      background: '#3b82f6',
      color: '#fff',
      fontSize: 13,
      cursor: 'pointer',
    };
  }
  return {
    padding: '8px 14px',
    borderRadius: 4,
    border: '1px solid rgba(0,0,0,0.2)',
    background: '#fff',
    color: 'rgba(0,0,0,0.85)',
    fontSize: 13,
    cursor: 'pointer',
  };
}
