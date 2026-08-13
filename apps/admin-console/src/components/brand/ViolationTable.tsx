'use client';

/**
 * ViolationTable — expandable violation report.
 *
 * Per Wave 8 §S8.2. Click a row to expand the slide/element details.
 */

import { useState, type ReactElement } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge, type BadgeTone } from '../Badge';
import type { BrandViolation, BrandViolationSeverity } from '../../lib/brand-governance-service';

export interface ViolationTableProps {
  readonly rows: ReadonlyArray<BrandViolation>;
  readonly onOpen?: (violationId: string) => void;
}

const SEVERITY_TONE: Readonly<Record<BrandViolationSeverity, BadgeTone>> = {
  high: 'red',
  medium: 'amber',
  low: 'grey',
};

const KIND_LABEL: Readonly<Record<BrandViolation['kind'], string>> = {
  'off-brand-color': 'Off-brand color',
  'forbidden-font': 'Forbidden font',
  'logo-misuse': 'Logo misuse',
};

export function ViolationTable({ rows, onOpen }: ViolationTableProps): ReactElement {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (onOpen) onOpen(id);
  }

  if (rows.length === 0) {
    return (
      <div
        data-testid="violation-table"
        className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"
      >
        No brand violations in this workspace.
      </div>
    );
  }

  return (
    <div
      data-testid="violation-table"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="w-8" scope="col" aria-label="Expand" />
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
              Deck
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
              Kind
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
              Severity
            </th>
            <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
              Slide
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((v) => {
            const isOpen = expanded.has(v.id);
            return (
              <>
                <tr
                  key={v.id}
                  data-testid={`violation-row-${v.id}`}
                  onClick={() => toggle(v.id)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="pl-3 text-slate-400">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-800">
                    <div className="font-medium">{v.deck_title}</div>
                    <div className="text-xs text-slate-500">{v.deck_id}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{KIND_LABEL[v.kind]}</td>
                  <td className="px-3 py-2">
                    <Badge tone={SEVERITY_TONE[v.severity]}>{v.severity}</Badge>
                  </td>
                  <td className={clsx('px-3 py-2 text-right tabular-nums text-slate-600')}>
                    {v.slide_index === null ? '—' : `#${v.slide_index + 1}`}
                  </td>
                </tr>
                {isOpen && (
                  <tr
                    key={`${v.id}-expand`}
                    data-testid={`violation-expand-${v.id}`}
                    className="bg-slate-50"
                  >
                    <td colSpan={5} className="px-3 py-3">
                      <div className="grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-3">
                        <div>
                          <span className="font-semibold text-slate-700">Deck ID:</span>{' '}
                          <code>{v.deck_id}</code>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-700">Slide:</span>{' '}
                          {v.slide_index === null ? '—' : v.slide_index}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-700">Element:</span>{' '}
                          <code>{v.element_id ?? '—'}</code>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}