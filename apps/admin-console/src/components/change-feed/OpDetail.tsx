/**
 * OpDetail — Wave 10 §S10.7.
 *
 * Pretty-prints the JSON payload of a single change-feed op. Used by
 * the expanded row of OpStream so admins can inspect the raw CRDT op.
 */

'use client';

export interface OpDetailProps {
  readonly payload: Record<string, unknown>;
  /** Optional trace id rendered alongside the JSON. */
  readonly traceId?: string;
}

export function OpDetail({ payload, traceId }: OpDetailProps) {
  const json = JSON.stringify(payload, null, 2);
  return (
    <div className="space-y-2 border-t border-slate-200 bg-slate-50 p-3">
      {traceId && (
        <div className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">trace_id:</span>{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">
            {traceId}
          </code>
        </div>
      )}
      <pre
        data-testid="op-detail-json"
        className="max-h-72 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100"
      >
        {json}
      </pre>
    </div>
  );
}

export default OpDetail;
