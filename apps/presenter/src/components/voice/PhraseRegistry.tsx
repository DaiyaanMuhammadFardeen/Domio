'use client';

/**
 * PhraseRegistry — UI for managing the presenter's voice phrases.
 *
 * Per Wave 11 §S11.5. Columns: phrase, action, target, threshold,
 * enabled. Add / edit / delete rows; save persists via the
 * voice-service.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  type VoiceAction,
  type VoicePhrase,
  listVoicePhrases,
  savePhraseRegistry,
} from '../../lib/voice-service';

export interface PhraseRegistryProps {
  readonly onSave?: (phrases: VoicePhrase[]) => void;
  readonly heading?: string;
  readonly addLabel?: string;
  readonly saveLabel?: string;
  readonly savedLabel?: string;
  readonly dataTestId?: string;
}

const ACTIONS: ReadonlyArray<VoiceAction> = [
  'scenario_toggle',
  'slide_jump',
  'poll_launch',
  'goto_section',
  'mute',
];

function blankPhrase(): VoicePhrase {
  return {
    id: '',
    phrase: '',
    action: 'scenario_toggle',
    target: '',
    threshold: 0.5,
    enabled: true,
  };
}

export function PhraseRegistry({
  onSave,
  heading = 'Phrase registry',
  addLabel = 'Add phrase',
  saveLabel = 'Save',
  savedLabel = 'Saved.',
  dataTestId = 'voice-phrase-registry',
}: PhraseRegistryProps): ReactElement {
  const [rows, setRows] = useState<VoicePhrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saved' | 'error'; message?: string }>({
    kind: 'idle',
  });

  useEffect(() => {
    let cancelled = false;
    listVoicePhrases().then((phrases) => {
      if (cancelled) return;
      setRows(phrases);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRow = useCallback((id: string, patch: Partial<VoicePhrase>) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }, []);

  const addRow = useCallback(() => {
    setRows((current) => [...current, blankPhrase()]);
  }, []);

  const deleteRow = useCallback((id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
  }, []);

  const onSaveClick = useCallback(async () => {
    try {
      const saved = await savePhraseRegistry(rows);
      setRows(saved);
      setStatus({ kind: 'saved', message: savedLabel });
      onSave?.(saved);
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
    }
  }, [rows, savedLabel, onSave]);

  const columns = useMemo(
    () => [
      { key: 'phrase', label: 'Phrase', width: '34%' },
      { key: 'action', label: 'Action', width: '18%' },
      { key: 'target', label: 'Target', width: '18%' },
      { key: 'threshold', label: 'Threshold', width: '12%' },
      { key: 'enabled', label: 'Enabled', width: '10%' },
      { key: 'row-actions', label: '', width: '8%' },
    ],
    [],
  );

  return (
    <section
      data-testid={dataTestId}
      aria-label={heading}
      style={{
        padding: 12,
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        background: 'var(--surface-base)',
        color: 'var(--content-primary)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{heading}</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            data-testid={`${dataTestId}-add`}
            onClick={addRow}
            style={{
              padding: '4px 10px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              background: 'transparent',
              color: 'var(--content-primary)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + {addLabel}
          </button>
          <button
            type="button"
            data-testid={`${dataTestId}-save`}
            onClick={onSaveClick}
            disabled={loading}
            style={{
              padding: '4px 10px',
              border: 'none',
              borderRadius: 4,
              background: 'var(--accent-primary)',
              color: 'var(--content-inverse)',
              fontSize: 11,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {saveLabel}
          </button>
        </div>
      </header>

      <div
        role="table"
        aria-rowcount={rows.length + 1}
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
        }}
      >
        <div role="row" style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', padding: '4px 0' }}>
          {columns.map((c) => (
            <div
              role="columnheader"
              key={c.key}
              style={{ width: c.width, fontWeight: 700, fontSize: 11 }}
            >
              {c.label}
            </div>
          ))}
        </div>
        {loading && (
          <div role="row" style={{ padding: '8px 0', opacity: 0.7 }}>
            Loading…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div role="row" style={{ padding: '8px 0', opacity: 0.7 }}>
            No phrases registered.
          </div>
        )}
        {rows.map((row) => {
          const rowKey = row.id || `new-${rows.indexOf(row)}`;
          return (
            <div
              role="row"
              key={rowKey}
              data-testid={`${dataTestId}-row`}
              data-row-key={rowKey}
              style={{ display: 'flex', alignItems: 'center', padding: '4px 0', borderBottom: '1px dashed var(--border-subtle)' }}
            >
              <input
                type="text"
                aria-label="Phrase"
                data-testid={`${dataTestId}-phrase`}
                value={row.phrase}
                onChange={(e) => updateRow(row.id, { phrase: e.target.value })}
                placeholder="let's look at the bear case"
                style={{ width: '34%', padding: '4px 6px', fontSize: 12 }}
              />
              <select
                aria-label="Action"
                data-testid={`${dataTestId}-action`}
                value={row.action}
                onChange={(e) => updateRow(row.id, { action: e.target.value as VoiceAction })}
                style={{ width: '18%', padding: '4px 6px', fontSize: 12 }}
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label="Target"
                data-testid={`${dataTestId}-target`}
                value={row.target}
                onChange={(e) => updateRow(row.id, { target: e.target.value })}
                placeholder="bear-case"
                style={{ width: '18%', padding: '4px 6px', fontSize: 12 }}
              />
              <input
                type="number"
                aria-label="Threshold"
                data-testid={`${dataTestId}-threshold`}
                min={0}
                max={1}
                step={0.05}
                value={row.threshold}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  updateRow(row.id, { threshold: Number.isFinite(next) ? next : 0 });
                }}
                style={{ width: '12%', padding: '4px 6px', fontSize: 12 }}
              />
              <label
                style={{
                  width: '10%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  fontSize: 11,
                }}
              >
                <input
                  type="checkbox"
                  data-testid={`${dataTestId}-enabled`}
                  checked={row.enabled}
                  onChange={(e) => updateRow(row.id, { enabled: e.target.checked })}
                />
                {row.enabled ? 'on' : 'off'}
              </label>
              <div style={{ width: '8%', textAlign: 'right' }}>
                <button
                  type="button"
                  aria-label="Delete"
                  data-testid={`${dataTestId}-delete`}
                  onClick={() => deleteRow(row.id)}
                  style={{
                    padding: '2px 6px',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 4,
                    background: 'transparent',
                    color: 'var(--content-primary)',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {status.kind === 'saved' && (
        <div
          role="status"
          data-testid={`${dataTestId}-status`}
          aria-live="polite"
          style={{ marginTop: 8, fontSize: 11, color: 'var(--success)' }}
        >
          {status.message ?? savedLabel}
        </div>
      )}
      {status.kind === 'error' && (
        <div
          role="alert"
          data-testid={`${dataTestId}-error`}
          style={{ marginTop: 8, fontSize: 11, color: 'var(--danger)' }}
        >
          {status.message}
        </div>
      )}
    </section>
  );
}