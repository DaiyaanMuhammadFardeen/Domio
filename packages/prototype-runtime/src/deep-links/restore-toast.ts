/**
 * restore-toast — pure-TS helper for the "Resuming from your last
 * session" toast shown on viewer boot when a deep-link payload is
 * being restored.
 *
 * Phase 10 M7.2. The toast component lives in the editor/viewer
 * surface; this helper produces the props that component renders.
 *
 * Three toast kinds:
 *   - `resume`   — happy path: a valid payload is being applied.
 *                  Auto-dismiss after ≤ 1.5 s.
 *   - `expired`  — payload's `exp` is in the past. Suggest
 *                  "open at default start".
 *   - `partial`  — payload is valid but references variables
 *                  that no longer exist on the current deck.
 *                  Defaults will be used.
 */

export type RestoreToastKind = 'resume' | 'expired' | 'partial';

export interface RestoreToastProps {
  readonly kind: RestoreToastKind;
  /** Stable testid / accessibility label. */
  readonly testId: string;
  /** Human-readable message; component may localise. */
  readonly message: string;
  /** Optional call-to-action label. */
  readonly cta?: string;
  /** Optional CTA target (e.g., a route or handler key). */
  readonly ctaTarget?: string;
  /** Auto-dismiss timeout in ms; `0` = sticky. */
  readonly autoDismissMs: number;
  /** ARIA live region politeness setting. */
  readonly ariaLive: 'polite' | 'assertive';
}

/** Maximum auto-dismiss delay for the happy-path toast. */
export const RESUME_AUTO_DISMISS_MS = 1500;

/** Compute props for the "resume" toast. */
export function resumeToast(message?: string): RestoreToastProps {
  return {
    kind: 'resume',
    testId: 'm7-restore-resume',
    message: message ?? 'Resuming from your last session',
    autoDismissMs: RESUME_AUTO_DISMISS_MS,
    ariaLive: 'polite',
  };
}

/** Compute props for the "expired" toast. */
export function expiredToast(message?: string): RestoreToastProps {
  return {
    kind: 'expired',
    testId: 'm7-restore-expired',
    message: message ?? 'This link has expired. Open at default start?',
    cta: 'Open at default',
    ctaTarget: 'restore:default',
    autoDismissMs: 0,
    ariaLive: 'assertive',
  };
}

/** Compute props for the "partial" toast (missing variables). */
export function partialToast(
  missingVariableNames: readonly string[] = [],
  message?: string,
): RestoreToastProps {
  const summary =
    missingVariableNames.length === 0
      ? ''
      : ` Missing: ${missingVariableNames.slice(0, 3).join(', ')}${missingVariableNames.length > 3 ? '…' : ''}.`;
  return {
    kind: 'partial',
    testId: 'm7-restore-partial',
    message:
      message ??
      `Some variables from this link aren't in the current version of the deck; defaults will be used.${summary}`,
    cta: 'Continue',
    ctaTarget: 'restore:ack-partial',
    autoDismissMs: 0,
    ariaLive: 'polite',
  };
}