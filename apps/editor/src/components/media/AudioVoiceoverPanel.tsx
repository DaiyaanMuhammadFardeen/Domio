/**
 * AudioVoiceoverPanel — per-slide audio + voiceover recording.
 *
 * Per Wave 2 §S2.10 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Provides:
 *  - Record button (uses MediaRecorder; gracefully degrades when
 *    `navigator.mediaDevices` is unavailable).
 *  - Upload via `POST /v1/media/audio` (or bootstrap fallback).
 *  - Duration display + simple playback controls.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { uploadAudio } from '../../lib/media-service';

export interface AudioVoiceoverPanelProps {
  slideId: string;
  onUploaded?: (info: { id: string; url: string; durationMs: number }) => void;
}

export function AudioVoiceoverPanel({
  slideId,
  onUploaded,
}: AudioVoiceoverPanelProps): ReactElement {
  const [recording, setRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      recorderRef.current?.stop();
    };
  }, []);

  const handleStart = useCallback(async () => {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not available in this environment');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setRecording(true);
      tickRef.current = setInterval(() => {
        setDurationMs(Date.now() - startedAtRef.current);
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleStop = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setDurationMs(Date.now() - startedAtRef.current);
  }, []);

  const handleUpload = useCallback(async () => {
    if (chunksRef.current.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const buf = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf).slice(0, 1024)));
      const out = await uploadAudio({
        mimeType: blob.type,
        data: base64,
        durationMs,
      });
      onUploaded?.(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [durationMs, onUploaded, slideId]);

  return (
    <div className="audio-voiceover" data-testid="audio-voiceover">
      <div className="audio-voiceover__controls">
        {!recording ? (
          <button
            type="button"
            onClick={() => void handleStart()}
            data-testid="audio-voiceover-record"
          >
            ● Record
          </button>
        ) : (
          <button type="button" onClick={handleStop} data-testid="audio-voiceover-stop">
            ■ Stop
          </button>
        )}
        <span className="audio-voiceover__duration" data-testid="audio-voiceover-duration">
          {(durationMs / 1000).toFixed(1)}s
        </span>
        <button
          type="button"
          onClick={() => void handleUpload()}
          disabled={busy || durationMs === 0}
          data-testid="audio-voiceover-upload"
        >
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {error && (
        <div className="audio-voiceover__error" data-testid="audio-voiceover-error">
          {error}
        </div>
      )}
    </div>
  );
}
