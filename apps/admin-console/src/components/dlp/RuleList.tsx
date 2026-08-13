'use client';

import { clsx } from 'clsx';
import { Pencil, Trash2 } from 'lucide-react';
import type { DLPRule } from '../../lib/types';

export interface RuleListProps {
  rules: ReadonlyArray<DLPRule>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onEdit: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}

/**
 * Tabular listing of DLP rules. Rows are selectable (when `onSelect`
 * is provided) so the parent can drive the test pane.
 */
export function RuleList({
  rules,
  selectedId,
  onSelect,
  onEdit,
  onToggle,
  onDelete,
}: RuleListProps) {
  return (
    <div
      data-testid="rule-list"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Name
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Kind
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Scopes
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Hits (24h)
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Enabled
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rules.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                No DLP rules configured.
              </td>
            </tr>
          ) : (
            rules.map((rule) => {
              const isSelected = selectedId === rule.id;
              return (
                <tr
                  key={rule.id}
                  data-testid={`rule-row-${rule.id}`}
                  onClick={() => onSelect?.(rule.id)}
                  className={clsx(
                    'transition-colors',
                    onSelect && 'cursor-pointer hover:bg-slate-50',
                    isSelected && 'bg-brand-50',
                  )}
                >
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-900">
                    {rule.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-600 capitalize">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      {rule.kind}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    <div className="flex flex-wrap gap-1">
                      {rule.scopes.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {rule.hits_24h}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <label className="inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => onToggle(rule.id, e.target.checked)}
                        data-testid={`rule-toggle-${rule.id}`}
                        aria-label={`Toggle ${rule.name}`}
                        className="h-3.5 w-3.5 accent-brand-600"
                      />
                    </label>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(rule.id);
                        }}
                        data-testid={`rule-edit-${rule.id}`}
                        aria-label={`Edit ${rule.name}`}
                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                      >
                        <Pencil className="h-3 w-3" aria-hidden />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(rule.id);
                        }}
                        data-testid={`rule-delete-${rule.id}`}
                        aria-label={`Delete ${rule.name}`}
                        className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}