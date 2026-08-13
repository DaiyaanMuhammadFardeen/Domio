'use client';

import { useMemo, useState, type ReactElement } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { clsx } from 'clsx';

export interface SortableColumn<T extends Record<string, unknown>> {
  key: keyof T & string;
  header: string;
  type: 'string' | 'number';
  align?: 'left' | 'right';
  format?: (value: T[keyof T & string], row: T) => string | ReactElement;
}

export interface SortableTableProps<T extends Record<string, unknown>> {
  rows: T[];
  columns: ReadonlyArray<SortableColumn<T>>;
  emptyMessage?: string;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

function compare(a: unknown, b: unknown, type: 'string' | 'number'): number {
  if (a === b) return 0;
  if (type === 'number') {
    const an = typeof a === 'number' ? a : Number(a);
    const bn = typeof b === 'number' ? b : Number(b);
    if (!Number.isFinite(an) && !Number.isFinite(bn)) return 0;
    if (!Number.isFinite(an)) return -1;
    if (!Number.isFinite(bn)) return 1;
    return an - bn;
  }
  return String(a ?? '').localeCompare(String(b ?? ''));
}

/**
 * Generic sortable table. Extended from dashboard to support
 * ReactElement format returns (for badges, buttons, etc).
 */
export function SortableTable<T extends Record<string, unknown>>({
  rows,
  columns,
  emptyMessage = 'No rows',
}: SortableTableProps<T>): ReactElement {
  const [sort, setSort] = useState<SortState>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const sortedRows = [...rows].sort((a, b) =>
      compare(a[col.key as keyof T] as unknown, b[col.key as keyof T] as unknown, col.type),
    );
    if (sort.dir === 'desc') sortedRows.reverse();
    return sortedRows;
  }, [rows, columns, sort]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={clsx(
                      'select-none whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600',
                      c.align === 'right' ? 'text-right' : 'text-left',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={clsx(
                        'inline-flex items-center gap-1 hover:text-slate-900',
                        active && 'text-slate-900',
                      )}
                    >
                      {c.header}
                      {active && sort?.dir === 'asc' && <ArrowUp className="h-3 w-3" aria-hidden />}
                      {active && sort?.dir === 'desc' && (
                        <ArrowDown className="h-3 w-3" aria-hidden />
                      )}
                      {!active && <ArrowUpDown className="h-3 w-3 opacity-30" aria-hidden />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-slate-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sorted.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  {columns.map((c) => {
                    const raw = row[c.key] as unknown;
                    const display = c.format ? c.format(raw as never, row) : String(raw ?? '');
                    return (
                      <td
                        key={c.key}
                        className={clsx(
                          'whitespace-nowrap px-4 py-2.5 text-slate-800',
                          c.align === 'right' && 'text-right tabular-nums',
                        )}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
