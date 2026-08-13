/**
 * Handoff service — passes a live session from one presenter to another.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns a placeholder handoff descriptor. The handoff-svc
 * client will replace this in a later wave.
 */

export interface HandoffDescriptor {
  readonly id: string;
  readonly sessionId: string;
  readonly fromPresenterId: string;
  readonly toPresenterId: string;
  readonly status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  readonly createdAtMs: number;
}

export const BOOTSTRAP_HANDOFFS: ReadonlyArray<HandoffDescriptor> = [];

export async function listHandoffs(_sessionId: string): Promise<ReadonlyArray<HandoffDescriptor>> {
  return BOOTSTRAP_HANDOFFS;
}
