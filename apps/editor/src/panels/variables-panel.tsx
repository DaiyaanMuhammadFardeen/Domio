'use client';

/**
 * VariablesPanel — left-side panel for prototyping variables and
 * conditional rules. Drives the `x-domio:variables` (slide-level)
 * and `x-domio:conditional-rule` (component-level) canvas slots.
 *
 * P10 M2 — uses the runtime's `compileExpression` and `RuleEvaluator`
 * for "Test rule" preview.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  compileExpression,
  evaluateExpression,
  RuleEvaluator,
  VarStore,
  type VariableScope,
  type VariableType,
  type ConditionalRule,
  type Action,
} from '@domio/prototype-runtime';

export interface VariablesPanelVariable {
  id: string;
  name: string;
  scope: VariableScope;
  type: VariableType;
  defaultValue: unknown;
  visibility: 'deck_public' | 'private' | 'server_only';
}

export interface VariablesPanelRule {
  id: string;
  name: string;
  priority: number;
  conditionSource: string;
  action: Action;
  enabled: boolean;
}

interface VariablesPanelProps {
  readonly variables: readonly VariablesPanelVariable[];
  readonly rules: readonly VariablesPanelRule[];
  readonly onAddVariable: (variable: Omit<VariablesPanelVariable, 'id'>) => void;
  readonly onRemoveVariable: (id: string) => void;
  readonly onAddRule: (rule: Omit<VariablesPanelRule, 'id'>) => void;
  readonly onRemoveRule: (id: string) => void;
}

const SCOPE_OPTIONS: VariableScope[] = ['deck', 'slide', 'component_instance', 'session', 'viewer'];
const TYPE_OPTIONS: VariableType[] = ['string', 'number', 'boolean', 'enum', 'json', 'array'];

const ACTION_OPTIONS: { value: Action['kind']; label: string }[] = [
  { value: 'show', label: 'Show' },
  { value: 'hide', label: 'Hide' },
  { value: 'enable', label: 'Enable' },
  { value: 'disable', label: 'Disable' },
  { value: 'set_variable', label: 'Set variable' },
  { value: 'navigate_to', label: 'Navigate to slide' },
  { value: 'play_animation', label: 'Play animation' },
  { value: 'open_overlay', label: 'Open overlay' },
  { value: 'close_overlay', label: 'Close overlay' },
  { value: 'submit_form', label: 'Submit form' },
];

export function VariablesPanel({
  variables,
  rules,
  onAddVariable,
  onRemoveVariable,
  onAddRule,
  onRemoveRule,
}: VariablesPanelProps): ReactElement {
  const [tab, setTab] = useState<'variables' | 'rules'>('variables');
  const [name, setName] = useState<string>('TIER');
  const [scope, setScope] = useState<VariableScope>('deck');
  const [type, setType] = useState<VariableType>('string');
  const [defaultValue, setDefaultValue] = useState<string>('monthly');
  const [ruleName, setRuleName] = useState<string>('Rule');
  const [priority, setPriority] = useState<number>(0);
  const [conditionSource, setConditionSource] = useState<string>('$TIER == "annual"');
  const [actionKind, setActionKind] = useState<Action['kind']>('show');
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const ruleStore = useMemo(() => {
    const store = new VarStore();
    for (const v of variables) {
      store.define({
        id: v.id,
        tenantId: '',
        deckId: '',
        name: v.name,
        scope: v.scope,
        type: v.type,
        defaultValue: v.defaultValue,
        visibility: v.visibility,
        readOnly: false,
        version: 0,
        createdAt: 0,
        updatedAt: 0,
      });
    }
    return store;
  }, [variables]);

  const handleAddVariable = useCallback(() => {
    onAddVariable({
      name,
      scope,
      type,
      defaultValue: type === 'number' ? Number(defaultValue) || 0 : defaultValue,
      visibility: 'deck_public',
    });
  }, [onAddVariable, name, scope, type, defaultValue]);

  const handleAddRule = useCallback(() => {
    onAddRule({
      name: ruleName,
      priority,
      conditionSource,
      action: { kind: actionKind, params: { targetId: 'badge' } },
      enabled: true,
    });
  }, [onAddRule, ruleName, priority, conditionSource, actionKind]);

  const handleTestRule = useCallback(() => {
    setPreviewError(null);
    setPreviewResult(null);
    try {
      const compiled = compileExpression(conditionSource);
      const value = evaluateExpression(compiled.ast, { vars: ruleStore.snapshot('deck').values });
      const matched = Boolean(value);
      // Now also try the evaluator with priority ordering
      const candidates: ConditionalRule[] = rules.map((r) => ({
        id: r.id,
        tenantId: '',
        deckId: '',
        name: r.name,
        priority: r.priority,
        condition: compileExpression(r.conditionSource).ast,
        conditionSource: r.conditionSource,
        scopeSlideId: null,
        action: r.action,
        enabled: r.enabled,
        version: 0,
        createdAt: 0,
        updatedAt: 0,
      }));
      const evaluator = new RuleEvaluator();
      const result = evaluator.evaluate(candidates, ruleStore);
      setPreviewResult(matched
        ? `True: rule ${result.ruleId ?? 'inline'} fires → ${result.action?.kind ?? 'n/a'}`
        : 'False: no rule fires');
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    }
  }, [conditionSource, ruleStore, rules]);

  return (
    <section className="variables-panel" data-testid="p10-variables-panel">
      <header className="variables-panel__header">
        <h2>Variables</h2>
      </header>
      <nav className="variables-panel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'variables'}
          data-testid="p10-tab-variables"
          className={`variables-panel__tab${tab === 'variables' ? ' is-active' : ''}`}
          onClick={() => setTab('variables')}
        >
          Variables
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'rules'}
          data-testid="p10-tab-rules"
          className={`variables-panel__tab${tab === 'rules' ? ' is-active' : ''}`}
          onClick={() => setTab('rules')}
        >
          Rules
        </button>
      </nav>

      {tab === 'variables' && (
        <div className="variables-panel__body" data-testid="p10-var-list">
          <div className="variables-panel__form">
            <label htmlFor="p10-var-name">Name</label>
            <input
              id="p10-var-name"
              data-testid="p10-var-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label htmlFor="p10-var-scope">Scope</label>
            <select
              id="p10-var-scope"
              data-testid="p10-var-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as VariableScope)}
            >
              {SCOPE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label htmlFor="p10-var-type">Type</label>
            <select
              id="p10-var-type"
              data-testid="p10-var-type"
              value={type}
              onChange={(e) => setType(e.target.value as VariableType)}
            >
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label htmlFor="p10-var-default">Default value</label>
            <input
              id="p10-var-default"
              data-testid="p10-var-default"
              type="text"
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
            />
            <button type="button" data-testid="p10-var-add" onClick={handleAddVariable}>
              Add variable
            </button>
          </div>
          {variables.length === 0 ? (
            <p className="variables-panel__empty">No variables yet.</p>
          ) : (
            <ul className="variables-panel__items">
              {variables.map((v) => (
                <li key={v.id} className="variables-panel__item" data-testid="p10-var-row">
                  <span>{v.name}</span>
                  <small>{v.scope} · {v.type}</small>
                  <button
                    type="button"
                    data-testid="p10-var-remove"
                    onClick={() => onRemoveVariable(v.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'rules' && (
        <div className="variables-panel__body" data-testid="p10-rule-list">
          <div className="variables-panel__form">
            <label htmlFor="p10-rule-name">Name</label>
            <input
              id="p10-rule-name"
              data-testid="p10-rule-name"
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
            />
            <label htmlFor="p10-rule-priority">Priority</label>
            <input
              id="p10-rule-priority"
              data-testid="p10-rule-priority"
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
            <label htmlFor="p10-rule-condition">Condition</label>
            <input
              id="p10-rule-condition"
              data-testid="p10-rule-condition"
              type="text"
              value={conditionSource}
              onChange={(e) => setConditionSource(e.target.value)}
            />
            <label htmlFor="p10-rule-action">Action</label>
            <select
              id="p10-rule-action"
              data-testid="p10-rule-action"
              value={actionKind}
              onChange={(e) => setActionKind(e.target.value as Action['kind'])}
            >
              {ACTION_OPTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <div className="variables-panel__actions">
              <button type="button" data-testid="p10-rule-add" onClick={handleAddRule}>
                Add rule
              </button>
              <button type="button" data-testid="p10-rule-test" onClick={handleTestRule}>
                Test rule
              </button>
            </div>
          </div>
          {previewError && (
            <p className="variables-panel__error" data-testid="p10-rule-error">
              {previewError}
            </p>
          )}
          {previewResult && (
            <p className="variables-panel__preview" data-testid="p10-rule-preview">
              {previewResult}
            </p>
          )}
          {rules.length === 0 ? (
            <p className="variables-panel__empty">No rules yet.</p>
          ) : (
            <ul className="variables-panel__items">
              {rules.map((r) => (
                <li key={r.id} className="variables-panel__item" data-testid="p10-rule-row">
                  <span>{r.name}</span>
                  <small>{r.conditionSource}</small>
                  <button
                    type="button"
                    data-testid="p10-rule-remove"
                    onClick={() => onRemoveRule(r.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
