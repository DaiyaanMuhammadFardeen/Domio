/**
 * CareersClient — client wrapper that owns the role filter state.
 *
 * S12.11 — holds the department + location filter selections and
 * renders the RoleFilter + filtered grid of RoleCards.
 */

'use client';

import { useMemo, useState, type JSX } from 'react';
import type { Role } from '../../lib/careers-data';
import { RoleCard } from '../../components/careers/RoleCard';
import { RoleFilter, type RoleFilterValue } from '../../components/careers/RoleFilter';

export interface CareersClientProps {
  readonly roles: ReadonlyArray<Role>;
}

export function CareersClient({ roles }: CareersClientProps): JSX.Element {
  const [filter, setFilter] = useState<RoleFilterValue>({
    department: 'all',
    location: 'all',
  });

  const visible = useMemo<ReadonlyArray<Role>>(() => {
    return roles.filter((role) => {
      if (filter.department !== 'all' && role.department !== filter.department) {
        return false;
      }
      if (filter.location !== 'all' && role.location !== filter.location) {
        return false;
      }
      return true;
    });
  }, [roles, filter]);

  return (
    <div className="careers-roles">
      <RoleFilter
        value={filter}
        onChange={setFilter}
        counts={{ total: roles.length, visible: visible.length }}
      />
      {visible.length === 0 ? (
        <p className="careers-roles__empty" data-testid="roles-empty">
          No roles match these filters yet — try widening your search.
        </p>
      ) : (
        <ul className="careers-roles__list" data-testid="roles-list">
          {visible.map((role) => (
            <li key={role.id}>
              <RoleCard role={role} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CareersClient;