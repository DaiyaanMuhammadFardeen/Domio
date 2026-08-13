'use client';

/**
 * SoftHardAlerts — full-screen alert overlay when an agenda segment
 * crosses the 80% (soft) or 100% (hard) threshold.
 *
 * Per Wave 4 §S4.11 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * The presenter-only overlay is purely visible; it does NOT stop the
 * session or play sound (sound is opt-in via the user's browser). The
 * dismiss button acknowledges the alert and silences the overlay.
 */

import { useEffect, useState, type ReactElement } from 'react';
import type { AlertLevel } from './AgendaTimer';

export interface SoftHardAlertsProps {
  readonly level: AlertLevel;
  readonly message: string;
  readonly onDismiss?: () => void;
  readonly dataTestId?: string;
}

export function SoftHardAlerts({
  level,
  message,
  onDismiss,
  dataTestId = 'soft-hard-alerts',
}: SoftHardAlertsProps): ReactElement | null {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
  }, [level, message]);

  if (level === 'safe' || !visible) return null;

  const isHard = level === 'hard';

  return (
    <div
      role={isHard ? 'alert' : 'status'}
      aria-live={isHard ? 'assertive' : 'polite'}
      data-testid={dataTestId}
      data-level={level}
      data-message={message}
      style={{
        position: 'fixed',
        inset: 0,
        background: isHard ? 'var(--danger)' : 'var(--warning)',
        color: 'var(--content-inverse)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        zIndex: 1300,
      }}
    >
      <div style={{ fontSize: 64 }}>{isHard ? '⏰' : '⚠️'}</div>
      <div style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', maxWidth: 480 }}>
        {message}
      </div>
      <button
        type="button"
        onClick={() => {
          setVisible(false);
          onDismiss?.();
        }}
        data-testid={`${dataTestId}-dismiss`}
        style={{
          padding: '10px 16px',
          background: 'var(--content-inverse)',
          color: isHard ? 'var(--danger)' : 'var(--warning)',
          border: 'none',
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
