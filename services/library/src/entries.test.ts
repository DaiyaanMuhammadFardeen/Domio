/**
 * Library entries — pure logic tests (Phase 18 Wave 3).
 */

import { describe, it, expect } from 'vitest';
import {
  createEntryBody,
  addVersionBody,
  publishEntryBody,
  retireEntryBody,
  insertFromLibraryBody,
  computeLatestVersionNum,
} from './entries.js';
import type { SlideLibraryEntry, LibraryVersion } from './types.js';
import { LibraryValidationError, RetiredEntryError, SupersedeChainError } from './types.js';

const fixedDate = new Date('2026-01-15T10:00:00Z');
let idCounter = 0;
const opts = {
  now: () => fixedDate,
  idGen: () => `id-${String(++idCounter).padStart(3, '0')}`,
};

function makeEntry(overrides: Partial<SlideLibraryEntry> = {}): SlideLibraryEntry {
  return {
    id: 'entry-1',
    workspace_id: 'ws-1',
    scope: 'workspace',
    title: 'Test Entry',
    tags: [],
    owner_id: 'user-1',
    approval_chain: {},
    status: 'draft',
    version_id: 'ver-1',
    created_at: fixedDate,
    updated_at: fixedDate,
    created_by: 'user-1',
    updated_by: 'user-1',
    ...overrides,
  };
}

function makeVersion(overrides: Partial<LibraryVersion> = {}): LibraryVersion {
  return {
    id: 'ver-1',
    entry_id: 'entry-1',
    version_num: 1,
    slide_snapshot: { type: 'slide', elements: [] },
    data_bindings: [],
    brand_locked: false,
    created_by: 'user-1',
    created_at: fixedDate,
    ...overrides,
  };
}

describe('createEntryBody', () => {
  it('creates an entry with draft status and version 1', () => {
    const result = createEntryBody(
      {
        workspace_id: 'ws-1',
        scope: 'workspace',
        title: 'My Template',
        owner_id: 'user-1',
        snapshot: { slide_snapshot: { type: 'slide' } },
      },
      'user-1',
      opts,
    );

    expect(result.entry.status).toBe('draft');
    expect(result.entry.title).toBe('My Template');
    expect(result.entry.workspace_id).toBe('ws-1');
    expect(result.entry.version_id).toBe(result.version.id);
    expect(result.version.version_num).toBe(1);
    expect(result.version.slide_snapshot).toEqual({ type: 'slide' });
  });

  it('throws on empty title', () => {
    expect(() =>
      createEntryBody(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: '   ',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
        opts,
      ),
    ).toThrow(LibraryValidationError);
  });

  it('throws on invalid scope', () => {
    expect(() =>
      createEntryBody(
        {
          workspace_id: 'ws-1',
          scope: 'invalid',
          title: 'Test',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
        opts,
      ),
    ).toThrow(LibraryValidationError);
  });

  it('throws when slide_snapshot is missing', () => {
    expect(() =>
      createEntryBody(
        {
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Test',
          owner_id: 'user-1',
          snapshot: { slide_snapshot: undefined as unknown as Record<string, unknown> },
        },
        'user-1',
        opts,
      ),
    ).toThrow(LibraryValidationError);
  });

  it('accepts all scopes', () => {
    for (const scope of ['workspace', 'org', 'team'] as const) {
      const result = createEntryBody(
        {
          workspace_id: 'ws-1',
          scope,
          title: `Test ${scope}`,
          owner_id: 'user-1',
          snapshot: { slide_snapshot: {} },
        },
        'user-1',
        opts,
      );
      expect(result.entry.scope).toBe(scope);
    }
  });

  it('uses provided tags and approval_chain', () => {
    const result = createEntryBody(
      {
        workspace_id: 'ws-1',
        scope: 'workspace',
        title: 'Test',
        owner_id: 'user-1',
        tags: ['brand', 'hero'],
        approval_chain: { requireApproval: true },
        snapshot: { slide_snapshot: {} },
      },
      'user-1',
      opts,
    );
    expect(result.entry.tags).toEqual(['brand', 'hero']);
    expect(result.entry.approval_chain).toEqual({ requireApproval: true });
  });
});

describe('addVersionBody', () => {
  it('increments version_num', () => {
    const entry = makeEntry();
    const version = addVersionBody(entry, { slide_snapshot: { v: 2 } }, 3, 'user-1', opts);
    expect(version.version_num).toBe(4);
    expect(version.slide_snapshot).toEqual({ v: 2 });
  });

  it('rejects retired entries', () => {
    const entry = makeEntry({ status: 'retired' });
    expect(() => addVersionBody(entry, { slide_snapshot: {} }, 1, 'user-1', opts)).toThrow(
      RetiredEntryError,
    );
  });

  it('throws when slide_snapshot is missing', () => {
    const entry = makeEntry();
    expect(() =>
      addVersionBody(
        entry,
        { slide_snapshot: undefined as unknown as Record<string, unknown> },
        1,
        'user-1',
        opts,
      ),
    ).toThrow(LibraryValidationError);
  });
});

describe('publishEntryBody', () => {
  it('publishes a draft entry', () => {
    const entry = makeEntry({ status: 'draft' });
    const result = publishEntryBody(entry, 'ver-2', opts);
    expect(result.status).toBe('approved');
    expect(result.version_id).toBe('ver-2');
  });

  it('publishes a pending entry', () => {
    const entry = makeEntry({ status: 'pending' });
    const result = publishEntryBody(entry, 'ver-2', opts);
    expect(result.status).toBe('approved');
  });

  it('rejects an approved entry', () => {
    const entry = makeEntry({ status: 'approved' });
    expect(() => publishEntryBody(entry, 'ver-2', opts)).toThrow(LibraryValidationError);
  });

  it('rejects a retired entry', () => {
    const entry = makeEntry({ status: 'retired' });
    expect(() => publishEntryBody(entry, 'ver-2', opts)).toThrow(LibraryValidationError);
  });
});

describe('retireEntryBody', () => {
  it('retires an approved entry', () => {
    const entry = makeEntry({ status: 'approved' });
    const allEntries = [entry, makeEntry({ id: 'entry-2', status: 'approved' })];
    const result = retireEntryBody(entry, undefined, allEntries, opts);
    expect(result.status).toBe('retired');
    expect(result.superseded_by).toBeUndefined();
  });

  it('retires with superseded_by', () => {
    const entry = makeEntry({ status: 'approved' });
    const replacement = makeEntry({ id: 'entry-2', status: 'draft' });
    const allEntries = [entry, replacement];
    const result = retireEntryBody(entry, 'entry-2', allEntries, opts);
    expect(result.superseded_by).toBe('entry-2');
  });

  it('rejects superseded_by targeting a retired entry', () => {
    const entry = makeEntry({ status: 'approved' });
    const retired = makeEntry({ id: 'entry-2', status: 'retired' });
    const allEntries = [entry, retired];
    expect(() => retireEntryBody(entry, 'entry-2', allEntries, opts)).toThrow(SupersedeChainError);
  });

  it('rejects superseded_by with non-existent id', () => {
    const entry = makeEntry({ status: 'approved' });
    const allEntries = [entry];
    expect(() => retireEntryBody(entry, 'nonexistent', allEntries, opts)).toThrow(
      SupersedeChainError,
    );
  });

  it('rejects retiring the only active entry', () => {
    const entry = makeEntry({ status: 'draft' });
    const allEntries = [entry];
    expect(() => retireEntryBody(entry, undefined, allEntries, opts)).toThrow(
      LibraryValidationError,
    );
  });

  it('rejects retiring an already-retired entry', () => {
    const entry = makeEntry({ status: 'retired' });
    const allEntries = [entry];
    expect(() => retireEntryBody(entry, undefined, allEntries, opts)).toThrow(
      LibraryValidationError,
    );
  });
});

describe('insertFromLibraryBody', () => {
  it('returns version_id for reference mode', () => {
    const entry = makeEntry({ status: 'approved' });
    const version = makeVersion();
    const result = insertFromLibraryBody(entry, version, 'reference');
    expect(result.version_id).toBe(version.id);
  });

  it('returns version_id for copy mode', () => {
    const entry = makeEntry({ status: 'approved' });
    const version = makeVersion();
    const result = insertFromLibraryBody(entry, version, 'copy');
    expect(result.version_id).toBe(version.id);
  });

  it('rejects retired entries', () => {
    const entry = makeEntry({ status: 'retired' });
    const version = makeVersion();
    expect(() => insertFromLibraryBody(entry, version, 'reference')).toThrow(
      LibraryValidationError,
    );
  });
});

describe('computeLatestVersionNum', () => {
  it('returns 0 for empty array', () => {
    expect(computeLatestVersionNum([])).toBe(0);
  });

  it('returns max version number', () => {
    const versions = [
      makeVersion({ version_num: 1 }),
      makeVersion({ version_num: 5 }),
      makeVersion({ version_num: 3 }),
    ];
    expect(computeLatestVersionNum(versions)).toBe(5);
  });
});
