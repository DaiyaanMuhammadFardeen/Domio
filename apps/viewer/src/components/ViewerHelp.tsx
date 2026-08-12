/**
 * ViewerHelp — keyboard + touch cheat sheet, toggled with `?`.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 */

'use client';

import type { ReactElement } from 'react';

export interface ViewerHelpProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly dataTestId?: string;
}

export function ViewerHelp({ open, onClose, dataTestId = 'viewer-help' }: ViewerHelpProps): ReactElement | null {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      data-testid={dataTestId}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1f2937',
          color: '#fff',
          padding: '24px 32px',
          borderRadius: 10,
          maxWidth: 480,
          width: '90%',
        }}
      >
        <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Keyboard shortcuts</h2>
        <table style={{ width: '100%', fontSize: 13 }} data-testid={`${dataTestId}-table`}>
          <tbody>
            {[
              ['← / h', 'Previous slide'],
              ['→ / l', 'Next slide'],
              ['Home / gg', 'First slide'],
              ['End / G', 'Last slide'],
              ['f', 'Toggle fullscreen'],
              ['o', 'Overview grid'],
              ['?', 'Show / hide this help'],
              ['Esc', 'Close help / overview'],
            ].map(([k, v]) => (
              <tr key={k as string}>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontFamily: 'monospace' }}>{k}</td>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 12 }}>
          Touch: swipe horizontally to advance, pinch to open overview.
        </p>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          data-testid={`${dataTestId}-close`}
          style={{
            marginTop: 12,
            padding: '6px 12px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent',
            color: '#fff',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}