'use client';

/**
 * VoiceListener — top-level voice-triggered slide states component.
 *
 * Per Wave 11 §S11.5, the presenter's microphone is captured via the
 * browser's Web Speech API. Recognized phrases are matched against the
 * registry; matches are surfaced via the ConfirmationOverlay before
 * being applied. Every match is recorded to the audit log.
 *
 * The privacy notice appears the first time the listener is enabled —
 * the presenter must explicitly opt in to microphone capture.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  acknowledgePrivacy,
  buildVoiceMatch,
  findBestMatch,
  hasAcknowledgedPrivacy,
  type VoiceMatch,
  type VoicePhrase,
  listVoicePhrases,
  recordVoiceMatch,
  updateVoiceMatchStatus,
} from '../../lib/voice-service';
import { PrivacyNotice } from './PrivacyNotice';
import { ConfirmationOverlay } from './ConfirmationOverlay';

// Minimal subset of the Web Speech API we rely on. We keep this loose
// so jsdom (which doesn't implement SpeechRecognition) doesn't break
// type-checking or imports.
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ReadonlyArray<{
    readonly isFinal: boolean;
    readonly 0: { readonly transcript: string; readonly confidence: number };
  }>;
}

interface SpeechRecognitionErrorLike {
  readonly error?: string;
  readonly message?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface VoiceListenerProps {
  readonly sessionId: string;
  readonly heading?: string;
  readonly description?: string;
  readonly enableLabel?: string;
  readonly disableLabel?: string;
  readonly privacyTitle?: string;
  readonly privacyBody?: string;
  readonly privacyConfirmLabel?: string;
  readonly privacyCancelLabel?: string;
  readonly overlayHeading?: string;
  readonly overlayConfirmLabel?: string;
  readonly overlayRejectLabel?: string;
  readonly onMatch?: (phrase: VoicePhrase, confidence: number) => void;
  readonly onConfirm?: (match: VoiceMatch, phrase: VoicePhrase) => void;
  readonly onReject?: (match: VoiceMatch) => void;
  readonly dataTestId?: string;
}

export function VoiceListener({
  sessionId,
  heading = 'Voice-triggered slide states',
  description = 'Speak a phrase to switch slides or scenarios. A confirmation step prevents accidental triggers.',
  enableLabel = 'Enable voice listener',
  disableLabel = 'Disable voice listener',
  privacyTitle = 'Privacy notice',
  privacyBody = 'Voice capture runs entirely in your browser. No audio is sent to any server.',
  privacyConfirmLabel = 'Enable',
  privacyCancelLabel = 'Cancel',
  overlayHeading = 'Did you mean to…',
  overlayConfirmLabel = 'Confirm',
  overlayRejectLabel = 'Reject',
  onMatch,
  onConfirm,
  onReject,
  dataTestId = 'voice-listener',
}: VoiceListenerProps): ReactElement {
  const [phrases, setPhrases] = useState<VoicePhrase[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [pendingMatch, setPendingMatch] = useState<VoiceMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const phrasesRef = useRef<VoicePhrase[]>([]);
  const onMatchRef = useRef<typeof onMatch>(onMatch);

  // Keep the latest phrases in a ref so the recognition callback always
  // sees the freshest registry without re-subscribing.
  useEffect(() => {
    phrasesRef.current = phrases;
  }, [phrases]);

  useEffect(() => {
    onMatchRef.current = onMatch;
  }, [onMatch]);

  // Bootstrap the phrase registry once.
  useEffect(() => {
    let cancelled = false;
    listVoicePhrases().then((list) => {
      if (cancelled) return;
      setPhrases(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Detect support so we can render a useful fallback in jsdom / older
  // browsers.
  useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  const handleRecognitionResult = useCallback((event: SpeechRecognitionEventLike) => {
    const lastResult = event.results[event.results.length - 1];
    if (!lastResult || !lastResult.isFinal) return;
    const utterance = lastResult[0].transcript;
    const sttConfidence = lastResult[0].confidence || 1;
    const match = findBestMatch(utterance, phrasesRef.current);
    if (!match) return;
    const recorded = buildVoiceMatch({
      phrase: match.phrase.phrase,
      confidence: Math.min(1, sttConfidence),
      action: match.phrase.action,
      target: match.phrase.target,
    });
    onMatchRef.current?.(match.phrase, recorded.confidence);
    setPendingMatch(recorded);
    void recordVoiceMatch(recorded).then(() => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('domio:voice-match-recorded'));
      }
    });
  }, []);

  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = handleRecognitionResult;
    recognition.onerror = (ev) => {
      setError(ev.error ?? ev.message ?? 'speech-recognition-error');
    };
    recognition.onend = () => {
      // Some browsers auto-stop after silence — restart so the listener
      // keeps working for the duration of the session.
      if (recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          /* already running or no permission — give up silently */
        }
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setSupported(true);
    } catch (e) {
      setError((e as Error).message ?? 'speech-recognition-start-failed');
    }
  }, [handleRecognitionResult]);

  const stopRecognition = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) return;
    try {
      r.onend = null;
      r.abort();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
  }, []);

  const onToggle = useCallback(async () => {
    if (enabled) {
      stopRecognition();
      setEnabled(false);
      return;
    }
    const acknowledged = await hasAcknowledgedPrivacy();
    if (!acknowledged) {
      setPrivacyOpen(true);
      return;
    }
    startRecognition();
    setEnabled(true);
  }, [enabled, startRecognition, stopRecognition]);

  const onPrivacyConfirm = useCallback(async () => {
    await acknowledgePrivacy();
    setPrivacyOpen(false);
    startRecognition();
    setEnabled(true);
  }, [startRecognition]);

  const onPrivacyCancel = useCallback(() => {
    setPrivacyOpen(false);
  }, []);

  const handleConfirm = useCallback(
    async (match: VoiceMatch) => {
      await updateVoiceMatchStatus(match.id, 'accepted');
      const phrase = phrases.find((p) => p.phrase === match.phrase);
      if (phrase) onConfirm?.(match, phrase);
      setPendingMatch(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('domio:voice-match-recorded'));
      }
    },
    [onConfirm, phrases],
  );

  const handleReject = useCallback(
    async (match: VoiceMatch) => {
      await updateVoiceMatchStatus(match.id, 'rejected');
      onReject?.(match);
      setPendingMatch(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('domio:voice-match-recorded'));
      }
    },
    [onReject],
  );

  const handleAutoDismiss = useCallback(async (match: VoiceMatch) => {
    await updateVoiceMatchStatus(match.id, 'auto_dismissed');
    setPendingMatch(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('domio:voice-match-recorded'));
    }
  }, []);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      stopRecognition();
    };
  }, [stopRecognition]);

  const phraseCount = useMemo(() => phrases.filter((p) => p.enabled).length, [phrases]);

  return (
    <section
      data-testid={dataTestId}
      data-enabled={enabled}
      data-session-id={sessionId}
      aria-label={heading}
      style={{
        padding: 12,
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        background: 'var(--surface-base)',
        color: 'var(--content-primary)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{heading}</h3>
          <p style={{ margin: 0, marginTop: 4, fontSize: 11, opacity: 0.75 }}>{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          data-testid={`${dataTestId}-toggle`}
          onClick={onToggle}
          style={{
            padding: '6px 12px',
            border: `1px solid ${enabled ? 'var(--success)' : 'var(--border-subtle)'}`,
            borderRadius: 4,
            background: enabled ? 'var(--success)' : 'var(--surface-raised)',
            color: enabled ? 'var(--content-inverse)' : 'var(--content-primary)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {enabled ? `🔴 ${disableLabel}` : `🎙️ ${enableLabel}`}
        </button>
      </header>

      <div data-testid={`${dataTestId}-status`} style={{ fontSize: 11, opacity: 0.75 }}>
        {supported === false && 'Voice recognition is not supported in this browser.'}
        {supported === true &&
          phraseCount > 0 &&
          `Tracking ${phraseCount} phrase${phraseCount === 1 ? '' : 's'}.`}
        {supported === true && phraseCount === 0 && 'No phrases registered.'}
        {supported === null && 'Detecting speech recognition support…'}
        {error && (
          <span
            data-testid={`${dataTestId}-error`}
            style={{ color: 'var(--danger)', marginLeft: 8 }}
          >
            {error}
          </span>
        )}
      </div>

      <PrivacyNotice
        open={privacyOpen}
        title={privacyTitle}
        body={privacyBody}
        confirmLabel={privacyConfirmLabel}
        cancelLabel={privacyCancelLabel}
        onConfirm={onPrivacyConfirm}
        onCancel={onPrivacyCancel}
        dataTestId={`${dataTestId}-privacy`}
      />

      <ConfirmationOverlay
        match={pendingMatch}
        heading={overlayHeading}
        confirmLabel={overlayConfirmLabel}
        rejectLabel={overlayRejectLabel}
        onConfirm={handleConfirm}
        onReject={handleReject}
        onAutoDismiss={handleAutoDismiss}
        dataTestId={`${dataTestId}-overlay`}
      />
    </section>
  );
}
