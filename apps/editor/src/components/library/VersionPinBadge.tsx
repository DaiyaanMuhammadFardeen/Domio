'use client';

/**
 * VersionPinBadge — visual badge showing the pinned version vs the
 * latest registered version.
 *
 * Per Wave 2 §S2.6 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Renders one of three states:
 *   - pinned exact       (cyan dot)
 *   - pinned range       (purple dot)
 *   - update available   (orange dot + "Update" CTA)
 *
 * The component is purely presentational; the host decides what to do
 * with the "Update" click.
 */

import type { ReactElement } from 'react';
import type { PinMode } from '../../lib/library';

export interface VersionPinBadgeProps {
  pinMode: PinMode;
  pinValue?: string | undefined;
  installedVersion: string;
  latestVersion?: string | undefined;
  /** Optional id for testing. */
  id?: string | undefined;
  /** Called when the "Update" button is clicked. */
  onUpdate?: (() => void) | undefined;
  /** Read-only mode hides the button. */
  readOnly?: boolean | undefined;
}

export function VersionPinBadge(props: VersionPinBadgeProps): ReactElement {
  const { pinMode, pinValue, installedVersion, latestVersion, onUpdate, readOnly } = props;
  const hasUpdate = !!latestVersion && latestVersion !== installedVersion;
  const isPinned = pinMode === 'pin-version' || pinMode === 'pin-range';

  let label: string;
  let indicator: string;
  let testKind: string;

  if (hasUpdate) {
    label = `Update available: v${latestVersion}`;
    indicator = 'orange';
    testKind = 'update';
  } else if (pinMode === 'pin-version') {
    label = `Pinned to v${pinValue || installedVersion}`;
    indicator = 'cyan';
    testKind = 'pinned';
  } else if (pinMode === 'pin-range') {
    label = `Range ${pinValue || installedVersion}`;
    indicator = 'purple';
    testKind = 'ranged';
  } else {
    label = `Tracking v${installedVersion}`;
    indicator = 'green';
    testKind = 'tracking';
  }

  return (
    <span
      className={`version-pin-badge version-pin-badge--${indicator}${isPinned ? ' is-pinned' : ''}`}
      data-testid={props.id ?? `version-pin-badge-${testKind}`}
      data-pin-mode={pinMode}
    >
      <span className="version-pin-badge__dot" aria-hidden data-kind={indicator} />
      <span className="version-pin-badge__label">{label}</span>
      {hasUpdate && !readOnly && onUpdate && (
        <button
          type="button"
          className="version-pin-badge__update"
          onClick={onUpdate}
          data-testid={`version-pin-badge-update-${installedVersion}`}
        >
          Update
        </button>
      )}
    </span>
  );
}
