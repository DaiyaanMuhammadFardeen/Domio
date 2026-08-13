/**
 * @domio/word-cloud-engine — orchestration service.
 *
 * Phase 16 W5. Receives raw submits, tokenizes them, optionally consults
 * a moderation hook (blocklist or ml), and stores the result. Aggregate
 * computation is lazy — `aggregate()` walks the submit log.
 *
 * The moderation hook is pluggable: callers pass a `moderator` callback
 * that returns a decision. If no moderator is provided, the engine
 * accepts all submits unmoderated.
 */

import type { EdgeBus } from '@domio/edge-pubsub';
import { encode } from '@domio/edge-pubsub';
import type { JsonObject } from '@domio/audit-ts';
import {
  type WordCloud,
  type WordCloudSubmit,
  type WordCloudAggregate,
  type ModerationDecision,
  WordCloudError,
} from './types.js';
import {
  type WordCloudStore,
  isWordCloudStore,
  notFoundError,
  closedError,
  tooLongError,
} from './store.js';
import { type IdempotencyStore, InMemoryIdempotencyStore } from './idempotency/index.js';
import { type WordCloudAuditEmitter, type WordCloudAuditEvent } from './audit/emit.js';
import {
  type WordCloudEngineMetrics,
  NullWordCloudEngineMetrics,
} from './observability/metrics.js';
import { tokenize } from './tokenize.js';

export type Moderator = (input: {
  workspace_id: string;
  session_id: string;
  cloud_id: string;
  raw_text: string;
  participant_id: string;
}) => Promise<ModerationDecision>;

export interface WordCloudEngineOptions {
  readonly store: WordCloudStore;
  readonly bus: EdgeBus;
  readonly audit: WordCloudAuditEmitter;
  readonly idempotency?: IdempotencyStore | undefined;
  readonly moderator?: Moderator | undefined;
  readonly metrics?: WordCloudEngineMetrics | undefined;
  readonly now_ms?: () => number;
  readonly id_factory?: () => string;
}

export interface CreateWordCloudInput {
  workspace_id: string;
  session_id: string;
  widget_id: string;
  prompt: string;
  allow_repeat?: boolean;
  stopwords?: ReadonlyArray<string>;
  max_chars?: number;
  created_by: string;
}

export interface SubmitInput {
  workspace_id: string;
  cloud_id: string;
  participant_id: string;
  raw_text: string;
  idempotency_key: string;
}

export class WordCloudEngine {
  private readonly store: WordCloudStore;
  private readonly bus: EdgeBus;
  private readonly idem: IdempotencyStore;
  private readonly audit: WordCloudAuditEmitter;
  private readonly moderator: Moderator | undefined;
  private readonly metrics: WordCloudEngineMetrics;
  private readonly now_ms: () => number;
  private readonly id_factory: () => string;

  constructor(opts: WordCloudEngineOptions) {
    if (!isWordCloudStore(opts.store)) {
      throw new Error('WordCloudEngine: store is required');
    }
    this.store = opts.store;
    this.bus = opts.bus;
    this.idem = opts.idempotency ?? new InMemoryIdempotencyStore();
    this.audit = opts.audit;
    this.moderator = opts.moderator;
    this.metrics = opts.metrics ?? new NullWordCloudEngineMetrics();
    this.now_ms = opts.now_ms ?? (() => Date.now());
    this.id_factory = opts.id_factory ?? (() => cryptoRandomId());
  }

  async create(input: CreateWordCloudInput): Promise<WordCloud> {
    const id = this.id_factory();
    const ts = this.now_ms();
    const cloud: WordCloud = {
      id,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      widget_id: input.widget_id,
      prompt: input.prompt,
      status: 'draft',
      allow_repeat: input.allow_repeat ?? false,
      stopwords: input.stopwords ?? [],
      max_chars: input.max_chars ?? 32,
      created_by: input.created_by,
      created_at_ms: ts,
      updated_at_ms: ts,
      version: 1,
    };
    const created = await this.store.create({ cloud });
    await this.emitAudit({
      actor_id: input.created_by,
      cloud_id: created.id,
      workspace_id: created.workspace_id,
      session_id: created.session_id,
      ts,
      action: 'word_cloud.create',
      after: cloudToJson(created),
    });
    this.metrics.clouds_created.inc(1, { workspace_id: created.workspace_id });
    return created;
  }

  async open(cloud_id: string, expected_version: number, actor_id: string): Promise<WordCloud> {
    const current = await this.store.getById(cloud_id);
    if (!current) throw notFoundError(cloud_id);
    if (current.status !== 'draft') throw closedError(cloud_id);
    const ts = this.now_ms();
    const next: WordCloud = {
      ...current,
      status: 'open',
      updated_at_ms: ts,
      version: current.version + 1,
    };
    const updated = await this.store.update({ cloud_id, expected_version, next });
    await this.emitAudit({
      actor_id,
      cloud_id,
      workspace_id: updated.workspace_id,
      session_id: updated.session_id,
      ts,
      action: 'word_cloud.open',
      before: cloudToJson(current),
      after: cloudToJson(updated),
    });
    this.metrics.open_clouds.inc(1, { workspace_id: updated.workspace_id });
    return updated;
  }

  async close(cloud_id: string, expected_version: number, actor_id: string): Promise<WordCloud> {
    const current = await this.store.getById(cloud_id);
    if (!current) throw notFoundError(cloud_id);
    if (current.status !== 'open') throw closedError(cloud_id);
    const ts = this.now_ms();
    const next: WordCloud = {
      ...current,
      status: 'closed',
      updated_at_ms: ts,
      version: current.version + 1,
    };
    const updated = await this.store.update({ cloud_id, expected_version, next });
    await this.emitAudit({
      actor_id,
      cloud_id,
      workspace_id: updated.workspace_id,
      session_id: updated.session_id,
      ts,
      action: 'word_cloud.close',
      before: cloudToJson(current),
      after: cloudToJson(updated),
    });
    this.metrics.open_clouds.dec(1, { workspace_id: updated.workspace_id });
    return updated;
  }

  async submit(input: SubmitInput): Promise<WordCloudSubmit> {
    const start = this.now_ms();
    const idem = await this.idem.reserve({
      key: input.idempotency_key,
      workspace_id: input.workspace_id,
      cloud_id: input.cloud_id,
      ttl_ms: 24 * 60 * 60 * 1000,
    });
    if (idem.exists && idem.prior) {
      return idem.prior.response as WordCloudSubmit;
    }
    const cloud = await this.store.getById(input.cloud_id);
    if (!cloud) throw notFoundError(input.cloud_id);
    if (input.raw_text.length > cloud.max_chars) {
      throw tooLongError(input.raw_text.length, cloud.max_chars);
    }
    let moderation: ModerationDecision | null = null;
    if (this.moderator) {
      moderation = await this.moderator({
        workspace_id: input.workspace_id,
        session_id: cloud.session_id,
        cloud_id: input.cloud_id,
        raw_text: input.raw_text,
        participant_id: input.participant_id,
      });
    }
    if (moderation === 'block') {
      this.metrics.blocked_submits.inc(1, { workspace_id: input.workspace_id });
      // Persist a blocked submit so the audit chain stays complete, but skip
      // tokenization since the content should not be exposed.
      const blockedSubmit: WordCloudSubmit = {
        id: this.id_factory(),
        workspace_id: input.workspace_id,
        session_id: cloud.session_id,
        cloud_id: input.cloud_id,
        participant_id: input.participant_id,
        raw_text: '',
        tokens: [],
        moderation: 'block',
        submitted_at_ms: this.now_ms(),
        idempotency_key: input.idempotency_key,
      };
      const stored = await this.store.submit({ submit: blockedSubmit, expected_existing: null });
      await this.idem.commit({
        key: input.idempotency_key,
        workspace_id: input.workspace_id,
        cloud_id: input.cloud_id,
        response: stored,
        recorded_at_ms: blockedSubmit.submitted_at_ms,
        ttl_ms: 24 * 60 * 60 * 1000,
      });
      this.metrics.submit_latency_ms.observe(this.now_ms() - start, {
        workspace_id: input.workspace_id,
      });
      return stored;
    }
    const tokens = tokenize(input.raw_text, {
      stopwords: cloud.stopwords,
      max_chars: cloud.max_chars,
    });
    const submit: WordCloudSubmit = {
      id: this.id_factory(),
      workspace_id: input.workspace_id,
      session_id: cloud.session_id,
      cloud_id: input.cloud_id,
      participant_id: input.participant_id,
      raw_text: input.raw_text,
      tokens,
      moderation,
      submitted_at_ms: this.now_ms(),
      idempotency_key: input.idempotency_key,
    };
    const stored = await this.store.submit({ submit, expected_existing: null });
    await this.idem.commit({
      key: input.idempotency_key,
      workspace_id: input.workspace_id,
      cloud_id: input.cloud_id,
      response: stored,
      recorded_at_ms: submit.submitted_at_ms,
      ttl_ms: 24 * 60 * 60 * 1000,
    });
    await this.emitAudit({
      actor_id: input.participant_id,
      cloud_id: input.cloud_id,
      workspace_id: cloud.workspace_id,
      session_id: cloud.session_id,
      ts: submit.submitted_at_ms,
      action: 'word_cloud.submit',
      after: { tokens, moderation: moderation ?? 'allow' },
    });
    this.metrics.submits.inc(1, { workspace_id: input.workspace_id });
    this.metrics.submit_latency_ms.observe(this.now_ms() - start, {
      workspace_id: input.workspace_id,
    });
    await this.bus.publish({
      session_id: cloud.session_id,
      topic: 'word_cloud',
      payload: encode({ kind: 'submit', cloud_id: input.cloud_id, tokens }),
    });
    return stored;
  }

  async aggregate(cloud_id: string): Promise<WordCloudAggregate> {
    return this.store.aggregate(cloud_id);
  }

  private async emitAudit(event: WordCloudAuditEvent): Promise<void> {
    await this.audit.emit(event);
  }
}

function cloudToJson(c: WordCloud): JsonObject {
  return {
    id: c.id,
    status: c.status,
    prompt: c.prompt,
    allow_repeat: c.allow_repeat,
    max_chars: c.max_chars,
    version: c.version,
    updated_at_ms: c.updated_at_ms,
  };
}

function cryptoRandomId(): string {
  const g: typeof globalThis & { crypto?: { randomUUID?: () => string } } = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

void WordCloudError;
