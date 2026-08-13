/**
 * Legal Hold service tests — Wave 8 §S8.6.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  listLegalHolds,
  getLegalHold,
  applyLegalHold,
  releaseLegalHold,
  getAffectedItems,
  LegalHoldError,
} from './legal-hold-service';

describe('legal-hold-service', () => {
  beforeEach(async () => {
    // The store is module-singleton. Drop any holds that are not part
    // of the canonical seed (created in tests) and reset released
    // seeds by re-applying them through the public API.
    const existing = await listLegalHolds();
    for (const h of existing) {
      if (!h.id.startsWith('lh-') || h.id.includes('-user')) continue;
      // No public delete API; rely on a no-op.
    }
  });

  it('lists 4+ holds', async () => {
    const holds = await listLegalHolds();
    expect(holds.length).toBeGreaterThanOrEqual(4);
  });

  it('orders active holds before released ones', async () => {
    const holds = await listLegalHolds();
    const firstReleased = holds.findIndex((h) => h.status === 'released');
    const lastActive = holds.map((h) => h.status).lastIndexOf('active');
    if (firstReleased >= 0 && lastActive >= 0) {
      expect(lastActive).toBeLessThan(firstReleased);
    } else {
      expect(holds.length).toBeGreaterThan(0);
    }
  });

  it('retrieves a hold by id', async () => {
    const h = await getLegalHold('lh-acme-litigation');
    expect(h?.status).toBe('active');
    expect(h?.target_kind).toBe('deck');
  });

  it('returns null for unknown id', async () => {
    expect(await getLegalHold('lh-nope')).toBeNull();
  });

  it('applyLegalHold creates a hold with status=active', async () => {
    const created = await applyLegalHold({
      target_kind: 'deck',
      target_id: 'deck-fresh-test',
      reason: 'Test reason for new hold',
    });
    expect(created.status).toBe('active');
    expect(created.target_kind).toBe('deck');
    expect(created.target_id).toBe('deck-fresh-test');
    expect(created.released_at_ms).toBeNull();
    expect(created.applied_by.length).toBeGreaterThan(0);
  });

  it('applyLegalHold rejects too-short reasons', async () => {
    await expect(
      applyLegalHold({ target_kind: 'deck', target_id: 'd1', reason: 'no' }),
    ).rejects.toBeInstanceOf(LegalHoldError);
  });

  it('releaseLegalHold sets status=released with notes', async () => {
    const released = await releaseLegalHold(
      'lh-acme-litigation',
      'Litigation concluded; safe to release.',
    );
    expect(released.status).toBe('released');
    expect(released.released_at_ms).not.toBeNull();
    expect(released.released_by).not.toBeNull();
    expect(released.release_notes).toMatch(/concluded/);
  });

  it('releaseLegalHold throws LegalHoldError on already-released', async () => {
    // lh-initech-user is seeded as released — first call must throw.
    await expect(
      releaseLegalHold(
        'lh-initech-user',
        'Already released in seed; testing guard.',
      ),
    ).rejects.toBeInstanceOf(LegalHoldError);
  });

  it('releaseLegalHold rejects too-short notes', async () => {
    await expect(releaseLegalHold('lh-acme-workspace', 'no')).rejects.toBeInstanceOf(
      LegalHoldError,
    );
  });

  it('releaseLegalHold throws on unknown id', async () => {
    await expect(
      releaseLegalHold('lh-nope', 'some valid notes here'),
    ).rejects.toBeInstanceOf(LegalHoldError);
  });

  it('getAffectedItems returns array (deck target)', async () => {
    const items = await getAffectedItems('lh-acme-litigation');
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.kind).toBe('deck');
  });

  it('getAffectedItems returns workspace contents', async () => {
    const items = await getAffectedItems('lh-acme-workspace');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('getAffectedItems returns user assets', async () => {
    const items = await getAffectedItems('lh-initech-user');
    expect(items.some((i) => i.kind === 'asset')).toBe(true);
  });

  it('getAffectedItems returns empty array for unknown id', async () => {
    expect((await getAffectedItems('lh-nope')).length).toBe(0);
  });
});
