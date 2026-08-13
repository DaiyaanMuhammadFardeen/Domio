/**
 * AdminPinDialog — modal PIN entry to exit kiosk mode.
 *
 * Per Wave 11 §S11.14 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Renders a numeric keypad, calls back to the parent with the entered
 * PIN on submit. The parent is responsible for verifying the PIN
 * against the kiosk-svc (see `kiosk-service.verifyAdminPin`).
 *
 * i18n keys:
 *   viewer.kiosk.exitPin.heading  — modal title
 *   viewer.kiosk.exitPin.prompt   — label above the PIN display
 *   viewer.kiosk.exitPin.submit   — submit button text
 *   viewer.kiosk.exitPin.cancel   — cancel button text
 *   viewer.kiosk.exitPin.invalid  — error shown on bad PIN
 *   viewer.kiosk.exitPin.success  — confirmation when PIN is accepted
 */

'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

export interface AdminPinDialogProps {
  readonly open: boolean;
  /** Optional override of the heading text. */
  readonly heading?: string;
  readonly prompt?: string;
  readonly submitLabel?: string;
  readonly cancelLabel?: string;
  readonly invalidLabel?: string;
  readonly successLabel?: string;
  /** Maximum PIN length (numeric, 4–8). Defaults to 8. */
  readonly maxLength?: number;
  /** Called with the entered PIN. */
  readonly onSubmit: (pin: string) => void | Promise<void>;
  /** Called when the user cancels (or backdrop-click). */
  readonly onCancel: () => void;
  /** Verification result from the parent. Set to 'invalid' to surface an error. */
  readonly verificationState?: 'idle' | 'verifying' | 'invalid' | 'success';
  readonly dataTestId?: string;
}

const KEYPAD: readonly (readonly string[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'back'],
];

export function AdminPinDialog({
  open,
  heading = 'Exit kiosk mode',
  prompt = 'Enter admin PIN',
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  invalidLabel = 'Invalid PIN',
  successLabel = 'PIN accepted — exiting kiosk mode',
  maxLength = 8,
  onSubmit,
  onCancel,
  verificationState = 'idle',
  dataTestId = 'kiosk-pin-dialog',
}: AdminPinDialogProps): ReactElement | null {
  const [pin, setPin] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setPin('');
      // Defer focus until after the dialog mounts.
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  // Esc closes the dialog.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  const pressKey = useCallback(
    (key: string): void => {
      setPin((current) => {
        if (key === 'clear') return '';
        if (key === 'back') return current.slice(0, -1);
        if (current.length >= maxLength) return current;
        return current + key;
      });
    },
    [maxLength],
  );

  const onChangeInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const v = e.target.value.replace(/[^0-9]/g, '').slice(0, maxLength);
      setPin(v);
    },
    [maxLength],
  );

  const onSubmitInternal = useCallback((): void => {
    if (pin.length === 0) return;
    void onSubmit(pin);
  }, [pin, onSubmit]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dataTestId}-heading`}
      data-testid={dataTestId}
      data-state={verificationState}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        fontFamily: 'system-ui',
      }}
    >
      <div
        data-testid={`${dataTestId}-panel`}
        style={{
          width: 'min(92vw, 360px)',
          background: 'rgb(15, 23, 42)',
          color: 'rgb(255, 255, 255)',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }}
      >
        <h2
          id={`${dataTestId}-heading`}
          data-testid={`${dataTestId}-heading`}
          style={{ margin: 0, marginBottom: 8, fontSize: 18, fontWeight: 600 }}
        >
          {heading}
        </h2>
        <p
          data-testid={`${dataTestId}-prompt`}
          style={{ margin: 0, marginBottom: 12, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}
        >
          {prompt}
        </p>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={onChangeInput}
          data-testid={`${dataTestId}-input`}
          maxLength={maxLength}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            fontSize: 22,
            letterSpacing: 8,
            textAlign: 'center',
            background: 'rgb(30, 41, 59)',
            color: 'rgb(255, 255, 255)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          }}
        />
        <div
          data-testid={`${dataTestId}-keypad`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginTop: 16,
          }}
        >
          {KEYPAD.flatMap((row) =>
            row.map((key) => {
              const isAction = key === 'clear' || key === 'back';
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pressKey(key)}
                  data-testid={`${dataTestId}-key-${key}`}
                  aria-label={
                    key === 'back' ? 'Backspace' : key === 'clear' ? 'Clear' : `Digit ${key}`
                  }
                  style={{
                    padding: '14px 0',
                    fontSize: 18,
                    fontWeight: 600,
                    background: isAction ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                    color: 'rgb(255, 255, 255)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  {key === 'back' ? '⌫' : key === 'clear' ? 'C' : key}
                </button>
              );
            }),
          )}
        </div>
        {verificationState === 'invalid' ? (
          <p
            role="alert"
            data-testid={`${dataTestId}-invalid`}
            style={{ margin: 0, marginTop: 12, fontSize: 13, color: 'rgb(252, 165, 165)' }}
          >
            {invalidLabel}
          </p>
        ) : null}
        {verificationState === 'success' ? (
          <p
            data-testid={`${dataTestId}-success`}
            style={{ margin: 0, marginTop: 12, fontSize: 13, color: 'rgb(134, 239, 172)' }}
          >
            {successLabel}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={onCancel}
            data-testid={`${dataTestId}-cancel`}
            style={{
              flex: 1,
              padding: '10px 12px',
              background: 'transparent',
              color: 'rgb(255, 255, 255)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSubmitInternal}
            disabled={pin.length === 0 || verificationState === 'verifying'}
            data-testid={`${dataTestId}-submit`}
            style={{
              flex: 1,
              padding: '10px 12px',
              background: pin.length === 0 ? 'rgba(56,189,248,0.3)' : 'rgb(56, 189, 248)',
              color: 'rgb(15, 23, 42)',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: pin.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
