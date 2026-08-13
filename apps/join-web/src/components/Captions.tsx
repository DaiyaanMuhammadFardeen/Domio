/**
 * @domio/join-web — Captions.
 *
 * Per Wave 5 §S5.5 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Bottom-bar caption display. Live-shown text comes from `currentText`
 * (final, translated) and `interimText` (STT partial). The audio
 * channel is signalled by a small "playing" indicator when the mode
 * includes audio playback.
 */

'use client';

import type { ReactElement } from 'react';
import type { CaptionsMode } from '@/runtime/captions/useCaptions';

export interface CaptionsProps {
  readonly enabled: boolean;
  readonly mode: CaptionsMode;
  readonly currentText: string;
  readonly interimText: string;
  readonly isFinal: boolean;
  readonly dataTestId?: string;
}

export function Captions({
  enabled,
  mode,
  currentText,
  interimText,
  isFinal,
  dataTestId = 'captions',
}: CaptionsProps): ReactElement | null {
  if (!enabled) {
    return (
      <div
        data-testid={`${dataTestId}-disabled`}
        className="fixed inset-x-0 bottom-0 bg-slate-800 text-slate-200 text-xs text-center py-1"
      >
        captions off
      </div>
    );
  }

  const showAudio = mode === 'audio' || mode === 'both';
  const showCaptions = mode === 'captions' || mode === 'both';
  const composed = currentText || interimText;
  return (
    <div
      data-testid={dataTestId}
      data-mode={mode}
      aria-live={isFinal ? 'off' : 'polite'}
      className="fixed inset-x-0 bottom-0 bg-slate-900 text-slate-100 px-4 py-3 flex items-center justify-between gap-3"
    >
      <div className="flex flex-col min-w-0">
        {showCaptions ? (
          <p data-testid={`${dataTestId}-text`} className="text-sm truncate">
            {composed || 'waiting for captions…'}
          </p>
        ) : (
          <p className="text-sm text-slate-400" data-testid={`${dataTestId}-text-hidden`}>
            captions hidden — audio only
          </p>
        )}
        {interimText && !isFinal && showCaptions ? (
          <span data-testid={`${dataTestId}-interim`} className="text-xs text-slate-400 italic">
            {interimText}
          </span>
        ) : null}
      </div>
      {showAudio ? (
        <span
          data-testid={`${dataTestId}-audio-indicator`}
          className="flex items-center gap-1 text-xs text-green-300"
          aria-label="audio playing"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          audio
        </span>
      ) : null}
    </div>
  );
}
