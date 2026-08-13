/**
 * @domio/poll-engine — audit emission.
 *
 * Hash-chained audit log via @domio/audit-ts. Captures every state
 * mutation (create, open, close, vote).
 */

import { Chain, type Event as AuditEvent, type JsonObject } from '@domio/audit-ts';

export type PollAuditAction =
  | 'poll.create'
  | 'poll.update'
  | 'poll.open'
  | 'poll.close'
  | 'poll.archive'
  | 'poll.vote';

export interface PollAuditEvent {
  actor_id: string;
  poll_id: string;
  workspace_id: string;
  session_id: string;
  ts: number;
  action: PollAuditAction;
  before?: JsonObject | undefined;
  after?: JsonObject | undefined;
  meta?: JsonObject | undefined;
}

export interface StoredAuditRecord {
  event: PollAuditEvent;
  signed: AuditEvent;
}

export interface PollAuditEmitter {
  emit(event: PollAuditEvent): Promise<{ seq: number; hash: string }>;
  verify(seq?: number): Promise<{ ok: true } | { ok: false; brokenAt: number }>;
  load(): Promise<{ seq: number; events: PollAuditEvent[] }>;
}

export class HashChainedPollAuditEmitter implements PollAuditEmitter {
  private readonly chain: Chain;
  private readonly keyId: string;
  private readonly agentSessionId: string;
  private readonly records: StoredAuditRecord[] = [];

  constructor(args: {
    workspaceId: string;
    key: Uint8Array;
    keyId?: string;
    agentSessionId?: string;
  }) {
    this.chain = new Chain();
    this.keyId = args.keyId ?? `poll-engine-${args.workspaceId}`;
    const keyHex = bytesToHex(args.key);
    this.chain.loadKey({
      kid: this.keyId,
      keyHex,
      rotatedAt: new Date(0),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      overlapUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
    this.agentSessionId = args.agentSessionId ?? 'poll-engine-default';
  }

  async emit(event: PollAuditEvent): Promise<{ seq: number; hash: string }> {
    const payload: JsonObject = {
      actor_id: event.actor_id,
      poll_id: event.poll_id,
      workspace_id: event.workspace_id,
      session_id: event.session_id,
      ts: event.ts,
      action: event.action,
      before: event.before ?? null,
      after: event.after ?? null,
      meta: event.meta ?? {},
    };
    const signed = await this.chain.build({
      workspaceId: event.workspace_id,
      agentSessionId: this.agentSessionId,
      sessionId: event.session_id,
      toolCallId: '',
      eventType: event.action,
      payload,
    });
    this.records.push({ event, signed });
    return { seq: signed.seq, hash: signed.hash };
  }

  async verify(seq?: number): Promise<{ ok: true } | { ok: false; brokenAt: number }> {
    try {
      const count = seq ?? this.records.length;
      const slice = this.records.slice(0, count).map((r) => r.signed);
      await this.chain.verifyChain(slice);
      return { ok: true };
    } catch {
      return { ok: false, brokenAt: 0 };
    }
  }

  async load(): Promise<{ seq: number; events: PollAuditEvent[] }> {
    return { seq: this.records.length, events: this.records.map((r) => r.event) };
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += (bytes[i] as number).toString(16).padStart(2, '0');
  }
  return s;
}
