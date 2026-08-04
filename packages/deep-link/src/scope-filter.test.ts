/**
 * @domio/deep-link — scope-filter tests.
 *
 * Covers: server_only always stripped, private stripped unless
 * authoring viewer matches requesting viewer, session/viewer
 * scoped vars stripped from public links, deck_public preserved.
 */

import { describe, expect, it } from 'vitest';
import { scopeFilter } from './index.js';
import type { DeepLinkVarEntry } from './index.js';

const PUBLIC_DECK: DeepLinkVarEntry = { name: 'TIER', value: 'annual', visibility: 'deck_public', scope: 'deck' };
const PRIVATE_SESSION: DeepLinkVarEntry = { name: 'NAME', value: 'Bear', visibility: 'private', scope: 'session' };
const SERVER_ONLY: DeepLinkVarEntry = { name: 'SECRET', value: 'shh', visibility: 'server_only', scope: 'deck' };
const VIEWER_SCOPED: DeepLinkVarEntry = { name: 'PIN', value: '1234', visibility: 'deck_public', scope: 'viewer' };

describe('scopeFilter', () => {
  it('strips server_only entries', () => {
    const out = scopeFilter([SERVER_ONLY], { viewer_scope: 'public' });
    expect(out).toHaveLength(0);
  });

  it('preserves deck_public entries under every scope', () => {
    for (const scope of ['public', 'tenant', 'private'] as const) {
      const out = scopeFilter([PUBLIC_DECK], { viewer_scope: scope });
      expect(out).toHaveLength(1);
    }
  });

  it('strips private entries unless authoring viewer matches', () => {
    const out1 = scopeFilter([PRIVATE_SESSION], { viewer_scope: 'public', requesting_viewer_id: 'u1' });
    expect(out1).toHaveLength(0);
    // On a tenant-scoped link, private session vars round-trip
    // when authoring === requesting.
    const out2 = scopeFilter(
      [PRIVATE_SESSION],
      { viewer_scope: 'tenant', authoring_viewer_id: 'u1', requesting_viewer_id: 'u1' },
    );
    expect(out2).toHaveLength(1);
  });

  it('private entries are dropped on public links even with matching authoring viewer', () => {
    // Public links leak per-viewer state by definition. The
    // `public` viewer_scope always strips session/viewer vars.
    const out = scopeFilter(
      [PRIVATE_SESSION],
      { viewer_scope: 'public', authoring_viewer_id: 'u1', requesting_viewer_id: 'u1' },
    );
    expect(out).toHaveLength(0);
  });

  it('strips session/viewer-scoped entries from public links', () => {
    const out = scopeFilter([VIEWER_SCOPED], { viewer_scope: 'public' });
    expect(out).toHaveLength(0);
  });

  it('keeps session/viewer entries for tenant-scoped links when authoring === requesting', () => {
    const out = scopeFilter(
      [VIEWER_SCOPED],
      { viewer_scope: 'tenant', authoring_viewer_id: 'u1', requesting_viewer_id: 'u1' },
    );
    expect(out).toHaveLength(1);
  });

  it('strips session/viewer entries for tenant-scoped links when authoring !== requesting', () => {
    const out = scopeFilter(
      [VIEWER_SCOPED],
      { viewer_scope: 'tenant', authoring_viewer_id: 'u1', requesting_viewer_id: 'u2' },
    );
    expect(out).toHaveLength(0);
  });

  it('returns an empty list when no entries pass', () => {
    const out = scopeFilter(
      [SERVER_ONLY, PRIVATE_SESSION, VIEWER_SCOPED],
      { viewer_scope: 'public', requesting_viewer_id: 'u2' },
    );
    expect(out).toHaveLength(0);
  });
});