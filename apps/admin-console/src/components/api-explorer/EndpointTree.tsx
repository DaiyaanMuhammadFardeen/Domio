/**
 * EndpointTree — Wave 10 §S10.3.
 *
 * Left column of the API explorer. Lists every endpoint grouped by
 * resource. Clicking a leaf selects that endpoint and notifies the
 * parent so the request builder can populate.
 */

'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import type { EndpointDef, EndpointMethod } from '../../lib/api-explorer-service';

const METHOD_COLOR: Readonly<Record<EndpointMethod, string>> = {
  GET: 'bg-emerald-50 text-emerald-700',
  POST: 'bg-brand-50 text-brand-700',
  PUT: 'bg-amber-50 text-amber-700',
  PATCH: 'bg-amber-50 text-amber-700',
  DELETE: 'bg-rose-50 text-rose-700',
};

export interface EndpointTreeProps {
  endpoints: ReadonlyArray<EndpointDef>;
  selectedKey: string | null;
  onSelect: (endpoint: EndpointDef) => void;
}

function endpointKey(e: EndpointDef): string {
  return `${e.method} ${e.path}`;
}

export function EndpointTree({ endpoints, selectedKey, onSelect }: EndpointTreeProps) {
  const grouped = useMemo(() => {
    const out = new Map<string, EndpointDef[]>();
    for (const e of endpoints) {
      const arr = out.get(e.group) ?? [];
      arr.push(e);
      out.set(e.group, arr);
    }
    return Array.from(out.entries());
  }, [endpoints]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(grouped.map(([g]) => g)));

  function toggleGroup(group: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }

  if (grouped.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-xs text-slate-500">No endpoints available.</div>
    );
  }

  return (
    <nav aria-label="Endpoints" className="overflow-y-auto py-2">
      {grouped.map(([group, eps]) => {
        const open = openGroups.has(group);
        return (
          <div key={group} className="mb-1">
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
              aria-expanded={open}
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              )}
              <span>{group}</span>
              <span className="ml-auto text-[10px] font-normal text-slate-400">{eps.length}</span>
            </button>
            {open && (
              <ul role="list" className="mb-1">
                {eps.map((e) => {
                  const key = endpointKey(e);
                  const selected = key === selectedKey;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => onSelect(e)}
                        aria-current={selected ? 'true' : undefined}
                        className={clsx(
                          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50',
                          selected && 'bg-brand-50',
                        )}
                      >
                        <span
                          className={clsx(
                            'inline-flex w-14 justify-center rounded px-1.5 py-0.5 text-[10px] font-bold',
                            METHOD_COLOR[e.method],
                          )}
                        >
                          {e.method}
                        </span>
                        <span
                          className={clsx(
                            'truncate font-mono text-xs',
                            selected ? 'text-brand-900' : 'text-slate-700',
                          )}
                          title={e.path}
                        >
                          {e.path}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
