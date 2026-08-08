/**
 * useRecorder — React hook driving @domio/recording-extensions.
 *
 * Phase 21 W1.7. Wraps `startMultiTrackRecorder` with a stable handle +
 * React state for the editor's recording panel. Plugs in
 * `BrowserMediaSourceFactory` for real `getDisplayMedia` + `getUserMedia`
 * requests in the browser.
 *
 * State surface:
 *   - status: 'idle' | 'starting' | 'recording' | 'paused' | 'stopping' | 'finalized' | 'error'
 *   - tracks: per-track state map (MediaRecorder lifecycle)
 *   - progress: per-track chunk counts
 *   - lastChunk: most recent ChunkProgressEvent for the progress UI
 *   - error: user-visible error if status === 'error'
 *
 * Tests inject a `MediaSourceFactory` and `ChunkUploader` so this hook
 * can run under jsdom without real devices.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TrackKind } from '@domio/object-store';
import {
  BrowserMediaSourceFactory,
  type ChunkProgressEvent,
  type ChunkUploader,
  type MediaSourceFactory,
  type RecorderConfig,
  type RecorderHandle,
  type TrackStateEvent,
} from '@domio/recording-extensions';

export type RecorderStatus =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'finalized'
  | 'error';

export interface UseRecorderOptions {
  readonly workspace_id: string;
  readonly recording_session_id: string;
  readonly tracks: readonly TrackKind[];
  readonly chunk_ms?: number;
  readonly mime_type?: string;
  readonly bits_per_second?: number;
  /** Injectable for tests; defaults to BrowserMediaSourceFactory. */
  readonly source?: MediaSourceFactory;
  /** Injectable for tests; defaults to ObjectStoreUploader (browser S3/MinIO). */
  readonly uploader?: ChunkUploader;
  /** chunk_ms default 1000ms. */
}

export interface UseRecorderResult {
  readonly status: RecorderStatus;
  readonly trackStates: ReadonlyMap<TrackKind, string>;
  readonly progress: ReadonlyMap<TrackKind, number>;
  readonly lastChunk: ChunkProgressEvent | null;
  readonly error: string | null;
  readonly start: () => Promise<void>;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly stop: () => Promise<void>;
}

export function useRecorder(opts: UseRecorderOptions): UseRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [trackStates, setTrackStates] = useState<ReadonlyMap<TrackKind, string>>(new Map());
  const [progress, setProgress] = useState<ReadonlyMap<TrackKind, number>>(new Map());
  const [lastChunk, setLastChunk] = useState<ChunkProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<RecorderHandle | null>(null);
  // The recorder is built lazily — we need the factory at start time, not
  // every render, to avoid recreating the BrowserMediaSourceFactory.
  const factoryRef = useRef<MediaSourceFactory | null>(null);
  if (factoryRef.current === null) {
    factoryRef.current = opts.source ?? new BrowserMediaSourceFactory();
  }

  // Avoid recreating the factory on every render when opts.source changes.
  // We only honor the latest injected factory at start() time.
  useEffect(() => {
    factoryRef.current = opts.source ?? new BrowserMediaSourceFactory();
  }, [opts.source]);

  const start = useCallback(async () => {
    if (status !== 'idle' && status !== 'finalized' && status !== 'error') {
      return;
    }
    setStatus('starting');
    setError(null);
    setTrackStates(new Map());
    setProgress(new Map());
    setLastChunk(null);
    try {
      // Lazy-load startMultiTrackRecorder so SSR doesn't trip on the import.
      const mod = await import('@domio/recording-extensions');
      const recorderConfig: RecorderConfig = {
        workspace_id: opts.workspace_id,
        recording_session_id: opts.recording_session_id,
        tracks: opts.tracks,
        ...(opts.chunk_ms !== undefined ? { chunk_ms: opts.chunk_ms } : {}),
        ...(opts.mime_type !== undefined ? { mime_type: opts.mime_type } : {}),
        ...(opts.bits_per_second !== undefined ? { bits_per_second: opts.bits_per_second } : {}),
        on_chunk: (event: ChunkProgressEvent) => {
          setLastChunk(event);
          setProgress((prev) => {
            const next = new Map(prev);
            next.set(event.track_kind, event.sequence + 1);
            return next;
          });
        },
        on_track_state: (event: TrackStateEvent) => {
          setTrackStates((prev) => {
            const next = new Map(prev);
            next.set(event.track_kind, event.state);
            return next;
          });
          if (event.state === 'errored' && event.error) {
            setError(event.error);
            setStatus('error');
          }
        },
      };
      const handle = await mod.startMultiTrackRecorder({
        config: recorderConfig,
        uploader: opts.uploader as ChunkUploader,
        source: factoryRef.current as MediaSourceFactory,
      });
      handleRef.current = handle;
      setStatus('recording');
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }, [
    opts.workspace_id,
    opts.recording_session_id,
    opts.tracks,
    opts.chunk_ms,
    opts.mime_type,
    opts.bits_per_second,
    opts.uploader,
    status,
  ]);

  const pause = useCallback(() => {
    handleRef.current?.pause();
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    handleRef.current?.resume();
    setStatus('recording');
  }, []);

  const stop = useCallback(async () => {
    if (!handleRef.current) return;
    setStatus('stopping');
    try {
      await handleRef.current.stop();
      setStatus('finalized');
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    } finally {
      handleRef.current = null;
    }
  }, []);

  return useMemo(
    () => ({ status, trackStates, progress, lastChunk, error, start, pause, resume, stop }),
    [status, trackStates, progress, lastChunk, error, start, pause, resume, stop],
  );
}
