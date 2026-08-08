/**
 * @domio/raise-hand-queue — domain types.
 *
 * Phase 16 W8. FIFO queue of audience members who raised a hand. The
 * presenter can `call` the head of the queue (clearing the rest) or
 * `dismiss` an individual hand. `expire` runs lazily on read.
 */

export type RaiseHandStatus = 'queued' | 'called' | 'dismissed' | 'expired';

export interface RaiseHand {
  readonly id: string;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly participant_id: string;
  readonly status: RaiseHandStatus;
  readonly position: number;
  readonly raised_at_ms: number;
  readonly resolved_at_ms: number | null;
  readonly version: number;
}

export class RaiseHandError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'RaiseHandError';
  }
}
