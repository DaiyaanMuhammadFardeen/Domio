/**
 * Single service status row.
 *
 * Renders the service name, a short description, the current
 * health badge, the 90-day uptime bar, and the 90-day uptime %.
 *
 * The component is purely presentational — all data is supplied
 * via props so it can be reused in tests and other surfaces
 * (e.g. an admin console).
 */

import type { JSX } from 'react';
import type { StatusService } from '../../lib/status-types';
import { UptimeBar } from './UptimeBar';

const STATUS_LABEL: Record<StatusService['status'], string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
  maintenance: 'Maintenance',
};

const STATUS_CLASS: Record<StatusService['status'], string> = {
  operational: 'status-pill--ok',
  degraded: 'status-pill--degraded',
  partial_outage: 'status-pill--partial',
  major_outage: 'status-pill--outage',
  maintenance: 'status-pill--maintenance',
};

export interface ServiceRowProps {
  readonly service: StatusService;
}

export function ServiceRow({ service }: ServiceRowProps): JSX.Element {
  return (
    <li
      className="status-service"
      data-testid={`status-service-${service.id}`}
    >
      <div className="status-service__head">
        <div className="status-service__title">
          <h3 className="status-service__name">{service.name}</h3>
          <p className="status-service__desc">{service.description}</p>
        </div>
        <span
          className={`status-pill ${STATUS_CLASS[service.status]}`}
          aria-label={`Status: ${STATUS_LABEL[service.status]}`}
        >
          {STATUS_LABEL[service.status]}
        </span>
      </div>
      <div className="status-service__uptime">
        <UptimeBar history={service.history} />
        <span className="status-service__uptime-pct">
          {service.uptime_pct_90d.toFixed(2)}% uptime / 90d
        </span>
      </div>
    </li>
  );
}

export default ServiceRow;
