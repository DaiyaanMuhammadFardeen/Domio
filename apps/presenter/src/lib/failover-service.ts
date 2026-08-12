/**
 * Failover service — promotes a backup presenter if the primary drops.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns an empty failover roster. The failover-svc client
 * will replace this in a later wave.
 */

export interface FailoverPeer {
  readonly id: string;
  readonly displayName: string;
  readonly priority: number;
  readonly lastSeenMs: number;
}

export const BOOTSTRAP_FAILOVER_PEERS: ReadonlyArray<FailoverPeer> = [];

export async function listFailoverPeers(
  _sessionId: string,
): Promise<ReadonlyArray<FailoverPeer>> {
  return BOOTSTRAP_FAILOVER_PEERS;
}