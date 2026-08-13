'use client';

/**
 * PacingCheckpointList — UI for managing pacing checkpoints per slide.
 *
 * Per Wave 11 §S11.13 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Each row defines a time offset (seconds into the slide), a label,
 * and a pattern to vibrate. The list is saved as a complete batch via
 * the supplied `onSave` callback (deletes included — the editor is the
 * source of truth between save calls).
 *
 * The component is purely a form — the parent owns persistence
 * (typically `savePacingCheckpoints` from the haptics service).
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

import {
  type PacingCheckpoint,
  type VibrationPattern,
  blankCheckpoint,
  listPacingCheckpoints,
  listPatterns,
  savePacingCheckpoints,
} from '../lib/haptics-service';

export interface PacingCheckpointListProps {
  /** Deck whose checkpoints are being edited. */
  readonly deckId: string;
  /** Optional list of slide ids to populate the dropdown; the editor
   *  allows free-text entry when omitted. */
  readonly slideIds?: ReadonlyArray<string>;
  /** Called once checkpoints are saved. */
  readonly onSave?: (checkpoints: PacingCheckpoint[]) => void | Promise<void>;
  readonly dataTestId?: string;
}

export function PacingCheckpointList({
  deckId,
  slideIds,
  onSave,
  dataTestId = 'pacing-checkpoint-list',
}: PacingCheckpointListProps): ReactElement {
  const [rows, setRows] = useState<PacingCheckpoint[]>([]);
  const [patterns, setPatterns] = useState<VibrationPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saved' | 'error'; message?: string }>({
    kind: 'idle',
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPacingCheckpoints(deckId), listPatterns()]).then(([cps, pats]) => {
      if (cancelled) return;
      setRows(cps);
      setPatterns(pats);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const updateRow = useCallback((id: string, patch: Partial<PacingCheckpoint>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setStatus({ kind: 'idle' });
  }, []);

  const addRow = useCallback(() => {
    const defaultSlide = slideIds && slideIds.length > 0 ? (slideIds[0] ?? '') : '';
    setRows((current) => [...current, blankCheckpoint(deckId, defaultSlide)]);
    setStatus({ kind: 'idle' });
  }, [deckId, slideIds]);

  const removeRow = useCallback((id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
    setStatus({ kind: 'idle' });
  }, []);

  const onSaveClick = useCallback(async () => {
    try {
      const saved = await savePacingCheckpoints(rows);
      setRows(saved);
      setStatus({ kind: 'saved' });
      await onSave?.(saved);
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Save failed' });
    }
  }, [rows, onSave]);

  return (
    <section
      data-testid={dataTestId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        border: '1px solid var(--border-subtle, #e2e8f0)',
        borderRadius: 6,
        background: 'var(--surface-base, #fff)',
        color: 'var(--content-primary, #1a1a1a)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>
          <FormattedMessage id="presenter.haptics.checkpoints.heading" />
        </h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={addRow}
            data-testid={`${dataTestId}-add`}
            style={{
              padding: '4px 10px',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              borderRadius: 4,
              background: 'transparent',
              color: 'var(--content-primary, #1a1a1a)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + <FormattedMessage id="presenter.haptics.checkpoints.add" />
          </button>
          <button
            type="button"
            onClick={onSaveClick}
            disabled={loading}
            data-testid={`${dataTestId}-save`}
            style={{
              padding: '4px 12px',
              border: 'none',
              borderRadius: 4,
              background: 'var(--accent-primary, #6366f1)',
              color: 'var(--content-inverse, #fff)',
              fontSize: 11,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <FormattedMessage id="presenter.haptics.checkpoints.save" />
          </button>
        </div>
      </header>

      <div
        role="table"
        aria-rowcount={rows.length + 1}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontSize: 12,
        }}
      >
        <div
          role="row"
          style={{
            display: 'flex',
            padding: '4px 0',
            borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          <div role="columnheader" style={{ width: '22%' }}>
            <FormattedMessage id="presenter.haptics.checkpoints.col.slide" />
          </div>
          <div role="columnheader" style={{ width: '14%' }}>
            <FormattedMessage id="presenter.haptics.checkpoints.col.time" />
          </div>
          <div role="columnheader" style={{ width: '34%' }}>
            <FormattedMessage id="presenter.haptics.checkpoints.col.label" />
          </div>
          <div role="columnheader" style={{ width: '24%' }}>
            <FormattedMessage id="presenter.haptics.checkpoints.col.pattern" />
          </div>
          <div role="columnheader" style={{ width: '6%', textAlign: 'right' }} />
        </div>
        {loading && (
          <div role="row" style={{ padding: '8px 0', opacity: 0.7 }}>
            Loading…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div role="row" style={{ padding: '8px 0', opacity: 0.7, fontStyle: 'italic' }}>
            No pacing checkpoints — add one above.
          </div>
        )}
        {rows.map((row, index) => {
          const rowKey = row.id || `new-${index}`;
          const errorSlide = row.slide_id.length === 0;
          return (
            <div
              role="row"
              key={rowKey}
              data-testid={`${dataTestId}-row`}
              data-row-key={rowKey}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 0',
                borderBottom: '1px dashed var(--border-subtle, #e2e8f0)',
              }}
            >
              {slideIds && slideIds.length > 0 ? (
                <select
                  aria-label="Slide"
                  data-testid={`${dataTestId}-slide`}
                  value={row.slide_id}
                  onChange={(e) => updateRow(row.id, { slide_id: e.target.value })}
                  style={{
                    width: '22%',
                    padding: '4px 6px',
                    fontSize: 12,
                    border: errorSlide
                      ? '1px solid var(--danger, #b00020)'
                      : '1px solid var(--border-subtle, #e2e8f0)',
                    borderRadius: 4,
                    background: 'var(--surface-base, #fff)',
                    color: 'var(--content-primary, #1a1a1a)',
                  }}
                >
                  {slideIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  aria-label="Slide"
                  data-testid={`${dataTestId}-slide`}
                  value={row.slide_id}
                  onChange={(e) => updateRow(row.id, { slide_id: e.target.value })}
                  placeholder="slide-id"
                  style={{
                    width: '22%',
                    padding: '4px 6px',
                    fontSize: 12,
                    border: errorSlide
                      ? '1px solid var(--danger, #b00020)'
                      : '1px solid var(--border-subtle, #e2e8f0)',
                    borderRadius: 4,
                    background: 'var(--surface-base, #fff)',
                    color: 'var(--content-primary, #1a1a1a)',
                  }}
                />
              )}
              <input
                type="number"
                aria-label="Time offset (seconds)"
                data-testid={`${dataTestId}-time`}
                min={0}
                step={1}
                value={row.time_offset_sec}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  updateRow(row.id, {
                    time_offset_sec: Number.isFinite(next) && next >= 0 ? next : 0,
                  });
                }}
                style={{
                  width: '14%',
                  marginLeft: 4,
                  padding: '4px 6px',
                  fontSize: 12,
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  borderRadius: 4,
                  background: 'var(--surface-base, #fff)',
                  color: 'var(--content-primary, #1a1a1a)',
                }}
              />
              <input
                type="text"
                aria-label="Label"
                data-testid={`${dataTestId}-label`}
                value={row.label}
                onChange={(e) => updateRow(row.id, { label: e.target.value })}
                placeholder="30s — wrap up"
                style={{
                  width: '34%',
                  marginLeft: 4,
                  padding: '4px 6px',
                  fontSize: 12,
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  borderRadius: 4,
                  background: 'var(--surface-base, #fff)',
                  color: 'var(--content-primary, #1a1a1a)',
                }}
              />
              <select
                aria-label="Pattern"
                data-testid={`${dataTestId}-pattern`}
                value={row.pattern_id}
                onChange={(e) => updateRow(row.id, { pattern_id: e.target.value })}
                style={{
                  width: '24%',
                  marginLeft: 4,
                  padding: '4px 6px',
                  fontSize: 12,
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  borderRadius: 4,
                  background: 'var(--surface-base, #fff)',
                  color: 'var(--content-primary, #1a1a1a)',
                }}
              >
                {patterns.length === 0 && <option value={row.pattern_id}>{row.pattern_id}</option>}
                {patterns.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Remove checkpoint"
                data-testid={`${dataTestId}-delete`}
                onClick={() => removeRow(row.id)}
                style={{
                  width: '6%',
                  marginLeft: 4,
                  padding: '2px 6px',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  borderRadius: 4,
                  background: 'transparent',
                  color: 'var(--content-primary, #1a1a1a)',
                  fontSize: 11,
                  cursor: 'pointer',
                  textAlign: 'right',
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {status.kind === 'saved' && (
        <div
          role="status"
          data-testid={`${dataTestId}-status`}
          aria-live="polite"
          style={{ fontSize: 11, color: 'var(--success, #2e7d32)' }}
        >
          <FormattedMessage id="presenter.haptics.checkpoints.saved" />
        </div>
      )}
      {status.kind === 'error' && (
        <div
          role="alert"
          data-testid={`${dataTestId}-error`}
          style={{ fontSize: 11, color: 'var(--danger, #b00020)' }}
        >
          {status.message}
        </div>
      )}
    </section>
  );
}
