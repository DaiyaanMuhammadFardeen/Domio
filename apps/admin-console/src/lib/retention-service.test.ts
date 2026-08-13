/**
 * Retention Policy service tests — Wave 8 §S8.6.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  listRetentionPolicies,
  getRetentionPolicy,
  upsertRetentionPolicy,
  previewRetention,
} from './retention-service';
import type { RetentionContentType, RetentionPeriod } from './types';

describe('retention-service', () => {
  beforeEach(async () => {
    // Module-singleton store. Re-seed by upserting each content_type
    // back to its baseline period so test order doesn't matter.
    const baselines: ReadonlyArray<{
      content_type: RetentionContentType;
      period: RetentionPeriod;
    }> = [
      { content_type: 'deck', period: '3y' },
      { content_type: 'asset', period: '1y' },
      { content_type: 'comment', period: '90d' },
      { content_type: 'audit-log', period: '7y' },
      { content_type: 'export', period: '30d' },
    ];
    for (const b of baselines) {
      await upsertRetentionPolicy(b);
    }
  });

  it('lists 5 policies', async () => {
    const policies = await listRetentionPolicies();
    expect(policies.length).toBe(5);
  });

  it('covers every content_type', async () => {
    const policies = await listRetentionPolicies();
    const types = new Set(policies.map((p) => p.content_type));
    expect(types.size).toBe(5);
  });

  it('retrieves a policy by id', async () => {
    const p = await getRetentionPolicy('ret-deck');
    expect(p?.content_type).toBe('deck');
    expect(p?.period).toBe('3y');
  });

  it('preview returns 0-20 affected decks', async () => {
    const preview = await previewRetention('ret-deck');
    expect(preview.total_affected).toBeGreaterThanOrEqual(0);
    expect(preview.total_affected).toBeLessThanOrEqual(20);
    expect(preview.affected_decks.length).toBe(preview.total_affected);
  });

  it('preview each deck carries days_until_purge', async () => {
    const preview = await previewRetention('ret-deck');
    for (const d of preview.affected_decks) {
      expect(d.days_until_purge).toBeGreaterThan(0);
      expect(typeof d.id).toBe('string');
      expect(typeof d.title).toBe('string');
    }
  });

  it('preview for indefinite period returns zero affected', async () => {
    await upsertRetentionPolicy({ content_type: 'deck', period: 'indefinite' });
    const preview = await previewRetention('ret-deck');
    expect(preview.total_affected).toBe(0);
  });

  it('upsert updates policy in place (by content_type)', async () => {
    const before = await listRetentionPolicies();
    const countBefore = before.length;
    const updated = await upsertRetentionPolicy({
      content_type: 'deck',
      period: '1y',
    });
    expect(updated.period).toBe('1y');
    expect(updated.content_type).toBe('deck');
    const after = await listRetentionPolicies();
    expect(after.length).toBe(countBefore);
    const found = after.find((p) => p.content_type === 'deck');
    expect(found?.period).toBe('1y');
  });

  it('preview returns empty for unknown policy', async () => {
    const preview = await previewRetention('ret-nope');
    expect(preview.total_affected).toBe(0);
  });
});
