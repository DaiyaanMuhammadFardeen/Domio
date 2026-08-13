/**
 * @domio/word-cloud-engine — audit emission.
 */

import { Chain, type Event as AuditEvent, type JsonObject } from '@domio/audit-ts';

export type WordCloudAuditAction =
  | 'word_cloud.create'
  | 'word_cloud.open'
  | 'word_cloud.close'
  | 'word_cloud.submit'
  | 'word_cloud.moderate';

export interface WordCloudAuditEvent {
  actor_id: string;
  cloud_id: string;
  workspace_id: string;
  session_id: string;
  ts: number;
  action: WordCloudAuditAction;
  before?: JsonObject | undefined;
  after?: JsonObject | undefined;
  meta?: JsonObject | undefined;
}

export interface StoredAuditRecord {
  event: WordCloudAuditEvent;
  signed: AuditEvent;
}

export interface WordCloudAuditEmitter {
  emit(event: WordCloudAuditEvent): Promise<{ seq: number; hash: string }>;
  verify(seq?: number): Promise<{ ok: true } | { ok: false; brokenAt: number }>;
  load(): Promise<{ seq: number; events: WordCloudAuditEvent[] }>;
}

export class HashChainedWordCloudAuditEmitter implements WordCloudAuditEmitter {
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
    this.keyId = args.keyId ?? `word-cloud-engine-${args.workspaceId}`;
    const keyHex = bytesToHex(args.key);
    this.chain.loadKey({
      kid: this.keyId,
      keyHex,
      rotatedAt: new Date(0),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      overlapUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
    this.agentSessionId = args.agentSessionId ?? 'word-cloud-engine-default';
  }

  async emit(event: WordCloudAuditEvent): Promise<{ seq: number; hash: string }> {
    const payload: JsonObject = {
      actor_id: event.actor_id,
      cloud_id: event.cloud_id,
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

  async load(): Promise<{ seq: number; events: WordCloudAuditEvent[] }> {
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
