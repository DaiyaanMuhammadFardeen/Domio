/**
 * ScenarioSwitcher — toolbar dropdown for switching between data scenarios.
 * Lists Base + derived scenarios, allows creating new ones.
 *
 * P08 — live data & interactive charts.
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
  type Scenario,
} from '../lib/live-data-store';

export function ScenarioSwitcher(): ReactElement {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
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

  const handleCreate = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    createScenario(name, activeId);
    setNewName('');
    setCreating(false);
  }, [newName, activeId]);

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
        </div>
      )}
    </div>
  );
}

export type { Scenario };
