/**
 * ScenarioSwitcher — toolbar dropdown for switching between data scenarios.
 * Lists Base + derived scenarios, allows creating new ones, and lets
 * designers edit per-scenario dataset bindings via `POST /v1/scenario/{id}/bindings`.
 *
 * Wave 2 §S2.7 — Data sources.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  getScenarios,
  getActiveScenarioId,
  createScenario,
  setActiveScenario,
  subscribe,
  getDataSources,
  type Scenario,
  type DataSource,
} from '../lib/live-data-store';
import { postScenarioBindings } from '../lib/connector-service';

export function ScenarioSwitcher(): ReactElement {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(false);
  const [editSourceId, setEditSourceId] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribe(() => setTick((n) => n + 1));
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const scenarios = useMemo(() => getScenarios(), []);
  const activeId = useMemo(() => getActiveScenarioId(), []);
  const active = scenarios.find((s) => s.id === activeId);
  const sources = useMemo(() => getDataSources(), []);

  const handleCreate = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    createScenario(name, activeId);
    setNewName('');
    setCreating(false);
  }, [newName, activeId]);

  const handleApplyBindings = useCallback(async () => {
    if (!active) return;
    await postScenarioBindings(active.id, {
      sourceId: editSourceId || null,
      fieldMap: {},
    });
    setEditing(false);
  }, [active, editSourceId]);

  return (
    <div className="scenario-switcher" ref={dropdownRef} data-testid="p08-scenario-switcher">
      <button
        type="button"
        className="scenario-switcher__btn"
        onClick={() => setOpen(!open)}
        data-testid="p08-scenario-btn"
      >
        {active?.name ?? 'Base'}
        <span className="scenario-switcher__chevron">▾</span>
      </button>

      {open && (
        <div className="scenario-dropdown" data-testid="p08-scenario-dropdown">
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`scenario-dropdown__item${s.id === activeId ? ' is-active' : ''}`}
              onClick={() => {
                setActiveScenario(s.id);
                setOpen(false);
              }}
              data-testid={`p08-scenario-item-${s.id}`}
            >
              <span>{s.name}</span>
              {s.isBase && <span className="scenario-dropdown__badge">Base</span>}
              {!s.isBase && s.parentId && (
                <span className="scenario-dropdown__badge">
                  derived from {scenarios.find((p) => p.id === s.parentId)?.name ?? '—'}
                </span>
              )}
            </button>
          ))}

          {creating ? (
            <div style={{ padding: '6px 10px', display: 'flex', gap: 4 }}>
              <input
                type="text"
                className="data-panel__add-input"
                placeholder="Scenario name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                autoFocus
                data-testid="p08-scenario-create-input"
              />
              <button
                type="button"
                className="data-panel__add-btn"
                onClick={handleCreate}
                data-testid="p08-scenario-create-confirm"
              >
                Create
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="scenario-dropdown__create"
              onClick={() => setCreating(true)}
              data-testid="p08-scenario-create-btn"
            >
              + Create scenario
            </button>
          )}

          <hr className="scenario-dropdown__sep" />

          {editing ? (
            <div className="scenario-dropdown__edit" data-testid="p08-scenario-edit-form">
              <div className="scenario-dropdown__edit-title">
                Bind {active?.name ?? 'scenario'} to a source
              </div>
              <select
                className="data-panel__add-input"
                value={editSourceId}
                onChange={(e) => setEditSourceId(e.target.value)}
                data-testid="p08-scenario-edit-source"
              >
                <option value="">(no override — use base)</option>
                {sources.map((ds: DataSource) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name}
                  </option>
                ))}
              </select>
              <div className="scenario-dropdown__edit-actions">
                <button
                  type="button"
                  className="data-panel__add-btn"
                  onClick={() => void handleApplyBindings()}
                  data-testid="p08-scenario-edit-apply"
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="data-panel__add-btn data-panel__add-btn--ghost"
                  onClick={() => setEditing(false)}
                  data-testid="p08-scenario-edit-cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="scenario-dropdown__create"
              onClick={() => setEditing(true)}
              data-testid="p08-scenario-edit-btn"
            >
              ⚙ Edit bindings…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type { Scenario };