/**
 * Tests for brand-lock enforcement.
 */

import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import { enforceBrandLock } from './lock-enforcement.js';
import type { BrandLockRegion } from '../store/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLock(overrides: Partial<BrandLockRegion> & { id: string; deckId: string }): BrandLockRegion {
  return {
    scope: 'element',
    strictness: 'strict',
    allowedOverrides: [],
    ownerUserId: 'owner-1',
    sceneGraphSelector: 'slide[*].text[*]',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enforceBrandLock', () => {
  describe('strict mode', () => {
    it('allows operations in allowedOverrides', async () => {
      const store = new InMemoryStore();
      const deps: ServiceDeps = defaultDeps(store);

      await store.putBrandLock(makeLock({
        id: 'lock-1',
        deckId: 'deck-1',
        strictness: 'strict',
        allowedOverrides: ['text', 'color'],
        sceneGraphSelector: 'slide[*].text[*]',
      }));

      const result = await enforceBrandLock(deps, {
        deckId: 'deck-1',
        actorId: 'user-2',
        targets: ['slide[0].text[title]'],
        operation: 'text',
      });

      expect(result.allowed).toBe(true);
    });

    it('blocks operations not in allowedOverrides', async () => {
      const store = new InMemoryStore();
      const deps: ServiceDeps = defaultDeps(store);

      await store.putBrandLock(makeLock({
        id: 'lock-2',
        deckId: 'deck-1',
        strictness: 'strict',
        allowedOverrides: ['text'],
        sceneGraphSelector: 'slide[*].text[*]',
      }));

      const result = await enforceBrandLock(deps, {
        deckId: 'deck-1',
        actorId: 'user-2',
        targets: ['slide[0].text[title]'],
        operation: 'layout',
      });

      expect(result.allowed).toBe(false);
      expect(result.blockedBy!.id).toBe('lock-2');
      expect(result.reason).toContain('not in the allowed overrides');
    });

    it('allows the lock owner any operation', async () => {
      const store = new InMemoryStore();
      const deps: ServiceDeps = defaultDeps(store);

      await store.putBrandLock(makeLock({
        id: 'lock-3',
        deckId: 'deck-1',
        strictness: 'strict',
        allowedOverrides: [],
        ownerUserId: 'owner-1',
        sceneGraphSelector: 'slide[*].text[*]',
      }));

      const result = await enforceBrandLock(deps, {
        deckId: 'deck-1',
        actorId: 'owner-1',
        targets: ['slide[0].text[title]'],
        operation: 'delete',
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('color-only mode', () => {
    it('allows text changes for non-owner', async () => {
      const store = new InMemoryStore();
      const deps: ServiceDeps = defaultDeps(store);

      await store.putBrandLock(makeLock({
        id: 'lock-4',
        deckId: 'deck-1',
        strictness: 'color-only',
        sceneGraphSelector: 'slide[*].text[*]',
      }));

      const result = await enforceBrandLock(deps, {
        deckId: 'deck-1',
        actorId: 'user-2',
        targets: ['slide[0].text[title]'],
        operation: 'text',
      });

      expect(result.allowed).toBe(true);
    });

    it('blocks color changes for non-owner', async () => {
      const store = new InMemoryStore();
      const deps: ServiceDeps = defaultDeps(store);

      await store.putBrandLock(makeLock({
        id: 'lock-5',
        deckId: 'deck-1',
        strictness: 'color-only',
        sceneGraphSelector: 'slide[*].text[*]',
      }));

      const result = await enforceBrandLock(deps, {
        deckId: 'deck-1',
        actorId: 'user-2',
        targets: ['slide[0].text[title]'],
        operation: 'color',
      });

      expect(result.allowed).toBe(false);
      expect(result.blockedBy!.id).toBe('lock-5');
      expect(result.reason).toContain('Color changes are restricted');
    });

    it('allows color changes for owner', async () => {
      const store = new InMemoryStore();
      const deps: ServiceDeps = defaultDeps(store);

      await store.putBrandLock(makeLock({
        id: 'lock-6',
        deckId: 'deck-1',
        strictness: 'color-only',
        ownerUserId: 'owner-1',
        sceneGraphSelector: 'slide[*].text[*]',
      }));

      const result = await enforceBrandLock(deps, {
        deckId: 'deck-1',
        actorId: 'owner-1',
        targets: ['slide[0].text[title]'],
        operation: 'color',
      });

      expect(result.allowed).toBe(true);
    });

    it('blocks non-text, non-color ops for non-owner', async () => {
      const store = new InMemoryStore();
      const deps: ServiceDeps = defaultDeps(store);

      await store.putBrandLock(makeLock({
        id: 'lock-7',
        deckId: 'deck-1',
        strictness: 'color-only',
        sceneGraphSelector: 'slide[*].text[*]',
      }));

      const result = await enforceBrandLock(deps, {
        deckId: 'deck-1',
        actorId: 'user-2',
        targets: ['slide[0].text[title]'],
        operation: 'layout',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not permitted under color-only');
    });
  });

  describe('text-only mode', () => {
    it('allows text changes for non-owner', async () => {
      const store = new InMemoryStore();
      const deps: ServiceDeps = defaultDeps(store);

      await store.putBrandLock(makeLock({
        id: 'lock-8',
        deckId: 'deck-1',
        strictness: 'text-only',
        sceneGraphSelector: 'slide[*].text[*]',
      }));

      const result = await enforceBrandLock(deps, {
        deckId: 'deck-1',
        actorId: 'user-2',
        targets: ['slide[0].text[title]'],
        operation: 'text',
      });

      expect(result.allowed).toBe(true);
    });

    it('blocks color changes for non-owner', async () => {
      const store = new InMemoryStore();
      const deps: ServiceDeps = defaultDeps(store);

      await store.putBrandLock(makeLock({
        id: 'lock-9',
        deckId: 'deck-1',
        strictness: 'text-only',
        sceneGraphSelector: 'slide[*].text[*]',
      }));

      const result = await enforceBrandLock(deps, {
        deckId: 'deck-1',
        actorId: 'user-2',
        targets: ['slide[0].text[title]'],
        operation: 'color',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not permitted under text-only');
    });

    it('allows any operation for the owner', async () => {
      const store = new InMemoryStore();
      const deps: ServiceDeps = defaultDeps(store);

      await store.putBrandLock(makeLock({
        id: 'lock-10',
        deckId: 'deck-1',
        strictness: 'text-only',
        ownerUserId: 'owner-1',
        sceneGraphSelector: 'slide[*].text[*]',
      }));

      const result = await enforceBrandLock(deps, {
        deckId: 'deck-1',
        actorId: 'owner-1',
        targets: ['slide[0].text[title]'],
        operation: 'delete',
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('selector matching', () => {
    it('does not block targets that do not match any lock selector', async () => {
      const store = new InMemoryStore();
      const deps: ServiceDeps = defaultDeps(store);

      await store.putBrandLock(makeLock({
        id: 'lock-11',
        deckId: 'deck-1',
        strictness: 'strict',
        allowedOverrides: [],
        sceneGraphSelector: 'slide[0].text[title]',
      }));

      const result = await enforceBrandLock(deps, {
        deckId: 'deck-1',
        actorId: 'user-2',
        targets: ['slide[1].text[other]'],
        operation: 'delete',
      });

      expect(result.allowed).toBe(true);
    });

    it('wildcard * matches any segment', async () => {
      const store = new InMemoryStore();
      const deps: ServiceDeps = defaultDeps(store);

      await store.putBrandLock(makeLock({
        id: 'lock-12',
        deckId: 'deck-1',
        strictness: 'strict',
        allowedOverrides: [],
        sceneGraphSelector: 'slide[*].text[*]',
      }));

      const result = await enforceBrandLock(deps, {
        deckId: 'deck-1',
        actorId: 'user-2',
        targets: ['slide[3].text[anyName]'],
        operation: 'delete',
      });

      expect(result.allowed).toBe(false);
      expect(result.blockedBy!.id).toBe('lock-12');
    });
  });

  describe('no locks', () => {
    it('allows all operations when no locks exist', async () => {
      const store = new InMemoryStore();
      const deps: ServiceDeps = defaultDeps(store);

      const result = await enforceBrandLock(deps, {
        deckId: 'deck-empty',
        actorId: 'user-2',
        targets: ['slide[0].text[title]'],
        operation: 'delete',
      });

      expect(result.allowed).toBe(true);
    });
  });
});
