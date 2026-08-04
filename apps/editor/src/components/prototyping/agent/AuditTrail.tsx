'use client';

/**
 * AuditTrail — M8 surface for reviewing agent vs human edits.
 *
 * Renders a list of audit entries.  Each row shows the tool name, the
 * (potentially redacted) input / output, a { human | agent } badge, and a
 * diff-view toggle.  The component is data-testid prefixed `m8-audit-`
 * for stable test selectors.
 */

import { useMemo, useState, type ReactElement } from 'react';

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

export interface AuditTrailProps {
  readonly entries: readonly AuditEntryView[];
  readonly onDiff?: (entry: AuditEntryView) => void;
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AuditTrail({ entries, onDiff }: AuditTrailProps): ReactElement {
  const [openId, setOpenId] = useState<string | null>(null);

  const sorted = useMemo(
    () => entries.slice().sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    [entries],
  );

  if (sorted.length === 0) {
    return (
      <div data-testid="m8-audit-empty" role="status">
        No audit entries yet.
      </div>
    );
  }

  return (
    <div data-testid="m8-audit-root" aria-label="Audit trail">
      <ul>
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
                    {entry.errorCode ? `[${entry.errorCode}] ${stringify(entry.output)}` : stringify(entry.output)}
                  </pre>
                  {onDiff ? (
                    <button
                      type="button"
                      data-testid="m8-audit-diff"
                      onClick={() => onDiff(entry)}
                    >
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

export default AuditTrail;
