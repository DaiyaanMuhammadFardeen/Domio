/**
 * Connector framework — metrics (Phase 08).
 *
 * In-memory counters mirroring the theme service pattern.
 * Production wires Prometheus histograms at composition time.
 */

export interface ConnectorMetricSnapshot {
  readonly pingTotal: number;
  readonly pingByConnector: Record<string, number>;
  readonly queryTotal: number;
  readonly queryByConnector: Record<string, number>;
  readonly errorTotal: number;
  readonly errorByConnector: Record<string, number>;
}

export class ConnectorMetrics {
  pingTotal = 0;
  pingByConnector: Record<string, number> = {};
  queryTotal = 0;
  queryByConnector: Record<string, number> = {};
  errorTotal = 0;
  errorByConnector: Record<string, number> = {};

  recordPing(connector_id: string): void {
    this.pingTotal++;
    this.pingByConnector[connector_id] = (this.pingByConnector[connector_id] ?? 0) + 1;
  }

  recordQuery(connector_id: string): void {
    this.queryTotal++;
    this.queryByConnector[connector_id] = (this.queryByConnector[connector_id] ?? 0) + 1;
  }

  recordError(connector_id: string): void {
    this.errorTotal++;
    this.errorByConnector[connector_id] = (this.errorByConnector[connector_id] ?? 0) + 1;
  }

  snapshot(): ConnectorMetricSnapshot {
    return {
      pingTotal: this.pingTotal,
      pingByConnector: { ...this.pingByConnector },
      queryTotal: this.queryTotal,
      queryByConnector: { ...this.queryByConnector },
      errorTotal: this.errorTotal,
      errorByConnector: { ...this.errorByConnector },
    };
  }
}
