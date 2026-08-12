/**
 * ConditionalLogicBuilder — Wave 2 §S2.12.
 *
 * Visual builder for prototype-runtime expressions used by branching
 * rules. Supports simple AND/OR groups of variable comparisons
 * (variable, operator, value). The "raw" view exposes the compiled
 * expression source so authors can paste hand-written expressions
 * too.
 *
 *   var.foo == 'bar' && var.baz > 5
 *
 * is the canonical output form.
 */

import { useState, useEffect, type ReactElement } from 'react';

export type CondOp = '==' | '!=' | '>' | '<' | '>=' | '<=';
export type CondGroupOp = 'AND' | 'OR';

export interface CondClause {
  readonly id: string;
  readonly variable: string;
  readonly op: CondOp;
  readonly value: string;
}

export interface CondGroup {
  readonly id: string;
  readonly op: CondGroupOp;
  readonly clauses: readonly CondClause[];
}

const OPS: readonly CondOp[] = ['==', '!=', '>', '<', '>=', '<='];
const GROUP_OPS: readonly CondGroupOp[] = ['AND', 'OR'];

let _idCounter = 0;
function nextId(prefix: string): string {
  _idCounter += 1;
  return `${prefix}-${Date.now()}-${_idCounter}`;
}

export interface ConditionalLogicBuilderProps {
  readonly initialSource?: string;
  readonly availableVariables?: readonly string[];
  readonly onChange?: (group: CondGroup) => void;
}

export function ConditionalLogicBuilder({
  initialSource,
  availableVariables,
  onChange,
}: ConditionalLogicBuilderProps): ReactElement {
  const [op, setOp] = useState<CondGroupOp>('AND');
  const [clauses, setClauses] = useState<CondClause[]>([
    { id: nextId('c'), variable: 'var.foo', op: '==', value: 'bar' },
  ]);

  // If a raw source is provided, attempt a best-effort parse. For now
  // we keep clauses as-is and show the raw in a readonly field so
  // authors can re-copy the canonical form.
  useEffect(() => {
    if (!onChange) return;
    onChange({ id: nextId('g'), op, clauses });
  }, [op, clauses, onChange]);

  const updateClause = (id: string, patch: Partial<CondClause>): void => {
    setClauses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const removeClause = (id: string): void => {
    setClauses((prev) => prev.filter((c) => c.id !== id));
  };

  const addClause = (): void => {
    setClauses((prev) => [
      ...prev,
      { id: nextId('c'), variable: 'var.foo', op: '==', value: '' },
    ]);
  };

  const renderedSource = clauses
    .map((c) => `${c.variable} ${c.op} ${c.value.startsWith('"') || /^-?\d/.test(c.value) ? c.value : `"${c.value.replace(/"/g, '\\"')}"`}`)
    .join(` ${op} `);

  return (
    <div className="prototyping-conditional" data-testid="prototyping-conditional">
      <div style={{ fontSize: 11, color: 'var(--muted, #888)', marginBottom: 4 }}>Conditional logic</div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          background: 'var(--bg-secondary, #111)',
          border: '1px solid var(--border, #333)',
          borderRadius: 4,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Combine with</span>
        <select
          value={op}
          onChange={(e) => setOp(e.target.value as CondGroupOp)}
          data-testid="conditional-group-op"
          style={{
            padding: '2px 6px',
            border: '1px solid var(--border, #333)',
            background: 'var(--bg, #000)',
            color: 'var(--fg, #eee)',
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          {GROUP_OPS.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {clauses.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr) auto',
              gap: 4,
              alignItems: 'center',
            }}
            data-testid={`conditional-clause-${c.id}`}
          >
            <input
              value={c.variable}
              onChange={(e) => updateClause(c.id, { variable: e.target.value })}
              list={availableVariables ? 'conditional-vars' : undefined}
              data-testid={`conditional-var-${c.id}`}
              style={{
                padding: '4px 6px',
                border: '1px solid var(--border, #333)',
                background: 'var(--bg-secondary, #111)',
                color: 'var(--fg, #eee)',
                borderRadius: 4,
                fontSize: 11,
                fontFamily: 'monospace',
              }}
            />
            <select
              value={c.op}
              onChange={(e) => updateClause(c.id, { op: e.target.value as CondOp })}
              data-testid={`conditional-op-${c.id}`}
              style={{
                padding: '4px 4px',
                border: '1px solid var(--border, #333)',
                background: 'var(--bg-secondary, #111)',
                color: 'var(--fg, #eee)',
                borderRadius: 4,
                fontSize: 11,
              }}
            >
              {OPS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <input
              value={c.value}
              onChange={(e) => updateClause(c.id, { value: e.target.value })}
              placeholder="value"
              data-testid={`conditional-value-${c.id}`}
              style={{
                padding: '4px 6px',
                border: '1px solid var(--border, #333)',
                background: 'var(--bg-secondary, #111)',
                color: 'var(--fg, #eee)',
                borderRadius: 4,
                fontSize: 11,
                fontFamily: 'monospace',
              }}
            />
            <button
              type="button"
              onClick={() => removeClause(c.id)}
              style={{
                padding: '4px 6px',
                border: '1px solid var(--border, #333)',
                background: 'transparent',
                color: 'var(--fg, #eee)',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
              }}
              data-testid={`conditional-remove-${c.id}`}
              aria-label="Remove clause"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addClause}
        data-testid="conditional-add"
        style={{
          width: '100%',
          marginTop: 6,
          padding: '4px 8px',
          border: '1px dashed var(--border, #444)',
          background: 'transparent',
          color: 'var(--muted, #888)',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 11,
        }}
      >
        + Add clause
      </button>

      {availableVariables && (
        <datalist id="conditional-vars">
          {availableVariables.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      )}

      <div
        style={{
          marginTop: 8,
          padding: '6px 8px',
          background: 'var(--bg-secondary, #111)',
          border: '1px solid var(--border, #333)',
          borderRadius: 4,
          fontSize: 11,
          fontFamily: 'monospace',
          color: 'var(--accent, #58a6ff)',
        }}
        data-testid="conditional-source"
        aria-label="Compiled expression source"
      >
        {initialSource ? `External: ${initialSource}` : renderedSource || '(empty)'}
      </div>
    </div>
  );
}