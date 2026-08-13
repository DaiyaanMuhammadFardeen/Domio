/**
 * @domio/deep-link — Shortener tests.
 *
 * Covers: shorten → resolve round-trip, single-use enforcement,
 * replay-attack rejection (a second resolve throws), per-tenant
 * listing, deletion, missing-record handling.
 */

import { describe, expect, it } from 'vitest';
import { Shortener, newShortId, type ShortLinkStore } from './server.js';
import { type DeepLink } from './index.js';
import { DEEP_LINK_VERSION, type DeepLinkPayload } from './types.js';
import { DeepLinkReplayError } from './errors.js';

/** In-memory store mirroring the production DAL shape. */
class InMemoryShortLinkStore implements ShortLinkStore {
  private rows = new Map<string, DeepLink>();
  async insert(record: DeepLink): Promise<void> {
    this.rows.set(record.id, record);
  }
  async findById(id: string): Promise<DeepLink | null> {
    return this.rows.get(id) ?? null;
  }
  async incrementClick(id: string): Promise<DeepLink | null> {
    const cur = this.rows.get(id);
    if (!cur) return null;
    const next: DeepLink = { ...cur, click_count: cur.click_count + 1 };
    this.rows.set(id, next);
    return next;
  }
  async deleteById(id: string, tenant_id: string): Promise<boolean> {
    const cur = this.rows.get(id);
    if (!cur || cur.tenant_id !== tenant_id) return false;
    return this.rows.delete(id);
  }
  async listByDeck(tenant_id: string, deck_id: string): Promise<readonly DeepLink[]> {
    return [...this.rows.values()].filter(
      (r) => r.tenant_id === tenant_id && r.deck_id === deck_id,
    );
  }
}

function payload(overrides: Partial<DeepLinkPayload> = {}): DeepLinkPayload {
  return {
    v: DEEP_LINK_VERSION,
    exp: Date.now() + 60_000,
    deck_id: 'deck-1',
    slide_id: 'slide-1',
    path_stack: [],
    overlay_stack: [],
    var_snapshot: [],
    device_frame_state: {},
    scenario: '',
    form_drafts: {},
    aud: 'viewer',
    sig: 'placeholder',
    ...overrides,
  };
}

describe('newShortId', () => {
  it('returns ids of the requested length', () => {
    expect(newShortId()).toHaveLength(9);
    expect(newShortId(12)).toHaveLength(12);
  });

  it('produces distinct ids across many calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(newShortId());
    expect(ids.size).toBe(1000);
  });
});

describe('Shortener', () => {
  it('shortens and resolves a payload', async () => {
    const store = new InMemoryShortLinkStore();
    const shortener = new Shortener(store);
    const record = await shortener.shorten(
      {
        tenant_id: 't1',
        deck_id: 'd1',
        kid: 'kid-1',
        audience: 'viewer',
        expires_at: Date.now() + 60_000,
        viewer_scope: 'public',
      },
      payload(),
    );
    expect(record.id).toHaveLength(9);
    expect(record.click_count).toBe(0);
    const resolved = await shortener.resolve(record.id);
    expect(resolved.id).toBe(record.id);
    expect(resolved.click_count).toBe(1);
  });

  it('enforces single-use: second resolve rejects', async () => {
    const store = new InMemoryShortLinkStore();
    const shortener = new Shortener(store);
    const record = await shortener.shorten(
      {
        tenant_id: 't1',
        deck_id: 'd1',
        kid: 'kid-1',
        audience: 'viewer',
        expires_at: Date.now() + 60_000,
        viewer_scope: 'public',
        single_use: true,
      },
      payload(),
    );
    await shortener.resolve(record.id);
    await expect(shortener.resolve(record.id)).rejects.toBeInstanceOf(DeepLinkReplayError);
  });

  it('rejects resolves on missing ids', async () => {
    const shortener = new Shortener(new InMemoryShortLinkStore());
    await expect(shortener.resolve('nope')).rejects.toBeInstanceOf(DeepLinkReplayError);
  });

  it('rejects resolves on expired links', async () => {
    const store = new InMemoryShortLinkStore();
    const shortener = new Shortener(store);
    const record = await shortener.shorten(
      {
        tenant_id: 't1',
        deck_id: 'd1',
        kid: 'kid-1',
        audience: 'viewer',
        expires_at: Date.now() - 1, // already expired
        viewer_scope: 'public',
      },
      payload(),
    );
    await expect(shortener.resolve(record.id)).rejects.toBeInstanceOf(DeepLinkReplayError);
  });

  it('lists by deck', async () => {
    const store = new InMemoryShortLinkStore();
    const shortener = new Shortener(store);
    await shortener.shorten(
      {
        tenant_id: 't1',
        deck_id: 'd1',
        kid: 'k',
        audience: 'viewer',
        expires_at: Date.now() + 1000,
        viewer_scope: 'public',
      },
      payload(),
    );
    await shortener.shorten(
      {
        tenant_id: 't1',
        deck_id: 'd2',
        kid: 'k',
        audience: 'viewer',
        expires_at: Date.now() + 1000,
        viewer_scope: 'public',
      },
      payload({ deck_id: 'd2' }),
    );
    const list = await shortener.listForDeck('t1', 'd1');
    expect(list).toHaveLength(1);
    expect(list[0]!.deck_id).toBe('d1');
  });

  it('refuses to delete cross-tenant', async () => {
    const store = new InMemoryShortLinkStore();
    const shortener = new Shortener(store);
    const record = await shortener.shorten(
      {
        tenant_id: 't1',
        deck_id: 'd1',
        kid: 'k',
        audience: 'viewer',
        expires_at: Date.now() + 1000,
        viewer_scope: 'public',
      },
      payload(),
    );
    expect(await shortener.delete(record.id, 't2')).toBe(false);
    expect(await shortener.delete(record.id, 't1')).toBe(true);
  });
});
