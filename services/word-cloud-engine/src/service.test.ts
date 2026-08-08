import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEdgeBus } from '@domio/edge-pubsub';
import { InMemoryWordCloudStore } from './store/mem_store.js';
import { WordCloudEngine, type Moderator } from './service.js';
import { HashChainedWordCloudAuditEmitter } from './audit/emit.js';
import { tokenize } from './tokenize.js';

describe('word-cloud-engine', () => {
  let bus: InMemoryEdgeBus;
  let store: InMemoryWordCloudStore;
  let audit: HashChainedWordCloudAuditEmitter;
  let engine: WordCloudEngine;

  beforeEach(() => {
    bus = new InMemoryEdgeBus();
    store = new InMemoryWordCloudStore();
    audit = new HashChainedWordCloudAuditEmitter({ workspaceId: 'w1', key: new Uint8Array(32) });
    engine = new WordCloudEngine({ store, bus, audit });
  });

  it('creates a word cloud in draft state', async () => {
    const c = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      prompt: 'One word for the keynote', created_by: 'p1',
    });
    expect(c.status).toBe('draft');
    expect(c.max_chars).toBe(32);
  });

  it('opens, takes submits, computes aggregate', async () => {
    const c = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      prompt: 'One word', created_by: 'p1',
    });
    const opened = await engine.open(c.id, 1, 'p1');
    expect(opened.status).toBe('open');
    await engine.submit({
      workspace_id: 'w1', cloud_id: c.id, participant_id: 'u-1',
      raw_text: 'amazing incredible', idempotency_key: 'k1',
    });
    await engine.submit({
      workspace_id: 'w1', cloud_id: c.id, participant_id: 'u-2',
      raw_text: 'amazing wonderful', idempotency_key: 'k2',
    });
    const agg = await engine.aggregate(c.id);
    expect(agg.total).toBe(4);
    expect(agg.counts['amazing']).toBe(2);
    expect(agg.counts['incredible']).toBe(1);
    expect(agg.counts['wonderful']).toBe(1);
  });

  it('rejects repeat submits when allow_repeat is false', async () => {
    const c = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      prompt: 'One word', created_by: 'p1', allow_repeat: false,
    });
    await engine.open(c.id, 1, 'p1');
    await engine.submit({
      workspace_id: 'w1', cloud_id: c.id, participant_id: 'u-1',
      raw_text: 'amazing', idempotency_key: 'k1',
    });
    await expect(
      engine.submit({
        workspace_id: 'w1', cloud_id: c.id, participant_id: 'u-1',
        raw_text: 'wonderful', idempotency_key: 'k2',
      }),
    ).rejects.toThrow(/repeats forbidden/);
  });

  it('moderator blocks terms', async () => {
    const moderator: Moderator = async ({ raw_text }) => {
      return /badword/i.test(raw_text) ? 'block' : 'allow';
    };
    const moderated = new WordCloudEngine({ store, bus, audit, moderator });
    const c = await moderated.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      prompt: 'One word', created_by: 'p1',
    });
    await moderated.open(c.id, 1, 'p1');
    const r = await moderated.submit({
      workspace_id: 'w1', cloud_id: c.id, participant_id: 'u-1',
      raw_text: 'badword', idempotency_key: 'k1',
    });
    expect(r.moderation).toBe('block');
    expect(r.tokens).toHaveLength(0);
    const agg = await moderated.aggregate(c.id);
    expect(agg.total).toBe(0);
  });

  it('tokenize strips stopwords + lowercases', () => {
    const tokens = tokenize('The Amazing and Wonderful show', { stopwords: ['the', 'and'], max_chars: 64 });
    expect(tokens).toEqual(['amazing', 'wonderful', 'show']);
  });

  it('emits a verifiable audit chain', async () => {
    const c = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      prompt: 'One word', created_by: 'p1',
    });
    await engine.open(c.id, 1, 'p1');
    await engine.submit({
      workspace_id: 'w1', cloud_id: c.id, participant_id: 'u-1',
      raw_text: 'amazing', idempotency_key: 'k1',
    });
    const v = await audit.verify();
    expect(v.ok).toBe(true);
    const { events } = await audit.load();
    expect(events.map((e) => e.action)).toEqual(['word_cloud.create', 'word_cloud.open', 'word_cloud.submit']);
  });
});
