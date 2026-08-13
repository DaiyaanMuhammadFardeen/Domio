/**
 * apps/presenter — ParkingLotClient.
 *
 * Talks to the parking_lot_item / wrap_up_slide tables via the presenter
 * service. The runtime is local; the server endpoint isn't wired yet —
 * it lands in apps/api when P15 W9 gets the full handler surface. The
 * client mirrors the API shape so we can swap fetch() for the service
 * without changing the component.
 */

export interface ParkingLotItem {
  id: string;
  workspace_id: string;
  presenter_session_id: string;
  audience_participant_id: string | null;
  text: string;
  status: 'open' | 'answered' | 'deferred' | 'deleted' | 'pinned';
  pin_order: number;
  promoted_to_agenda: boolean;
  promoted_to_qa: boolean;
  source: 'audience' | 'presenter' | 'p16_qa' | 'imported';
  p16_qa_item_id: string | null;
  created_at: string;
}

export class ParkingLotClientError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ParkingLotClientError';
  }
}

/** Local-only parking lot client backed by in-memory state. The real
 *  client will be wired in a follow-up; for now the UI demonstrates
 *  the interaction model with local-only data. */
export class ParkingLotClient {
  private readonly items = new Map<string, ParkingLotItem>();
  private nextOrder = 0;

  list(_sessionId: string): ParkingLotItem[] {
    return [...this.items.values()].sort(
      (a, b) => a.pin_order - b.pin_order || a.created_at.localeCompare(b.created_at),
    );
  }

  add(input: {
    sessionId: string;
    workspaceId: string;
    text: string;
    source?: ParkingLotItem['source'];
  }): ParkingLotItem {
    const id = cryptoId();
    const item: ParkingLotItem = {
      id,
      workspace_id: input.workspaceId,
      presenter_session_id: input.sessionId,
      audience_participant_id: null,
      text: input.text,
      status: 'open',
      pin_order: this.nextOrder++,
      promoted_to_agenda: false,
      promoted_to_qa: false,
      source: input.source ?? 'presenter',
      p16_qa_item_id: null,
      created_at: new Date().toISOString(),
    };
    this.items.set(id, item);
    return item;
  }

  pin(id: string): ParkingLotItem {
    const item = this.items.get(id);
    if (!item) throw new ParkingLotClientError(404, `parking lot item ${id} not found`);
    const updated: ParkingLotItem = { ...item, status: 'pinned' };
    this.items.set(id, updated);
    return updated;
  }

  unpin(id: string): ParkingLotItem {
    const item = this.items.get(id);
    if (!item) throw new ParkingLotClientError(404, `parking lot item ${id} not found`);
    const updated: ParkingLotItem = { ...item, status: 'open' };
    this.items.set(id, updated);
    return updated;
  }

  markAnswered(id: string, _answer: string): ParkingLotItem {
    const item = this.items.get(id);
    if (!item) throw new ParkingLotClientError(404, `parking lot item ${id} not found`);
    const updated: ParkingLotItem = { ...item, status: 'answered' };
    this.items.set(id, updated);
    return updated;
  }

  delete(id: string): void {
    this.items.delete(id);
  }
}

function cryptoId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return (
    c?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
  );
}
