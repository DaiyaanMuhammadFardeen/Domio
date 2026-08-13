'use client';

/**
 * Audit log filter bar — Wave 8 §S8.4.
 *
 * Stateful controls for actor, action, target type, from / to range.
 * Fires `onChange` whenever any input mutates; the page is responsible
 * for re-querying the service.
 */

import type { ChangeEvent } from 'react';
import { ALL_AUDIT_ACTIONS, ALL_AUDIT_TARGET_TYPES } from '../../lib/audit-service';
import type { AuditAction, AuditEvent, AuditFilter } from '../../lib/types';

export interface FilterBarProps {
  filter: AuditFilter;
  onChange: (next: AuditFilter) => void;
}

function datetimeLocalToMs(value: string): number | undefined {
  if (!value) return undefined;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return undefined;
  return ms;
}

function msToDatetimeLocal(ms: number | undefined): string {
  if (ms === undefined) return '';
  const d = new Date(ms);
  // datetime-local requires YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type TargetType = AuditEvent['target_type'];

// Mutable working copy used while building the next filter payload.
// `exactOptionalPropertyTypes` and readonly fields force us to copy
// each defined field explicitly rather than spreading. We use
// `field: T | undefined` instead of `field?: T` so we can assign
// `undefined` to clear a value.
interface MutableFilter {
  actor_id: string | undefined;
  action: AuditAction | undefined;
  target_type: TargetType | undefined;
  from_ms: number | undefined;
  to_ms: number | undefined;
}

function snapshot(filter: AuditFilter): MutableFilter {
  return {
    actor_id: filter.actor_id,
    action: filter.action,
    target_type: filter.target_type,
    from_ms: filter.from_ms,
    to_ms: filter.to_ms,
  };
}

function freeze(snap: MutableFilter): AuditFilter {
  // Build into a mutable bag and then return it typed as AuditFilter.
  // The returned object is treated as read-only by the consumer; we
  // just need a way to construct it under exactOptionalPropertyTypes.
  const bag: {
    actor_id?: string;
    action?: AuditAction;
    target_type?: TargetType;
    from_ms?: number;
    to_ms?: number;
  } = {};
  if (snap.actor_id !== undefined) bag.actor_id = snap.actor_id;
  if (snap.action !== undefined) bag.action = snap.action;
  if (snap.target_type !== undefined) bag.target_type = snap.target_type;
  if (snap.from_ms !== undefined) bag.from_ms = snap.from_ms;
  if (snap.to_ms !== undefined) bag.to_ms = snap.to_ms;
  return bag as AuditFilter;
}

export function FilterBar({ filter, onChange }: FilterBarProps) {
  function handleActorChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.trim();
    const snap = snapshot(filter);
    snap.actor_id = val === '' ? undefined : val;
    onChange(freeze(snap));
  }

  function handleActionChange(e: ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const snap = snapshot(filter);
    snap.action = val === '' ? undefined : (val as AuditAction);
    onChange(freeze(snap));
  }

  function handleTargetTypeChange(e: ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const snap = snapshot(filter);
    snap.target_type = val === '' ? undefined : (val as TargetType);
    onChange(freeze(snap));
  }

  function handleFromChange(e: ChangeEvent<HTMLInputElement>) {
    const snap = snapshot(filter);
    snap.from_ms = datetimeLocalToMs(e.target.value);
    onChange(freeze(snap));
  }

  function handleToChange(e: ChangeEvent<HTMLInputElement>) {
    const snap = snapshot(filter);
    snap.to_ms = datetimeLocalToMs(e.target.value);
    onChange(freeze(snap));
  }

  function handleClear() {
    onChange({});
  }

  return (
    <div
      data-testid="audit-filter-bar"
      className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3"
    >
      <div className="flex flex-col">
        <label
          htmlFor="audit-filter-actor"
          className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
        >
          Actor
        </label>
        <input
          id="audit-filter-actor"
          data-testid="audit-filter-actor"
          type="text"
          value={filter.actor_id ?? ''}
          onChange={handleActorChange}
          placeholder="e.g. u-alice"
          className="w-44 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div className="flex flex-col">
        <label
          htmlFor="audit-filter-action"
          className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
        >
          Action
        </label>
        <select
          id="audit-filter-action"
          data-testid="audit-filter-action"
          value={filter.action ?? ''}
          onChange={handleActionChange}
          className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All actions</option>
          {ALL_AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col">
        <label
          htmlFor="audit-filter-target-type"
          className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
        >
          Target type
        </label>
        <select
          id="audit-filter-target-type"
          data-testid="audit-filter-target-type"
          value={filter.target_type ?? ''}
          onChange={handleTargetTypeChange}
          className="w-40 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All targets</option>
          {ALL_AUDIT_TARGET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col">
        <label
          htmlFor="audit-filter-from"
          className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
        >
          From
        </label>
        <input
          id="audit-filter-from"
          data-testid="audit-filter-from"
          type="datetime-local"
          value={msToDatetimeLocal(filter.from_ms)}
          onChange={handleFromChange}
          className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div className="flex flex-col">
        <label
          htmlFor="audit-filter-to"
          className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
        >
          To
        </label>
        <input
          id="audit-filter-to"
          data-testid="audit-filter-to"
          type="datetime-local"
          value={msToDatetimeLocal(filter.to_ms)}
          onChange={handleToChange}
          className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <button
        type="button"
        data-testid="audit-filter-clear"
        onClick={handleClear}
        className="ml-auto inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
      >
        Clear filters
      </button>
    </div>
  );
}
