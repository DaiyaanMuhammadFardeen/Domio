/**
 * 90-day uptime visualisation.
 *
 * Renders one square per day (left = oldest, right = newest) in
 * a single horizontal row. Each cell is coloured by that day's
 * health state. The component is purely presentational and a
 * server component.
 */

import type { JSX } from 'react';
import type { ServiceHealth } from '../../lib/status-types';

const CELL_CLASS: Record<ServiceHealth, string> = {
  operational: 'status-uptime__cell--ok',
  degraded: 'status-uptime__cell--degraded',
  partial_outage: 'status-uptime__cell--partial',
  major_outage: 'status-uptime__cell--outage',
  maintenance: 'status-uptime__cell--maintenance',
};

const CELL_LABEL: Record<ServiceHealth, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
  maintenance: 'Maintenance',
};

export interface UptimeBarProps {
  readonly history: ReadonlyArray<ServiceHealth>;
}

export function UptimeBar({ history }: UptimeBarProps): JSX.Element {
  return (
    <div
      className="status-uptime"
      role="img"
      aria-label={`Uptime history, ${history.length} days`}
    >
      {history.map((day, i) => (
        <span
          key={i}
          className={`status-uptime__cell ${CELL_CLASS[day]}`}
          title={`Day ${i + 1}: ${CELL_LABEL[day]}`}
        />
      ))}
    </div>
  );
}

export default UptimeBar;
