/**
 * @domio/join-web — slow-connection banner.
 *
 * Per Wave 5 §S5.9 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Renders a small, dismissible banner shown when the transport is in
 * long-poll fallback mode. Widgets remain functional; we just tell
 * the participant that updates will be slower.
 */

'use client';

export interface SlowConnectionBannerProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
}

export function SlowConnectionBanner(props: SlowConnectionBannerProps) {
  if (!props.visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      data-testid="slow-connection-banner"
    >
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-amber-500" />
        Slow connection — updates may be delayed.
      </span>
      <button
        type="button"
        onClick={props.onDismiss}
        className="rounded px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
        data-testid="slow-connection-dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}

export default SlowConnectionBanner;