'use client';

/**
 * AICoach — Wave 6 §S6.7.
 *
 * Webcam + mic rehearsal coach.
 *  - Live WPM gauge (PaceTracker).
 *  - Live filler-word counter (FillerWordCounter).
 *  - Live eye-contact meter (EyeContactMeter).
 *  - End of rehearsal: heatmap of pace per slide, top filler words,
 *    slides where the presenter stumbled. The full session is submitted
 *    to POST /v1/ai/rehearsal-feedback and structured feedback is
 *    rendered below.
 *
 * The actual MediaRecorder pipeline is started with `navigator.mediaDevices.getUserMedia`.
 * In the SSR build this component is a client component and is only
 * rendered after hydration so we never touch `navigator` on the server.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { PaceTracker } from './PaceTracker';
import { FillerWordCounter, type FillerPhraseCount } from './FillerWordCounter';
import { EyeContactMeter } from './EyeContactMeter';
import {
  submitRehearsalFeedback,
  type RehearsalFeedback,
  type RehearsalSlideTelemetry,
} from './rehearsal-service';

export interface AICoachSlide {
  slide_id: string;
  title?: string;
  target_ms?: number;
}

export interface AICoachProps {
  /** Session id (e.g. presenter session id). */
  sessionId: string;
  /** Deck id being rehearsed. */
  deckId: string;
  /** Slide list — used to build per-slide telemetry. */
  slides: readonly AICoachSlide[];
  /** Optional override for the testid. */
  dataTestId?: string;
}

// ─── Filler detection ───────────────────────────────────────────────────────

const FILLER_PHRASES: readonly string[] = ['um', 'uh', 'like', 'you know', 'so'];

/**
 * Count filler phrases in `text`. Matches are case-insensitive and
 * word-boundary aware (so "umbrella" does not trigger "um").
 */
function countFillers(text: string, phrases: readonly string[] = FILLER_PHRASES): FillerPhraseCount[] {
  if (!text) return [];
  const lc = text.toLowerCase();
  const out: FillerPhraseCount[] = [];
  for (const phrase of phrases) {
    // Build a word-boundary regex for single-word phrases; for multi-word
    // phrases ("you know") we use a non-letter lookaround.
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = phrase.includes(' ')
      ? new RegExp(`(^|\\W)${escaped}(?=\\W|$)`, 'gi')
      : new RegExp(`(^|\\W)${escaped}(?=\\W|$)`, 'gi');
    const matches = lc.match(re);
    if (matches && matches.length > 0) {
      out.push({ phrase, count: matches.length });
    }
  }
  return out;
}

/**
 * Approximate word-count of the transcript. Splits on whitespace and
 * filters out empty tokens.
 */
function wordCount(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─── Transcript buffer ──────────────────────────────────────────────────────

interface TranscriptSample {
  text: string;
  ts: number;
}

interface SlideTrace {
  slideId: string;
  samples: TranscriptSample[];
}

// ─── Component ──────────────────────────────────────────────────────────────

type CoachStatus = 'idle' | 'recording' | 'paused' | 'submitting' | 'feedback' | 'error';

export function AICoach({
  sessionId,
  deckId,
  slides,
  dataTestId = 'ai-coach',
}: AICoachProps): ReactElement {
  const [status, setStatus] = useState<CoachStatus>('idle');
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [liveWpm, setLiveWpm] = useState(0);
  const [liveFillerCounts, setLiveFillerCounts] = useState<FillerPhraseCount[]>([]);
  const [liveEyeContact, setLiveEyeContact] = useState(0);
  const [feedback, setFeedback] = useState<RehearsalFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const slideTracesRef = useRef<Map<string, SlideTrace>>(new Map());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<unknown>(null); // SpeechRecognition instance (browser-provided)
  const tickTimerRef = useRef<number | null>(null);

  // Stable refs for the current slide so callbacks don't capture stale values.
  const slidesRef = useRef(slides);
  slidesRef.current = slides;

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopMediaPipeline();
      if (tickTimerRef.current !== null) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };
  }, []);

  const ensureSlideTrace = useCallback((slideId: string): SlideTrace => {
    const existing = slideTracesRef.current.get(slideId);
    if (existing) return existing;
    const fresh: SlideTrace = { slideId, samples: [] };
    slideTracesRef.current.set(slideId, fresh);
    return fresh;
  }, []);

  const recordSample = useCallback((text: string, slideId: string) => {
    if (!text.trim()) return;
    const trace = ensureSlideTrace(slideId);
    trace.samples.push({ text, ts: Date.now() });
  }, [ensureSlideTrace]);

  // Live WPM tick — recompute from accumulated transcript every 2 s.
  useEffect(() => {
    if (status !== 'recording') return;
    tickTimerRef.current = window.setInterval(() => {
      const start = startedAtRef.current;
      if (!start) return;
      const elapsedMin = Math.max(1 / 60, (Date.now() - start) / 60_000);
      const wc = wordCount(transcript);
      const wpm = wc / elapsedMin;
      setLiveWpm(wpm);
      setLiveFillerCounts(countFillers(transcript));
    }, 2000);
    return () => {
      if (tickTimerRef.current !== null) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };
  }, [status, transcript]);

  // Build per-slide telemetry at end-of-session.
  const buildTelemetry = useCallback((): RehearsalSlideTelemetry[] => {
    const start = startedAtRef.current;
    if (!start) return [];
    const perSlide: RehearsalSlideTelemetry[] = [];

    for (const slide of slidesRef.current) {
      const trace = slideTracesRef.current.get(slide.slide_id);
      const samples = trace?.samples ?? [];
      const allText = samples.map((s) => s.text).join(' ');
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dwellMs = samples.length === 0 || !first || !last ? 0 : (last.ts - first.ts);
      const wc = wordCount(allText);
      const dwellMin = Math.max(1 / 60, dwellMs / 60_000);
      const wpm = dwellMs === 0 ? 0 : wc / dwellMin;
      const fillers = countFillers(allText);
      perSlide.push({
        slide_id: slide.slide_id,
        title: slide.title,
        dwell_ms: dwellMs,
        target_ms: slide.target_ms,
        pace_wpm: wpm,
        fillers,
        // Eye-contact is currently shared (no per-slide face-mesh split yet).
        eye_contact_pct: liveEyeContact,
        stumbled: false,
      });
    }
    return perSlide;
  }, [liveEyeContact]);

  const stopMediaPipeline = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
    const stream = mediaStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      mediaStreamRef.current = null;
    }
    // Stop speech recognition if available.
    const recog = recognitionRef.current as { stop?: () => void } | null;
    if (recog && typeof recog.stop === 'function') {
      try { recog.stop(); } catch { /* ignore */ }
    }
    recognitionRef.current = null;
  }, []);

  const onStart = useCallback(async () => {
    setError(null);
    setFeedback(null);
    setTranscript('');
    setLiveWpm(0);
    setLiveFillerCounts([]);
    setLiveEyeContact(0);
    slideTracesRef.current.clear();
    startedAtRef.current = Date.now();
    setCurrentSlideIndex(0);

    // Attempt to acquire webcam + mic; never block the UX on hardware
    // availability — the coach can still operate with a synthetic
    // transcript in environments without a camera.
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
          audio: true,
        });
        mediaStreamRef.current = stream;
        if (typeof MediaRecorder !== 'undefined') {
          const rec = new MediaRecorder(stream);
          mediaRecorderRef.current = rec;
          rec.start(1000);
        }
      } catch (err) {
        // Camera/mic not available — proceed in text-only mode.
        void err;
      }
    }

    // Optional speech-recognition for live transcript. Most browsers
    // gate this behind vendor prefixes; skip if not available.
    const w = typeof window !== 'undefined' ? window as unknown as Record<string, unknown> : null;
    const Ctor = w && (w['SpeechRecognition'] ?? w['webkitSpeechRecognition']);
    if (Ctor) {
      try {
        const recognition = new (Ctor as new () => {
          continuous: boolean;
          interimResults: boolean;
          lang: string;
          onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
          onerror: ((ev: unknown) => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
        })();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        const slideIdx = () => currentSlideIndex;
        recognition.onresult = (ev) => {
          for (let i = 0; i < ev.results.length; i++) {
            const result = ev.results[i];
            if (!result) continue;
            const alt = result[0];
            const text = alt?.transcript ?? '';
            if (!text) continue;
            const slide = slidesRef.current[slideIdx()];
            if (!slide) continue;
            recordSample(text, slide.slide_id);
          }
          const last = ev.results[ev.results.length - 1];
          const finalText = last ? Array.from(last).map((r) => r?.transcript ?? '').filter(Boolean).join(' ') : '';
          if (finalText) {
            setTranscript((prev) => `${prev} ${finalText}`.trim());
          }
        };
        recognition.onerror = () => { /* swallow */ };
        recognition.onend = () => { /* swallow */ };
        recognition.start();
        recognitionRef.current = recognition;
      } catch {
        // ignore — speech recognition not available
      }
    }

    setStatus('recording');
  }, [currentSlideIndex, recordSample]);

  const onPauseToggle = useCallback(() => {
    setStatus((prev) => (prev === 'recording' ? 'paused' : 'recording'));
    const rec = mediaRecorderRef.current;
    if (rec) {
      if (rec.state === 'recording') rec.pause();
      else if (rec.state === 'paused') rec.resume();
    }
  }, []);

  const onNextSlide = useCallback(() => {
    const next = currentSlideIndex + 1;
    if (next < slidesRef.current.length) {
      setCurrentSlideIndex(next);
    } else {
      setCurrentSlideIndex(slidesRef.current.length - 1);
    }
  }, [currentSlideIndex]);

  const onMarkStumble = useCallback(() => {
    const slide = slidesRef.current[currentSlideIndex];
    if (!slide) return;
    const trace = ensureSlideTrace(slide.slide_id);
    trace.samples.push({ text: '__stumble__', ts: Date.now() });
  }, [currentSlideIndex, ensureSlideTrace]);

  const onEnd = useCallback(async () => {
    stopMediaPipeline();
    const start = startedAtRef.current;
    if (!start) {
      setStatus('idle');
      return;
    }
    setStatus('submitting');
    const perSlide = buildTelemetry();
    const allText = Array.from(slideTracesRef.current.values())
      .flatMap((t) => t.samples.map((s) => s.text))
      .filter((t) => t !== '__stumble__')
      .join(' ');
    const elapsedMin = Math.max(1 / 60, (Date.now() - start) / 60_000);
    const totalWpm = wordCount(allText) / elapsedMin;
    const fillers = countFillers(allText);

    // Decorate per-slide telemetry with stumble flag.
    for (const slide of perSlide) {
      const trace = slideTracesRef.current.get(slide.slide_id);
      slide.stumbled = trace?.samples.some((s) => s.text === '__stumble__') ?? false;
    }

    try {
      const result = await submitRehearsalFeedback({
        session_id: sessionId,
        deck_id: deckId,
        total_ms: Date.now() - start,
        overall_wpm: totalWpm,
        fillers,
        eye_contact_pct: liveEyeContact,
        per_slide: perSlide,
        transcript: allText,
      });
      setFeedback(result);
      setStatus('feedback');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
      setStatus('error');
    }
  }, [buildTelemetry, deckId, liveEyeContact, sessionId, stopMediaPipeline]);

  // ─── Render helpers ─────────────────────────────────────────────────────

  const statusBadge = useMemo(() => {
    switch (status) {
      case 'idle': return { label: 'Idle', className: 'bg-slate-500/15 text-slate-300' };
      case 'recording': return { label: 'Live', className: 'bg-rose-500/15 text-rose-300' };
      case 'paused': return { label: 'Paused', className: 'bg-amber-500/15 text-amber-300' };
      case 'submitting': return { label: 'Submitting…', className: 'bg-blue-500/15 text-blue-300' };
      case 'feedback': return { label: 'Feedback ready', className: 'bg-emerald-500/15 text-emerald-300' };
      case 'error': return { label: 'Error', className: 'bg-rose-600/15 text-rose-300' };
    }
  }, [status]);

  const currentSlide = slides[currentSlideIndex];

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-4"
      data-testid={dataTestId}
    >
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-slate-100">AI rehearsal coach</h3>
          <span className="text-[11px] text-slate-500">
            {currentSlide ? `Slide ${currentSlideIndex + 1} / ${slides.length} — ${currentSlide.title ?? currentSlide.slide_id}` : 'No slides configured'}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge.className}`}
          data-testid={`${dataTestId}-status`}
        >
          {statusBadge.label}
        </span>
      </header>

      {/* Live metrics */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <PaceTracker wpm={liveWpm} />
        <FillerWordCounter counts={liveFillerCounts} elapsedMs={startedAtRef.current ? Date.now() - startedAtRef.current : 0} />
        <EyeContactMeter score={liveEyeContact} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {status === 'idle' && (
          <button
            type="button"
            onClick={onStart}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
            data-testid={`${dataTestId}-start`}
          >
            ▶ Start coaching
          </button>
        )}
        {(status === 'recording' || status === 'paused') && (
          <>
            <button
              type="button"
              onClick={onPauseToggle}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-400"
              data-testid={`${dataTestId}-pause`}
            >
              {status === 'paused' ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              type="button"
              onClick={onNextSlide}
              disabled={currentSlideIndex >= slides.length - 1}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-400 disabled:opacity-40"
              data-testid={`${dataTestId}-next-slide`}
            >
              ⏭ Next slide
            </button>
            <button
              type="button"
              onClick={onMarkStumble}
              className="rounded-md border border-amber-600/60 px-3 py-1.5 text-xs text-amber-200 hover:border-amber-400"
              data-testid={`${dataTestId}-stumble`}
            >
              ⚠ Mark stumble
            </button>
            <button
              type="button"
              onClick={onEnd}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500"
              data-testid={`${dataTestId}-end`}
            >
              ⏹ End & get feedback
            </button>
          </>
        )}
        {(status === 'feedback' || status === 'error') && (
          <button
            type="button"
            onClick={() => {
              setStatus('idle');
              setFeedback(null);
              setError(null);
            }}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-400"
            data-testid={`${dataTestId}-reset`}
          >
            ↻ New session
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-md border border-rose-700/60 bg-rose-900/20 p-2 text-xs text-rose-200"
          data-testid={`${dataTestId}-error`}
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className="flex flex-col gap-2" data-testid={`${dataTestId}-feedback`}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {feedback.offline ? 'Offline feedback' : 'Coach feedback'}
          </h4>

          <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {feedback.scores.map((s) => (
              <li
                key={s.key}
                className="rounded-md border border-slate-700/60 bg-slate-800/40 p-2"
                data-testid={`${dataTestId}-score-${s.key}`}
              >
                <p className="text-[10px] uppercase text-slate-500">{s.key.replace('_', ' ')}</p>
                <p className="text-lg font-semibold tabular-nums text-slate-100">{s.score}</p>
                <p className="text-[11px] text-slate-400">{s.summary}</p>
              </li>
            ))}
          </ul>

          {feedback.top_fillers.length > 0 && (
            <div
              className="rounded-md border border-slate-700/60 bg-slate-800/40 p-2"
              data-testid={`${dataTestId}-top-fillers`}
            >
              <p className="text-[11px] font-medium text-slate-300">Top filler words</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {feedback.top_fillers.map((f) => (
                  <li
                    key={f.phrase}
                    className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[11px] text-slate-200"
                    data-testid={`${dataTestId}-filler-${f.phrase}`}
                  >
                    {f.phrase} × {f.count}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {feedback.stumbled_slides.length > 0 && (
            <div
              className="rounded-md border border-amber-700/60 bg-amber-900/15 p-2"
              data-testid={`${dataTestId}-stumbles`}
            >
              <p className="text-[11px] font-medium text-amber-300">Stumbled on</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {feedback.stumbled_slides.map((s) => (
                  <li
                    key={s.slide_id}
                    className="text-[11px] text-amber-200"
                    data-testid={`${dataTestId}-stumble-${s.slide_id}`}
                  >
                    {s.slide_id}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {feedback.pace_heatmap.length > 0 && (
            <div
              className="rounded-md border border-slate-700/60 bg-slate-800/40 p-2"
              data-testid={`${dataTestId}-heatmap`}
            >
              <p className="text-[11px] font-medium text-slate-300">Pacing heatmap</p>
              <ul className="mt-1 grid grid-cols-2 gap-1 md:grid-cols-3">
                {feedback.pace_heatmap.map((h) => (
                  <li
                    key={h.slide_id}
                    className="rounded bg-slate-700/40 px-2 py-1 text-[11px] text-slate-200"
                    data-testid={`${dataTestId}-heatmap-${h.slide_id}`}
                  >
                    <span className="font-medium">{h.slide_id}</span>
                    <span className="ml-1 text-slate-400">{h.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {feedback.recommendations.length > 0 && (
            <div
              className="rounded-md border border-slate-700/60 bg-slate-800/40 p-2"
              data-testid={`${dataTestId}-recommendations`}
            >
              <p className="text-[11px] font-medium text-slate-300">Recommendations</p>
              <ul className="mt-1 list-inside list-disc text-[11px] text-slate-300">
                {feedback.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}