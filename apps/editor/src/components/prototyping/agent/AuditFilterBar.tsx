'use client';

/**
 * AuditFilterBar — filter strip for the audit trail.
 *
 * Per Wave 10 §S10.9: agent selector, time range, tool multi-select,
 * "show human edits" toggle. Controlled component — owner holds state.
 */

import { type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

export type AuditTimeRange = '1h' | '24h' | '7d' | 'all';

export interface AuditFilterBarProps {
  readonly agents: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly tools: readonly string[];
  /** Currently selected agent ID, or empty string for "all". */
  readonly agentId: string;
  readonly onAgentChange: (agentId: string) => void;
  readonly range: AuditTimeRange;
  readonly onRangeChange: (range: AuditTimeRange) => void;
  readonly selectedTools: readonly string[];
  readonly onToolsChange: (tools: string[]) => void;
  readonly showHuman: boolean;
  readonly onShowHumanChange: (showHuman: boolean) => void;
  readonly dataTestId?: string;
}

export function AuditFilterBar({
  agents,
  tools,
  agentId,
  onAgentChange,
  range,
  onRangeChange,
  selectedTools,
  onToolsChange,
  showHuman,
  onShowHumanChange,
  dataTestId = 'audit-filter-bar',
}: AuditFilterBarProps): ReactElement {
  const toggleTool = (tool: string): void => {
    const next = selectedTools.includes(tool)
      ? selectedTools.filter((t) => t !== tool)
      : [...selectedTools, tool];
    onToolsChange(next);
  };

  return (
    <div
      data-testid={dataTestId}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
        padding: '8px 0',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
        <FormattedMessage id="editor.agent.audit.filter.agent" />
        <select
          data-testid={`${dataTestId}-agent`}
          value={agentId}
          onChange={(e) => onAgentChange(e.target.value)}
          style={{ fontSize: 12, padding: '2px 4px', minWidth: 140 }}
        >
          <option value="">All</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
        <FormattedMessage id="editor.agent.audit.filter.range" />
        <select
          data-testid={`${dataTestId}-range`}
          value={range}
          onChange={(e) => onRangeChange(e.target.value as AuditTimeRange)}
          style={{ fontSize: 12, padding: '2px 4px', minWidth: 120 }}
        >
          <option value="1h">
            <FormattedMessage id="editor.agent.audit.filter.range.1h" />
          </option>
          <option value="24h">
            <FormattedMessage id="editor.agent.audit.filter.range.24h" />
          </option>
          <option value="7d">
            <FormattedMessage id="editor.agent.audit.filter.range.7d" />
          </option>
          <option value="all">
            <FormattedMessage id="editor.agent.audit.filter.range.all" />
          </option>
        </select>
      </label>

      <fieldset
        data-testid={`${dataTestId}-tools`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          fontSize: 11,
          border: 'none',
          padding: 0,
          margin: 0,
        }}
      >
        <legend style={{ padding: 0, fontSize: 11 }}>
          <FormattedMessage id="editor.agent.audit.filter.tool" />
        </legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tools.length === 0 ? (
            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>—</span>
          ) : (
            tools.map((tool) => {
              const checked = selectedTools.includes(tool);
              return (
                <label
                  key={tool}
                  data-testid={`${dataTestId}-tool-${tool}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 6px',
                    fontSize: 11,
                    borderRadius: 999,
                    border: '1px solid rgba(0,0,0,0.2)',
                    background: checked ? 'rgba(99,102,241,0.12)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTool(tool)}
                    data-testid={`${dataTestId}-tool-${tool}-checkbox`}
                  />
                  <span>{tool}</span>
                </label>
              );
            })
          )}
        </div>
      </fieldset>

      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          marginLeft: 'auto',
        }}
      >
        <input
          type="checkbox"
          checked={showHuman}
          onChange={(e) => onShowHumanChange(e.target.checked)}
          data-testid={`${dataTestId}-show-human`}
        />
        <FormattedMessage id="editor.agent.audit.filter.showHuman" />
      </label>
    </div>
  );
}

export default AuditFilterBar;
