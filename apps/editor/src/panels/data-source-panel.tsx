/**
 * DataSourcePanel — left-side panel for managing live data sources.
 * Lists connected sources with freshness indicators, exposes the
 * Add Source flow (connector framework), and shows connection state.
 *
 * Wave 2 §S2.7 — Data sources.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  getDataSources,
  removeDataSource,
  refreshSource,
  subscribe,
  tickFreshness,
  type DataSource,
} from '../lib/live-data-store';
import {
  listConnectors,
  getConnector,
  registerSource,
  formatLastSynced,
  validateCredentials,
  type ConnectorKind,
  type ConnectorDescriptor,
} from '../lib/connector-service';

interface DataSourcePanelProps {
  selectedSourceId: string | null;
  onSelectSource: (id: string | null) => void;
}

export function DataSourcePanel({
  selectedSourceId,
  onSelectSource,
}: DataSourcePanelProps): ReactElement {
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);

  // Re-render on store changes
  useEffect(() => {
    const unsub = subscribe(() => setTick((n) => n + 1));
    // Start freshness tick
    const interval = setInterval(tickFreshness, 5000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  const sources = useMemo(() => getDataSources(), [tick]);

  const handleSourceRegistered = useCallback(() => {
    setAdding(false);
    setTick((n) => n + 1);
  }, []);

  return (
    <section className="data-panel" data-testid="data-panel">
      <header className="data-panel__header">
        <h2 className="data-panel__title">Data Sources</h2>
        <span className="data-panel__sub">{sources.length} sources</span>
      </header>

      <div className="data-panel__section">
        <div className="data-panel__section-title">Sources</div>
        {sources.length === 0 ? (
          <div className="data-panel__empty" data-testid="data-panel-empty-state">
            No data sources connected. Open the Connectors panel to link a CSV, webhook, or HTTP
            API.
          </div>
        ) : (
          sources.map((ds) => (
            <DataSourceRow
              key={ds.id}
              ds={ds}
              isSelected={ds.id === selectedSourceId}
              onSelect={() => onSelectSource(ds.id === selectedSourceId ? null : ds.id)}
              onRefresh={() => refreshSource(ds.id)}
              onRemove={() => removeDataSource(ds.id)}
            />
          ))
        )}
      </div>

      <div className="data-panel__section">
        <div className="data-panel__section-title">Add Source</div>
        {adding ? (
          <AddSourceForm onCancel={() => setAdding(false)} onRegistered={handleSourceRegistered} />
        ) : (
          <button
            type="button"
            className="data-panel__add-btn"
            onClick={() => setAdding(true)}
            data-testid="data-panel-add-btn"
          >
            + Connect a new source
          </button>
        )}
      </div>
    </section>
  );
}

interface DataSourceRowProps {
  ds: DataSource;
  isSelected: boolean;
  onSelect: () => void;
  onRefresh: () => void;
  onRemove: () => void;
}

function DataSourceRow({
  ds,
  isSelected,
  onSelect,
  onRefresh,
  onRemove,
}: DataSourceRowProps): ReactElement {
  return (
    <button
      type="button"
      className={`data-source-row${isSelected ? ' is-selected' : ''}`}
      onClick={onSelect}
      data-testid={`p08-source-${ds.id}`}
    >
      <span className={`freshness-dot freshness-dot--${ds.freshness}`} title={ds.freshness} />
      <span className="data-source-row__info">
        <span className="data-source-row__name">{ds.name}</span>
        <span className="data-source-row__meta">
          <span className="data-source-row__rows">{ds.rowCount} rows</span>
          <span
            className="data-source-row__synced"
            data-testid={`p08-source-synced-${ds.id}`}
            title={new Date(ds.lastUpdated).toISOString()}
          >
            synced {formatLastSynced(ds.lastUpdated)}
          </span>
          <span className={`data-source-row__badge data-source-row__badge--${ds.kind}`}>
            {ds.kind === 'mock' ? 'Mock' : 'Connected'}
          </span>
        </span>
      </span>
      <span
        role="button"
        tabIndex={0}
        title="Refresh"
        onClick={(e) => {
          e.stopPropagation();
          onRefresh();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.stopPropagation();
            onRefresh();
          }
        }}
        style={{ cursor: 'pointer', fontSize: 14, color: 'var(--muted)', padding: '2px 4px' }}
        data-testid={`p08-source-refresh-${ds.id}`}
      >
        ↻
      </span>
      <span
        role="button"
        tabIndex={0}
        title="Remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.stopPropagation();
            onRemove();
          }
        }}
        style={{ cursor: 'pointer', fontSize: 14, color: 'var(--muted)', padding: '2px 4px' }}
        data-testid={`p08-source-remove-${ds.id}`}
      >
        ×
      </span>
    </button>
  );
}

interface AddSourceFormProps {
  onCancel: () => void;
  onRegistered: () => void;
}

function AddSourceForm({ onCancel, onRegistered }: AddSourceFormProps): ReactElement {
  const connectors = listConnectors();
  const [kind, setKind] = useState<ConnectorKind>('mock');
  const [name, setName] = useState('My new source');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const descriptor: ConnectorDescriptor | undefined = getConnector(kind);

  const handleSubmit = useCallback(async () => {
    if (!descriptor) return;
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    // Resolve select-style fields to their first option if unset.
    const resolved: Record<string, string> = { ...creds };
    for (const f of descriptor.fields) {
      if (f.options && !resolved[f.key]) {
        resolved[f.key] = f.options[0]!;
      }
    }
    const check = validateCredentials(descriptor, resolved);
    if (!check.ok) {
      setError(`Missing: ${check.missing.join(', ')}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await registerSource({ kind, name: name.trim(), credentials: resolved });
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [descriptor, name, creds, kind, onRegistered]);

  return (
    <div className="data-panel__add-form" data-testid="data-panel-add-form">
      <div className="data-panel__add-row">
        <label htmlFor="ds-connector">Connector</label>
        <select
          id="ds-connector"
          className="data-panel__add-input"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as ConnectorKind);
            setCreds({});
            setError(null);
          }}
          data-testid="ds-connector-select"
        >
          {connectors.map((c) => (
            <option key={c.kind} value={c.kind}>
              {c.glyph} {c.label}
            </option>
          ))}
        </select>
      </div>

      {descriptor && (
        <p className="data-panel__add-hint" data-testid="ds-connector-desc">
          {descriptor.description}
        </p>
      )}

      <div className="data-panel__add-row">
        <label htmlFor="ds-name">Name</label>
        <input
          id="ds-name"
          type="text"
          className="data-panel__add-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="ds-name-input"
        />
      </div>

      {descriptor?.fields.map((f) => (
        <div key={f.key} className="data-panel__add-row">
          <label htmlFor={`ds-${f.key}`}>
            {f.label}
            {f.required && <span className="data-panel__required"> *</span>}
          </label>
          {f.options ? (
            <select
              id={`ds-${f.key}`}
              className="data-panel__add-input"
              value={creds[f.key] ?? f.options[0]}
              onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
              data-testid={`ds-cred-${f.key}`}
            >
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`ds-${f.key}`}
              type={f.secret ? 'password' : 'text'}
              className="data-panel__add-input"
              value={creds[f.key] ?? ''}
              onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              data-testid={`ds-cred-${f.key}`}
            />
          )}
        </div>
      ))}

      {error && (
        <div className="data-panel__add-error" data-testid="ds-add-error">
          {error}
        </div>
      )}

      <div className="data-panel__add-actions">
        <button
          type="button"
          className="data-panel__add-btn"
          onClick={() => void handleSubmit()}
          disabled={busy}
          data-testid="ds-add-submit"
        >
          {busy ? 'Connecting…' : 'Connect'}
        </button>
        <button
          type="button"
          className="data-panel__add-btn data-panel__add-btn--ghost"
          onClick={onCancel}
          disabled={busy}
          data-testid="ds-add-cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
