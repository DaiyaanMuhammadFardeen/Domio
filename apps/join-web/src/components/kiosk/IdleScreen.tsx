/**
 * IdleScreen — touch-to-wake overlay for the kiosk.
 *
 * Per Wave 5 §S5.8 of docs/frontend-roadmap/05-wave-audience-participation.md.
 *
 * Renders an absolutely-positioned overlay covering the entire kiosk
 * surface. When visible the user sees the deck cover / touch prompt;
 * any pointer down hides the overlay and fires `onWake`.
 *
 *  <IdleScreen visible={isIdle} onWake={wake} promptText="Tap to join" />
 */

import type { ReactElement } from 'react';

export interface IdleScreenProps {
  readonly visible: boolean;
  readonly promptText?: string;
  readonly onWake: () => void;
}

export function IdleScreen({
  visible,
  promptText = 'Tap anywhere to join',
  onWake,
}: IdleScreenProps): ReactElement | null {
  if (!visible) return null;
  return (
    <div
      data-testid="kiosk-idle-screen"
      role="button"
      tabIndex={0}
      onClick={onWake}
      onPointerDown={onWake}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onWake();
      }}
      aria-label={promptText}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 text-white select-none cursor-pointer"
    >
      <div className="text-center px-6">
        <p className="text-3xl md:text-5xl font-semibold leading-tight">{promptText}</p>
        <p className="mt-4 text-base md:text-lg text-slate-300">Domio kiosk</p>
      </div>
    </div>
  );
}
