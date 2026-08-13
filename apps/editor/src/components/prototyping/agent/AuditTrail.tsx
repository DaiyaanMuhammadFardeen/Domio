'use client';

/**
 * AuditTrail — M8 surface + Wave 10 §S10.9 tool-call transcript viewer.
 *
 * Hardened version of the Wave 6 component:
 *   - Top filter bar (agent, time range, tool multi-select, show-human toggle).
 *   - List of tool-call entries with timestamp, agent badge, tool badge,
 *     args summary, result status badge, latency, expand arrow.
 *   - Click to expand → full request + response JSON pretty-printed.
 *   - Loading + error states + empty state.
 *
 * The legacy Wave 6 props (`entries: readonly AuditEntryView[]`,
 * `onDiff`) and `m8-audit-*` test ids are preserved so callers and
 * downstream tests continue to compile.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

import {
  distinctAgents,
  distinctTools,
  formatRelative,
  listAuditEntriesWithSource,
  rangeStartMs,
  type AuditEntry,
  type AuditEntryKind,
} from '../../../lib/audit-trail-service.js';
import { AuditEntryDetail } from './AuditEntryDetail.js';
import { AuditFilterBar, type AuditTimeRange } from './AuditFilterBar.js';

/* -------------------------------------------------------------------------- */
/* Legacy public types — kept for backwards compatibility                     */
/* -------------------------------------------------------------------------- */

export type AuditSource = 'human' | 'agent';

export interface AuditEntryView {
  readonly id: string;
  readonly agentId: string;
  readonly source?: AuditSource;
  readonly toolName: string;
  readonly timestamp: string;
  readonly errorCode?: string;
  readonly input?: unknown;
  readonly output?: unknown;
}

/* -------------------------------------------------------------------------- */
/* New mode: fetches entries via the service                                   */
/* -------------------------------------------------------------------------- */

export interface AuditTrailLiveProps {
  readonly mode?: 'live' | undefined;
  readonly deckId?: string | undefined;
  readonly initialEntries?: readonly AuditEntry[] | undefined;
  readonly pageSize?: number | undefined;
  readonly onDiff?: ((entry: AuditEntry) => void) | undefined;
  readonly dataTestId?: string | undefined;
}

/* -------------------------------------------------------------------------- */
/* Legacy mode: caller provides pre-built entries                             */
/* -------------------------------------------------------------------------- */

export interface AuditTrailLegacyProps {
  readonly mode?: 'legacy' | undefined;
  readonly entries: readonly AuditEntryView[];
  readonly onDiff?: ((entry: AuditEntryView) => void) | undefined;
}

export type AuditTrailProps = AuditTrailLiveProps | AuditTrailLegacyProps;

function summarizeArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return '()';
  const parts: string[] = [];
  for (const k of keys) {
    const v = args[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      parts.push(`${k}="${v.length > 16 ? `${v.slice(0, 15)}…` : v}"`);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      parts.push(`${k}=${String(v)}`);
    } else {
      parts.push(`${k}=…`);
    }
  }
  return parts.length === 0 ? '()' : `(${parts.join(', ')})`;
}

function summarizeResult(resp: Record<string, unknown>, status: number): string {
  if (status >= 400) return `error ${status}`;
  if (resp['ok'] === false) return `rejected (${status})`;
  if (resp['id'] !== undefined) return `id=${String(resp['id'])}`;
  if (resp['summary'] !== undefined) {
    const s = String(resp['summary']);
    return s.length > 40 ? `${s.slice(0, 39)}…` : s;
  }
  const keys = Object.keys(resp);
  return keys.length === 0 ? 'ok' : `ok (${keys.length} fields)`;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function AuditTrail(props: AuditTrailProps): ReactElement {
  // Detect legacy usage by the presence of the `entries` field (which
  // only exists on the legacy mode interface).
  if ('entries' in props) {
    return <LegacyAuditTrail entries={props.entries} onDiff={props.onDiff} />;
  }
  return <LiveAuditTrail {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Legacy (Wave 6) renderer                                                   */
/* -------------------------------------------------------------------------- */

interface LegacyProps {
  readonly entries: readonly AuditEntryView[];
  readonly onDiff?: ((entry: AuditEntryView) => void) | undefined;
}

function LegacyAuditTrail({ entries, onDiff }: LegacyProps): ReactElement {
  const [openId, setOpenId] = useState<string | null>(null);
  const sorted = useMemo(
    () => entries.slice().sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    [entries],
  );

  if (sorted.length === 0) {
    return (
      <div data-testid="m8-audit-empty" role="status">
        <FormattedMessage id="editor.agent.audit.empty" />
      </div>
    );
  }

  return (
    <div data-testid="m8-audit-root" aria-label="Audit trail">
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {sorted.map((entry) => {
          const open = openId === entry.id;
          const badge = entry.source ?? 'agent';
          return (
            <li
              key={entry.id}
              data-testid="m8-audit-row"
              data-source={badge}
              data-tool={entry.toolName}
              aria-expanded={open}
            >
              <button
                type="button"
                data-testid="m8-audit-toggle"
                onClick={() => setOpenId(open ? null : entry.id)}
              >
                <span data-testid="m8-audit-tool">{entry.toolName}</span>
                <span data-testid="m8-audit-agent">{entry.agentId}</span>
                <span data-testid="m8-audit-time">{entry.timestamp}</span>
                <span data-testid="m8-audit-badge">{badge}</span>
              </button>
              {open ? (
                <div data-testid="m8-audit-detail">
                  <pre data-testid="m8-audit-input">{stringify(entry.input)}</pre>
                  <pre data-testid="m8-audit-output">
                    {entry.errorCode
                      ? `[${entry.errorCode}] ${stringify(entry.output)}`
                      : stringify(entry.output)}
                  </pre>
                  {onDiff ? (
                    <button type="button" data-testid="m8-audit-diff" onClick={() => onDiff(entry)}>
                      Show diff
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/* -------------------------------------------------------------------------- */
/* Live (Wave 10 §S10.9) renderer                                             */
/* -------------------------------------------------------------------------- */

interface LiveProps {
  readonly deckId?: string | undefined;
  readonly initialEntries?: readonly AuditEntry[] | undefined;
  readonly pageSize?: number | undefined;
  readonly onDiff?: ((entry: AuditEntry) => void) | undefined;
  readonly dataTestId?: string | undefined;
}

function LiveAuditTrail({
  deckId,
  initialEntries,
  onDiff,
  dataTestId = 'audit-trail',
}: LiveProps): ReactElement {
  void deckId; // reserved for future server-side scoping
  const [entries, setEntries] = useState<readonly AuditEntry[]>(() => initialEntries ?? []);
  const [loading, setLoading] = useState<boolean>(initialEntries === undefined);
  const [error, setError] = useState<string | null>(null);

  const [agentId, setAgentId] = useState<string>('');
  const [range, setRange] = useState<AuditTimeRange>('24h');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [showHuman, setShowHuman] = useState<boolean>(true);

  const fetchEntries = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const sinceMs = rangeStartMs(range);
      const kind: 'all' | 'agent_call' = showHuman ? 'all' : 'agent_call';
      const result = await listAuditEntriesWithSource({
        agentId: agentId || undefined,
        sinceMs,
        kind,
      });
      let list = result.entries;
      if (selectedTools.length > 0) {
        const wanted = new Set(selectedTools);
        list = list.filter((e) => wanted.has(e.tool));
      }
      setEntries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setLoading(false);
    }
  }, [agentId, range, selectedTools, showHuman]);

  useEffect(() => {
    if (initialEntries !== undefined) return;
    void fetchEntries();
  }, [fetchEntries, initialEntries]);

  const sorted = useMemo(
    () => entries.slice().sort((a, b) => b.timestamp_ms - a.timestamp_ms),
    [entries],
  );

  const agentOptions = useMemo(() => distinctAgents(entries), [entries]);
  const toolOptions = useMemo(() => distinctTools(entries), [entries]);

  const filtered = useMemo(() => {
    if (!showHuman) {
      return sorted.filter((e) => e.kind === 'agent_call');
    }
    return sorted;
  }, [sorted, showHuman]);

  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section data-testid={dataTestId} aria-label="Audit trail">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
        <h2 style={{ fontSize: 14, margin: 0 }}>
          <FormattedMessage id="editor.agent.audit.heading" />
        </h2>
        <button
          type="button"
          onClick={() => void fetchEntries()}
          data-testid={`${dataTestId}-refresh`}
          style={{ marginLeft: 'auto', fontSize: 11 }}
        >
          ↻
        </button>
      </header>

      <AuditFilterBar
        agents={agentOptions}
        tools={toolOptions}
        agentId={agentId}
        onAgentChange={setAgentId}
        range={range}
        onRangeChange={setRange}
        selectedTools={selectedTools}
        onToolsChange={setSelectedTools}
        showHuman={showHuman}
        onShowHumanChange={setShowHuman}
      />

      {loading ? (
        <div
          data-testid={`${dataTestId}-loading`}
          role="status"
          style={{ padding: 16, fontSize: 12, color: 'rgba(0,0,0,0.6)' }}
        >
          Loading…
        </div>
      ) : null}

      {error ? (
        <div
          data-testid={`${dataTestId}-error`}
          role="alert"
          style={{ padding: 16, fontSize: 12, color: 'var(--color-danger-fg, currentColor)' }}
        >
          <FormattedMessage id="editor.agent.audit.error.fetch" />
        </div>
      ) : null}

      {!loading && !error && filtered.length === 0 ? (
        <div
          data-testid={`${dataTestId}-empty`}
          role="status"
          style={{ padding: 16, fontSize: 12, color: 'rgba(0,0,0,0.6)' }}
        >
          <FormattedMessage id="editor.agent.audit.empty" />
        </div>
      ) : null}

      {!loading && !error && filtered.length > 0 ? (
        <ul data-testid={`${dataTestId}-list`} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {filtered.map((entry) => (
            <AuditRow
              key={entry.id}
              entry={entry}
              open={openId === entry.id}
              onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
              onDiff={onDiff}
              dataTestId={`${dataTestId}-row`}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Row                                                                        */
/* -------------------------------------------------------------------------- */

interface AuditRowProps {
  readonly entry: AuditEntry;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onDiff?: ((entry: AuditEntry) => void) | undefined;
  readonly dataTestId: string;
}

function AuditRow({ entry, open, onToggle, onDiff, dataTestId }: AuditRowProps): ReactElement {
  const kindLabelId =
    entry.kind === 'human_edit'
      ? 'editor.agent.audit.entry.kind.human'
      : 'editor.agent.audit.entry.kind.agent';
  const isHuman = entry.kind === 'human_edit';

  return (
    <li
      data-testid={dataTestId}
      data-kind={entry.kind}
      data-agent={entry.agent_id}
      data-tool={entry.tool}
      data-status={entry.status}
      aria-expanded={open}
      style={{
        padding: '8px 0',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        background: isHuman ? 'rgba(99,102,241,0.04)' : 'transparent',
      }}
    >
      <button
        type="button"
        data-testid={`${dataTestId}-toggle`}
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          aria-hidden="true"
          data-testid={`${dataTestId}-arrow`}
          style={{ width: 12, fontSize: 10, color: 'rgba(0,0,0,0.5)' }}
        >
          {open ? '▾' : '▸'}
        </span>
        <span
          data-testid={`${dataTestId}-time`}
          style={{ fontSize: 11, color: 'rgba(0,0,0,0.6)', minWidth: 64 }}
        >
          {formatRelative(entry.timestamp_ms)}
        </span>
        <span
          data-testid={`${dataTestId}-kind`}
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '1px 6px',
            borderRadius: 4,
            background: isHuman ? 'rgba(99,102,241,0.18)' : 'rgba(34,197,94,0.18)',
            color: isHuman
              ? 'var(--color-primary-fg, currentColor)'
              : 'var(--color-success-fg, currentColor)',
          }}
        >
          <FormattedMessage id={kindLabelId} />
        </span>
        <span data-testid={`${dataTestId}-agent`} style={{ fontSize: 11, fontWeight: 500 }}>
          {entry.agent_name}
        </span>
        <span
          data-testid={`${dataTestId}-tool`}
          style={{
            fontSize: 11,
            fontFamily: 'monospace',
            padding: '1px 6px',
            borderRadius: 4,
            background: 'rgba(0,0,0,0.06)',
          }}
        >
          {entry.tool}
        </span>
        <span
          data-testid={`${dataTestId}-args`}
          style={{
            fontSize: 11,
            color: 'rgba(0,0,0,0.7)',
            fontFamily: 'monospace',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {summarizeArgs(entry.request)}
        </span>
        <span
          data-testid={`${dataTestId}-result`}
          style={{
            fontSize: 11,
            color: entry.status >= 400 ? 'var(--color-danger-fg, currentColor)' : 'rgba(0,0,0,0.7)',
            maxWidth: 220,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {summarizeResult(entry.response, entry.status)}
        </span>
        <span
          data-testid={`${dataTestId}-status`}
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '1px 6px',
            borderRadius: 999,
            background:
              entry.status >= 500
                ? 'rgba(220,38,38,0.15)'
                : entry.status >= 400
                  ? 'rgba(234,179,8,0.18)'
                  : 'rgba(34,197,94,0.18)',
            color: 'var(--color-fg, currentColor)',
          }}
        >
          {entry.status}
        </span>
        <span
          data-testid={`${dataTestId}-latency`}
          style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', minWidth: 48, textAlign: 'right' }}
        >
          <FormattedMessage
            id="editor.agent.audit.entry.latency"
            values={{ ms: entry.latency_ms }}
          />
        </span>
      </button>

      {open ? (
        <div
          data-testid={`${dataTestId}-detail`}
          style={{
            marginTop: 8,
            paddingLeft: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <AuditEntryDetail entry={entry} dataTestId={`${dataTestId}-detail-body`} />
          {onDiff ? (
            <button
              type="button"
              data-testid={`${dataTestId}-diff`}
              onClick={() => onDiff(entry)}
              style={{
                alignSelf: 'flex-start',
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 4,
                border: '1px solid rgba(0,0,0,0.2)',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              Show diff
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

// Re-export the type so callers can type their own consumers.
export type { AuditEntry, AuditEntryKind };

export default AuditTrail;
