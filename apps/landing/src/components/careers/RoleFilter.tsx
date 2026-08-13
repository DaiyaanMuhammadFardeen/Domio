/**
 * RoleFilter — dropdown controls for department and location.
 *
 * S12.11 — a client component. The parent owns the filter state and
 * passes derived `roles` down; this component only emits changes.
 */

'use client';

import { useId, type ChangeEvent, type JSX } from 'react';
import type { Department, RoleLocation } from '../../lib/careers-data';

export interface RoleFilterValue {
  readonly department: Department | 'all';
  readonly location: RoleLocation | 'all';
}

export interface RoleFilterProps {
  readonly value: RoleFilterValue;
  readonly onChange: (next: RoleFilterValue) => void;
  readonly counts: {
    readonly total: number;
    readonly visible: number;
  };
}

const DEPARTMENT_OPTIONS: ReadonlyArray<{
  readonly value: Department | 'all';
  readonly label: string;
}> = [
  { value: 'all', label: 'All departments' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'design', label: 'Design' },
  { value: 'product', label: 'Product' },
  { value: 'go-to-market', label: 'Go-to-Market' },
  { value: 'operations', label: 'Operations' },
  { value: 'finance', label: 'Finance' },
];

const LOCATION_OPTIONS: ReadonlyArray<{
  readonly value: RoleLocation | 'all';
  readonly label: string;
}> = [
  { value: 'all', label: 'All locations' },
  { value: 'remote', label: 'Remote' },
  { value: 'sf', label: 'San Francisco' },
  { value: 'nyc', label: 'New York' },
  { value: 'berlin', label: 'Berlin' },
  { value: 'singapore', label: 'Singapore' },
];

export function RoleFilter({ value, onChange, counts }: RoleFilterProps): JSX.Element {
  const deptId = useId();
  const locId = useId();

  function handleDept(e: ChangeEvent<HTMLSelectElement>): void {
    onChange({ ...value, department: e.target.value as Department | 'all' });
  }

  function handleLoc(e: ChangeEvent<HTMLSelectElement>): void {
    onChange({ ...value, location: e.target.value as RoleLocation | 'all' });
  }

  return (
    <div className="careers-filter" data-testid="role-filter">
      <div className="careers-filter__field">
        <label className="careers-filter__label" htmlFor={`${deptId}-department`}>
          Department
        </label>
        <select
          id={`${deptId}-department`}
          className="careers-filter__select"
          value={value.department}
          onChange={handleDept}
          data-testid="role-filter-department"
        >
          {DEPARTMENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="careers-filter__field">
        <label className="careers-filter__label" htmlFor={`${locId}-location`}>
          Location
        </label>
        <select
          id={`${locId}-location`}
          className="careers-filter__select"
          value={value.location}
          onChange={handleLoc}
          data-testid="role-filter-location"
        >
          {LOCATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <p className="careers-filter__count" data-testid="role-filter-count">
        Showing {counts.visible} of {counts.total} roles
      </p>
    </div>
  );
}

export default RoleFilter;
