'use client';

/**
 * PresenterHandoff — dialog for handing off the active presenter role.
 *
 * Per Wave 11 §S11.9 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Flow:
 *   1. List all presenters joined to the session, except the active one.
 *   2. The user clicks "Handoff to <name>" on a row.
 *   3. A confirmation prompt appears (the same row is shown with a
 *      confirm + cancel pair). This avoids accidental hand-offs.
 *   4. On confirm we call `handoffToPresenter`. On success the dialog
 *      shows the localized "Handoff complete." message and calls the
 *      `onComplete` callback so the parent can refresh SyncStatus.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  handoffToPresenter,
  listPresenters,
  type Presenter,
} from '../../lib/co-presenting-service';

export interface PresenterHandoffProps {
  sessionId: string;
  /** Polling interval for refreshing the presenter list (ms). Default 5000. */
  refreshMs?: number;
  /** Called when a handoff completes successfully. */
  onComplete?: (toPresenterId: string) => void;
  /** Called when the dialog should close. */
  onClose?: () => void;
  readonly labels?: Partial<{
    heading: string;
    handoff: string;
    handoffTo: string;
    handoffConfirm: string;
    handoffDone: string;
    active: string;
    idle: string;
    noOthers: string;
    close: string;
  }>;
  readonly dataTestId?: string;
}

const DEFAULT_LABELS: Required<NonNullable<PresenterHandoffProps['labels']>> = {
  heading: 'Co-presenting',
  handoff: 'Handoff',
  handoffTo: 'Handoff to {name}',
  handoffConfirm: 'Confirm handoff',
  handoffDone: 'Handoff complete.',
  active: 'Active',
  idle: 'Idle',
  noOthers: 'No other presenters joined.',
  close: 'Close',
};

function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`,
  );
}

export function PresenterHandoff({
  sessionId,
  refreshMs = 5000,
  onComplete,
  onClose,
  labels,
  dataTestId = 'presenter-handoff',
}: PresenterHandoffProps): ReactElement {
  const t = { ...DEFAULT_LABELS, ...(labels ?? {}) };
  const [presenters, setPresenters] = useState<Presenter[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await listPresenters(sessionId);
      setPresenters(next);
    } catch {
      /* keep previous list */
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, refreshMs);
    return () => clearInterval(id);
  }, [refresh, refreshMs]);

  const active = presenters.find((p) => p.is_active) ?? null;
  const others = presenters.filter((p) => !p.is_active);

  const onRequestHandoff = useCallback((id: string) => {
    setConfirmId(id);
    setDoneId(null);
    setError(null);
  }, []);

  const onCancel = useCallback(() => {
    setConfirmId(null);
    setError(null);
  }, []);

  const onConfirm = useCallback(async () => {
    if (!confirmId) return;
    setBusy(true);
    setError(null);
    try {
      await handoffToPresenter(sessionId, confirmId);
      setDoneId(confirmId);
      setConfirmId(null);
      await refresh();
      onComplete?.(confirmId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [confirmId, onComplete, refresh, sessionId]);

  const confirmTarget = confirmId ? (others.find((p) => p.id === confirmId) ?? null) : null;
  const doneTarget = doneId ? (presenters.find((p) => p.id === doneId) ?? null) : null;

  return (
    <div
      className="presenter-handoff"
      role="dialog"
      aria-label={t.heading}
      data-testid={dataTestId}
    >
      <header className="presenter-handoff__header">
        <h3 className="presenter-handoff__title">{t.heading}</h3>
        {onClose && (
          <button
            type="button"
            className="presenter-handoff__close"
            onClick={onClose}
            aria-label={t.close}
            data-testid={`${dataTestId}-close`}
          >
            ✕
          </button>
        )}
      </header>

      <div className="presenter-handoff__current" data-testid={`${dataTestId}-current`}>
        <span className="presenter-handoff__current-label">{t.active}:</span>
        <strong>{active?.name ?? '—'}</strong>
      </div>

      <ul className="presenter-handoff__list">
        {others.length === 0 && (
          <li className="presenter-handoff__empty" data-testid={`${dataTestId}-empty`}>
            {t.noOthers}
          </li>
        )}
        {others.map((p) => (
          <li
            key={p.id}
            className="presenter-handoff__item"
            data-testid={`${dataTestId}-item`}
            data-id={p.id}
          >
            <span className="presenter-handoff__name">{p.name}</span>
            <span className="presenter-handoff__state" data-testid={`${dataTestId}-state`}>
              {t.idle}
            </span>
            {confirmTarget && confirmTarget.id === p.id ? (
              <div className="presenter-handoff__confirm" data-testid={`${dataTestId}-confirm`}>
                <button
                  type="button"
                  className="presenter-handoff__btn presenter-handoff__btn--primary"
                  onClick={onConfirm}
                  disabled={busy}
                  data-testid={`${dataTestId}-confirm-btn`}
                >
                  {t.handoffConfirm}
                </button>
                <button
                  type="button"
                  className="presenter-handoff__btn"
                  onClick={onCancel}
                  disabled={busy}
                  data-testid={`${dataTestId}-cancel-btn`}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="presenter-handoff__btn"
                onClick={() => onRequestHandoff(p.id)}
                disabled={busy}
                data-testid={`${dataTestId}-handoff-btn`}
              >
                {format(t.handoffTo, { name: p.name })}
              </button>
            )}
          </li>
        ))}
      </ul>

      {doneTarget && (
        <div
          className="presenter-handoff__done"
          role="status"
          aria-live="polite"
          data-testid={`${dataTestId}-done`}
        >
          {t.handoffDone} ({doneTarget.name})
        </div>
      )}
      {error && (
        <div className="presenter-handoff__error" role="alert" data-testid={`${dataTestId}-error`}>
          {error}
        </div>
      )}
    </div>
  );
}
