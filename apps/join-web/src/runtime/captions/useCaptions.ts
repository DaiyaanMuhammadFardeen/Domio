/**
 * @domio/join-web — captions/useCaptions.
 *
 * Per Wave 5 §S5.5 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Orchestrates the captions pipeline: SttClient feeds raw audio, every
 * final result is translated through MtClient, the translated final
 * text is fed to TtsClient when audio is enabled, and the original
 * interim / final texts are exposed for the on-screen caption rail.
 *
 * The hook returns state and stable callbacks. State consumers should
 * not store the `isFinal` flag beyond an immediate UI check; the
 * pipeline drives downstream transitions automatically.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connect as connectStt, type SttResult, type SttSession } from './SttClient';
import { translate as defaultTranslate } from './MtClient';
import { createTtsClient as createDefaultTtsClient, type TtsClient } from './TtsClient';
import {
  findLocaleDescriptor,
  loadSavedLocale,
  saveLocale,
  type LocaleDescriptor,
} from '@/lib/locale-prefs';

export type CaptionsMode = 'captions' | 'audio' | 'both';

export interface UseCaptionsInput {
  /** Source locale for the speaker (BCP-47). Defaults to 'en-US'. */
  readonly sourceLocale?: string;
  /** WebSocket URL of the STT provider. Defaults to the mock URL. */
  readonly sttUrl?: string;
  /** Injectable STT connect function (tests). Defaults to `connect`. */
  readonly sttConnect?: (input: { url: string; onResult: (r: SttResult) => void }) => SttSession;
  /** Injectable MT function (tests). Defaults to `translate`. */
  readonly mtTranslate?: typeof defaultTranslate;
  /** Injectable TTS client factory (tests). Defaults to `createTtsClient`. */
  readonly ttsClient?: TtsClient;
  /** Auto-start the STT session on mount. Defaults to false. */
  readonly autoConnect?: boolean;
  /** Initial mode. Defaults to 'both'. */
  readonly initialMode?: CaptionsMode;
  /** Initial listener locale. Reads the cookie when omitted. */
  readonly initialLocale?: string;
}

export interface UseCaptionsResult {
  readonly currentText: string;
  readonly interimText: string;
  readonly isFinal: boolean;
  readonly mode: CaptionsMode;
  readonly setMode: (mode: CaptionsMode) => void;
  readonly locale: LocaleDescriptor;
  readonly setLocale: (locale: LocaleDescriptor) => void;
  readonly connect: () => void;
  readonly disconnect: () => void;
  readonly isConnected: boolean;
}

const DEFAULT_SOURCE_LOCALE = 'en-US';
const DEFAULT_STT_URL = 'wss://stt.example.com/v1/stream';

/**
 * React hook wiring SttClient → MtClient → TtsClient for the captions
 * surface. Returns stable callbacks and the live text state.
 */
export function useCaptions(input: UseCaptionsInput = {}): UseCaptionsResult {
  const sourceLocale = input.sourceLocale ?? DEFAULT_SOURCE_LOCALE;
  const sttUrl = input.sttUrl ?? DEFAULT_STT_URL;
  const sttConnect = input.sttConnect ?? ((opts) => connectStt(opts));
  const mtTranslate = input.mtTranslate ?? defaultTranslate;
  const ttsClient = input.ttsClient ?? createDefaultTtsClient();

  const [mode, setModeState] = useState<CaptionsMode>(input.initialMode ?? 'both');
  const [currentText, setCurrentText] = useState<string>('');
  const [interimText, setInterimText] = useState<string>('');
  const [isFinal, setIsFinal] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [locale, setLocaleState] = useState<LocaleDescriptor>(() => {
    const initial = input.initialLocale ?? loadSavedLocale() ?? undefined;
    return findLocaleDescriptor(initial ?? sourceLocale);
  });

  const sessionRef = useRef<SttSession | null>(null);

  const handleResult = useCallback(
    (result: SttResult) => {
      // Update the original-language surface. When the result is
      // interim we show it as the interim caption; when final we
      // flush it through translation + TTS.
      if (!result.isFinal) {
        setInterimText(result.text);
        setIsFinal(false);
        return;
      }
      setIsFinal(true);
      setInterimText('');
      setCurrentText(result.text);

      if (mode === 'captions') {
        // We still translate so the on-screen captions match the
        // listener's locale (the original is shown when source equals
        // target).
        void mtTranslate({ text: result.text, from: sourceLocale, to: locale.bcp47 })
          .then((translated) => {
            setCurrentText(translated);
          })
          .catch(() => {
            // Swallow — the untranslated fallback remains visible.
          });
        return;
      }

      // Mode includes 'audio' (i.e. 'audio' or 'both') — translate
      // and play.
      void mtTranslate({ text: result.text, from: sourceLocale, to: locale.bcp47 })
        .then((translated) => {
          setCurrentText(translated);
          if (mode === 'audio' || mode === 'both') {
            ttsClient.speak({ text: translated, locale: locale.bcp47 });
          }
        })
        .catch(() => {
          // Swallow translation failures; the original text remains.
        });
    },
    [mode, locale, mtTranslate, sourceLocale, ttsClient],
  );

  const connect = useCallback(() => {
    if (sessionRef.current) return;
    const session = sttConnect({ url: sttUrl, onResult: handleResult });
    sessionRef.current = session;
    setIsConnected(true);
  }, [sttConnect, sttUrl, handleResult]);

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Keep the live result handler pointed at the current closure so
  // that any STT results delivered after a re-render hit the latest
  // translation / TTS state.
  const handlerRef = useRef(handleResult);
  handlerRef.current = handleResult;

  useEffect(() => {
    if (!input.autoConnect) return;
    connect();
    return () => disconnect();
  }, []); // autoConnect is honored once on mount.

  const setMode = useCallback((m: CaptionsMode) => {
    setModeState(m);
  }, []);

  const setLocale = useCallback((next: LocaleDescriptor) => {
    setLocaleState(next);
    saveLocale(next.bcp47);
  }, []);

  return useMemo(
    () => ({
      currentText,
      interimText,
      isFinal,
      mode,
      setMode,
      locale,
      setLocale,
      connect,
      disconnect,
      isConnected,
    }),
    [
      currentText,
      interimText,
      isFinal,
      mode,
      setMode,
      locale,
      setLocale,
      connect,
      disconnect,
      isConnected,
    ],
  );
}
