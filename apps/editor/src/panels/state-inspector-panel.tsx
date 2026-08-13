'use client';

/**
 * StateInspectorPanel — left-side panel for inspecting component state
 * machines (P10 M3). Lists the interaction states for the active slide,
 * renders the transition graph as a `from → on event → to` list, and
 * pauses the inspector onto a single state so editors can inspect
 * transitions without immediately mutating the current state.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

export type StateMachineEventKind = 'focus' | 'press' | 'click' | 'hover' | 'default';

export interface StateInspectorTransition {
  readonly from: string;
  readonly to: string;
  readonly event: string;
}

export interface StateInspectorNode {
  readonly label?: string;
}

export interface StateInspectorMachine {
  readonly id: string;
  readonly instanceId: string;
  readonly stateMachine: {
    readonly states: Readonly<Record<string, StateInspectorNode>>;
    readonly initial: string;
    readonly transitions: readonly StateInspectorTransition[];
  };
  readonly currentState: string;
  readonly scope: 'session' | 'slide' | 'deck' | 'persistent_session';
  readonly persistInstanceState: boolean;
}

export interface StateInspectorGraphRow {
  readonly from: string;
  readonly event: string;
  readonly to: string;
}

interface StateInspectorPanelProps {
  readonly machines: readonly StateInspectorMachine[];
  readonly activeSlideId: string;
  readonly onAddMachine: (
    instanceId: string,
    initialState: string,
    scope: StateInspectorMachine['scope'],
  ) => void;
  readonly onRemoveMachine: (id: string) => void;
  readonly onAdvance: (id: string, event: StateMachineEventKind) => void;
  readonly onTogglePersistInstanceState: (id: string, value: boolean) => void;
}

// Display precedence for the row ordering. Mirrors the runtime ladder.
const PRECEDENCE: Readonly<Record<string, number>> = {
  focus: 50,
  press: 40,
  click: 30,
  hover: 20,
  default: 10,
};

const SCOPE_OPTIONS: StateInspectorMachine['scope'][] = [
  'session',
  'slide',
  'deck',
  'persistent_session',
];

const EVENT_OPTIONS: StateMachineEventKind[] = ['focus', 'press', 'click', 'hover', 'default'];

export function StateInspectorPanel({
  machines,
  activeSlideId,
  onAddMachine,
  onRemoveMachine,
  onAdvance,
  onTogglePersistInstanceState,
}: StateInspectorPanelProps): ReactElement {
  const [instanceId, setInstanceId] = useState<string>(`inst-${activeSlideId}-1`);
  const [initialState, setInitialState] = useState<string>('idle');
  const [scope, setScope] = useState<StateInspectorMachine['scope']>('slide');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pauseAndInspect, setPauseAndInspect] = useState<boolean>(false);
  const [pendingEvent, setPendingEvent] = useState<StateMachineEventKind>('click');

  const visibleMachines = useMemo(
    () => machines.filter((m) => m.instanceId.startsWith(`inst-${activeSlideId}`)),
    [machines, activeSlideId],
  );

  const active = useMemo(
    () => visibleMachines.find((m) => m.id === selectedId) ?? visibleMachines[0] ?? null,
    [visibleMachines, selectedId],
  );

  const graphRows = useMemo<readonly StateInspectorGraphRow[]>(() => {
    if (!active) return [];
    return [...active.stateMachine.transitions]
      .map((t) => ({ from: t.from, event: t.event, to: t.to }))
      .sort((a, b) => (PRECEDENCE[b.event] ?? 0) - (PRECEDENCE[a.event] ?? 0));
  }, [active]);

  const handleAdd = useCallback(() => {
    onAddMachine(instanceId, initialState, scope);
  }, [onAddMachine, instanceId, initialState, scope]);

  const handleAdvance = useCallback(() => {
    if (!active) return;
    if (pauseAndInspect) return;
    onAdvance(active.id, pendingEvent);
  }, [active, onAdvance, pendingEvent, pauseAndInspect]);

  return (
    <section className="state-inspector-panel" data-testid="m3-state-inspector-panel">
      <header className="state-inspector-panel__header">
        <h2>State inspector</h2>
      </header>

      <div className="state-inspector-panel__body" data-testid="m3-state-add-form">
        <label htmlFor="m3-instance-id">Instance id</label>
        <input
          id="m3-instance-id"
          data-testid="m3-instance-id"
          type="text"
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
        />
        <label htmlFor="m3-initial-state">Initial state</label>
        <input
          id="m3-initial-state"
          data-testid="m3-initial-state"
          type="text"
          value={initialState}
          onChange={(e) => setInitialState(e.target.value)}
        />
        <label htmlFor="m3-scope">Scope</label>
        <select
          id="m3-scope"
          data-testid="m3-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as StateInspectorMachine['scope'])}
        >
          {SCOPE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" data-testid="m3-add-machine" onClick={handleAdd}>
          Add state machine
        </button>
      </div>

      <div className="state-inspector-panel__pause" data-testid="m3-pause-row">
        <label htmlFor="m3-pause-toggle">
          <input
            id="m3-pause-toggle"
            data-testid="m3-pause-toggle"
            type="checkbox"
            checked={pauseAndInspect}
            onChange={(e) => setPauseAndInspect(e.target.checked)}
          />{' '}
          Pause and inspect
        </label>
      </div>

      <div className="state-inspector-panel__advance" data-testid="m3-advance-row">
        <label htmlFor="m3-advanced-event">Event</label>
        <select
          id="m3-advanced-event"
          data-testid="m3-advance-event"
          value={pendingEvent}
          onChange={(e) => setPendingEvent(e.target.value as StateMachineEventKind)}
        >
          {EVENT_OPTIONS.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="m3-advance"
          onClick={handleAdvance}
          disabled={!active || pauseAndInspect}
        >
          {pauseAndInspect ? 'Paused' : 'Apply event'}
        </button>
      </div>

      <div className="state-inspector-panel__list" data-testid="m3-machine-list">
        {visibleMachines.length === 0 ? (
          <p className="state-inspector-panel__empty">No state machines on this slide.</p>
        ) : (
          <ul>
            {visibleMachines.map((m) => (
              <li
                key={m.id}
                className={`state-inspector-panel__item${m.id === active?.id ? ' is-active' : ''}`}
                data-testid="m3-machine-row"
              >
                <button
                  type="button"
                  data-testid="m3-machine-select"
                  className="state-inspector-panel__pick"
                  onClick={() => setSelectedId(m.id)}
                >
                  <strong>{m.instanceId}</strong>
                  <small>
                    {m.stateMachine.initial} → {m.currentState}
                  </small>
                </button>
                <label>
                  <input
                    type="checkbox"
                    data-testid="m3-persist-toggle"
                    checked={m.persistInstanceState}
                    onChange={(e) => onTogglePersistInstanceState(m.id, e.target.checked)}
                  />{' '}
                  persist
                </label>
                <button
                  type="button"
                  data-testid="m3-machine-remove"
                  onClick={() => onRemoveMachine(m.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="state-inspector-panel__graph" data-testid="m3-transition-graph">
        <h3>Transitions</h3>
        {active ? (
          <>
            <p className="state-inspector-panel__current" data-testid="m3-current-state">
              Current:{' '}
              <strong>{pauseAndInspect ? active.stateMachine.initial : active.currentState}</strong>
              {pauseAndInspect ? (
                <span className="state-inspector-panel__current-flag" data-testid="m3-paused-flag">
                  {' '}
                  (paused — initial)
                </span>
              ) : null}
            </p>
            {graphRows.length === 0 ? (
              <p className="state-inspector-panel__empty">No transitions defined.</p>
            ) : (
              <ul className="state-inspector-panel__rows">
                {graphRows.map((t, i) => (
                  <li
                    key={`${t.from}-${t.event}-${t.to}-${i}`}
                    className="state-inspector-panel__row"
                    data-testid="m3-transition-row"
                  >
                    <span>{t.from}</span>
                    <span>— on {t.event} →</span>
                    <span>{t.to}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="state-inspector-panel__empty">Select a state machine to inspect.</p>
        )}
      </div>
    </section>
  );
}
