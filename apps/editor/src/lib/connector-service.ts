/**
 * Connector service — configures external data source connectors.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns an empty list (no connectors configured). The
 * connector-svc client will replace this in a later wave.
 */

export interface ConnectorDescriptor {
  readonly id: string;
  readonly kind: 'sheet' | 'postgres' | 'bigquery' | 'salesforce';
  readonly displayName: string;
  readonly status: 'connected' | 'disconnected' | 'error';
}

export const BOOTSTRAP_CONNECTORS: ReadonlyArray<ConnectorDescriptor> = [];

export async function listConnectors(
  _workspaceId: string,
): Promise<ReadonlyArray<ConnectorDescriptor>> {
  return BOOTSTRAP_CONNECTORS;
}