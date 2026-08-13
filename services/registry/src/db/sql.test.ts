import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  rowToPackage,
  pkgToRow,
  rowToSmartProp,
  rowToLibraryItem,
  rowToTeamLibrary,
  rowToLibraryEvent,
  rowToListing,
  rowToReview,
  rowToLicenseGrant,
  rowToRevenueEvent,
  rowToTemplate,
  rowToSectionTemplate,
  rowToStickerPack,
  rowToBrandLock,
  rowToIcon,
  rowToAuditRow,
  tsToMs,
  bigintToNum,
} from './sql.js';
import type { SqlStore } from './sql.js';
import type {
  ComponentPackage,
  SmartProp,
  UserLibraryItem,
  TeamLibrary,
  TeamLibraryEvent,
  MarketplaceListing,
  Review,
  LicenseGrant,
  Template,
  SectionTemplate,
  StickerPack,
  BrandLockRegion,
  IconRecord,
} from '../store/types.js';
import type { AuditRow } from '../store/interface.js';

// ---------------------------------------------------------------------------
// Pure-logic tests — always run, no Docker required.
// ---------------------------------------------------------------------------

describe('helpers', () => {
  it('tsToMs converts Date to epoch ms', () => {
    const d = new Date(1700000000000);
    expect(tsToMs(d)).toBe(1700000000000);
  });

  it('tsToMs converts ISO string to epoch ms', () => {
    expect(tsToMs('2023-11-14T22:13:20.000Z')).toBe(1700000000000);
  });

  it('tsToMs converts number to itself', () => {
    expect(tsToMs(1700000000000)).toBe(1700000000000);
  });

  it('tsToMs returns 0 for nullish', () => {
    expect(tsToMs(null)).toBe(0);
    expect(tsToMs(undefined)).toBe(0);
  });

  it('bigintToNum converts string to number', () => {
    expect(bigintToNum('12345')).toBe(12345);
  });

  it('bigintToNum converts number to itself', () => {
    expect(bigintToNum(12345)).toBe(12345);
  });

  it('bigintToNum returns 0 for nullish', () => {
    expect(bigintToNum(null)).toBe(0);
    expect(bigintToNum(undefined)).toBe(0);
  });
});

describe('rowToPackage / pkgToRow round-trip', () => {
  const fullPkg: ComponentPackage = {
    id: 'pkg-001',
    catalogId: 'ui-button',
    version: '2.1.0',
    kind: 'component',
    name: 'Button',
    description: 'A clickable button',
    category: 'ui',
    author: 'design-team',
    licenseId: 'MIT',
    propsSchema: { type: 'object', properties: { label: { type: 'string' } } },
    variants: [{ id: 'v1', label: 'Primary', tokens: { bg: '#0066ff', fg: '#fff' } }],
    files: { 'main.js': 'abc123hash', 'style.css': 'def456hash' },
    packageHash: 'sha256-aaa',
    signingKeyId: 'key-1',
    signature: 'sig-abc',
    deprecation: { reason: 'old', deprecatedAt: 1700000000000 },
    sizeBudgetBytes: 65536,
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
  };

  it('round-trips a full package', () => {
    const row = pkgToRow(fullPkg);
    const roundTripped = rowToPackage(row);
    expect(roundTripped).toEqual(fullPkg);
  });

  it('round-trips a minimal package (no optional fields)', () => {
    const minimal: ComponentPackage = {
      id: 'pkg-002',
      catalogId: 'icon-star',
      version: '1.0.0',
      kind: 'icon',
      name: 'Star',
      description: '',
      propsSchema: {},
      variants: [],
      files: {},
      packageHash: 'sha256-bbb',
      sizeBudgetBytes: 0,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };
    const row = pkgToRow(minimal);
    const roundTripped = rowToPackage(row);
    expect(roundTripped).toEqual(minimal);
  });

  it('handles deprecation: null explicitly (normalised to omitted via SQL)', () => {
    const pkg: ComponentPackage = { ...fullPkg, deprecation: null };
    const row = pkgToRow(pkg);
    const roundTripped = rowToPackage(row);
    // SQL null deprecation is normalised to omitted — cannot distinguish
    // "never set" from "set to null" through a nullable jsonb column.
    expect(roundTripped.deprecation).toBeUndefined();
  });

  it('handles null category/author/licenseId in DB as absent', () => {
    const row = pkgToRow(fullPkg);
    row.category = null;
    row.author = null;
    row.license_id = null;
    const result = rowToPackage(row);
    expect(result.category).toBeUndefined();
    expect(result.author).toBeUndefined();
    expect(result.licenseId).toBeUndefined();
  });
});

describe('rowToSmartProp', () => {
  it('maps a full smart prop', () => {
    const row = {
      prop_key: 'label',
      prop_schema: { type: 'string' },
      control_hint: 'text-input',
      required: true,
      default_value: 'Click me',
    };
    const result = rowToSmartProp(row);
    expect(result).toEqual({
      propKey: 'label',
      propSchema: { type: 'string' },
      controlHint: 'text-input',
      required: true,
      default: 'Click me',
    });
  });

  it('maps a minimal smart prop (no optional fields)', () => {
    const row = {
      prop_key: 'count',
      prop_schema: { type: 'number' },
      required: false,
      control_hint: null,
      default_value: null,
    };
    const result = rowToSmartProp(row);
    expect(result).toEqual({
      propKey: 'count',
      propSchema: { type: 'number' },
      required: false,
    });
  });
});

describe('rowToLibraryItem', () => {
  it('maps with all fields', () => {
    const row = {
      id: 'li-001',
      user_id: 'user-1',
      workspace_id: 'ws-1',
      catalog_id: 'ui-button',
      installed_version: '2.1.0',
      pin_mode: 'pin-version',
      pin_value: '2.1.0',
      license_grant_id: 'lg-001',
      created_at: new Date(1700000000000),
      updated_at: new Date(1700000001000),
    };
    const result = rowToLibraryItem(row);
    expect(result.id).toBe('li-001');
    expect(result.pinValue).toBe('2.1.0');
    expect(result.licenseGrantId).toBe('lg-001');
  });

  it('maps without optional fields', () => {
    const row = {
      id: 'li-002',
      user_id: 'user-1',
      workspace_id: 'ws-1',
      catalog_id: 'ui-button',
      installed_version: '2.1.0',
      pin_mode: 'track-latest',
      pin_value: null,
      license_grant_id: null,
      created_at: new Date(1700000000000),
      updated_at: new Date(1700000000000),
    };
    const result = rowToLibraryItem(row);
    expect(result.pinValue).toBeUndefined();
    expect(result.licenseGrantId).toBeUndefined();
  });
});

describe('rowToTeamLibrary', () => {
  it('maps all fields', () => {
    const row = {
      id: 'tl-001',
      workspace_id: 'ws-1',
      name: 'Design System',
      policy_mode: 'minor',
      owner_id: 'user-1',
      created_at: new Date(1700000000000),
      updated_at: new Date(1700000001000),
    };
    const result = rowToTeamLibrary(row);
    expect(result.id).toBe('tl-001');
    expect(result.policyMode).toBe('minor');
  });
});

describe('rowToLibraryEvent', () => {
  it('maps with optional version/payloadRef', () => {
    const row = {
      id: 'evt-001',
      library_id: 'tl-001',
      seq: '1',
      kind: 'component_updated',
      component_id: 'ui-button',
      version: '2.2.0',
      payload_ref: 'ref-abc',
      actor_id: 'user-1',
      actor_kind: 'human',
      created_at: new Date(1700000000000),
    };
    const result = rowToLibraryEvent(row);
    expect(result.seq).toBe(1);
    expect(result.version).toBe('2.2.0');
    expect(result.payloadRef).toBe('ref-abc');
  });

  it('maps without optional fields', () => {
    const row = {
      id: 'evt-002',
      library_id: 'tl-001',
      seq: '2',
      kind: 'component_removed',
      component_id: 'ui-button',
      version: null,
      payload_ref: null,
      actor_id: 'agent-1',
      actor_kind: 'agent',
      created_at: new Date(1700000001000),
    };
    const result = rowToLibraryEvent(row);
    expect(result.version).toBeUndefined();
    expect(result.payloadRef).toBeUndefined();
    expect(result.actorKind).toBe('agent');
  });
});

describe('rowToListing', () => {
  it('maps full listing', () => {
    const row = {
      id: 'ls-001',
      catalog_id: 'ui-button',
      seller_id: 'seller-1',
      title: 'Button Pro',
      description: 'A premium button',
      status: 'published',
      is_free: false,
      price_cents: 499,
      currency: 'usd',
      tags: '["ui","button"]',
      preview: '{"thumb":"url"}',
      published_at_ms: '1700000000000',
      deprecated_at_ms: null,
      created_at: new Date(1700000000000),
      updated_at: new Date(1700000001000),
    };
    const result = rowToListing(row);
    expect(result.isFree).toBe(false);
    expect(result.priceCents).toBe(499);
    expect(result.currency).toBe('usd');
    expect(result.tags).toEqual(['ui', 'button']);
    expect(result.publishedAt).toBe(1700000000000);
    expect(result.deprecatedAt).toBeUndefined();
  });
});

describe('rowToReview', () => {
  it('maps all fields', () => {
    const row = {
      id: 'rv-001',
      listing_id: 'ls-001',
      reviewer_id: 'user-1',
      rating: 5,
      body: 'Great!',
      status: 'accepted',
      verified_buyer: true,
      created_at: new Date(1700000000000),
    };
    const result = rowToReview(row);
    expect(result.rating).toBe(5);
    expect(result.verifiedBuyer).toBe(true);
  });
});

describe('rowToLicenseGrant', () => {
  it('maps full grant', () => {
    const row = {
      id: 'lg-001',
      workspace_id: 'ws-1',
      user_id: 'user-1',
      catalog_id: 'ui-button',
      version: '2.1.0',
      listing_id: 'ls-001',
      license_id: 'lic-001',
      seats: 5,
      signed_token: 'tok-abc',
      issued_at_ms: '1700000000000',
      expires_at_ms: '1731536000000',
      revoked_at_ms: null,
      offline_grace_until_ms: '1731536001000',
      created_at: new Date(1700000000000),
    };
    const result = rowToLicenseGrant(row);
    expect(result.userId).toBe('user-1');
    expect(result.listingId).toBe('ls-001');
    expect(result.revokedAt).toBeUndefined();
    expect(result.offlineGraceUntil).toBe(1731536001000);
  });
});

describe('rowToRevenueEvent', () => {
  it('maps all fields', () => {
    const row = {
      id: 're-001',
      listing_id: 'ls-001',
      seller_id: 'seller-1',
      workspace_id: 'ws-1',
      currency: 'usd',
      gross_cents: 499,
      fee_cents: 50,
      net_cents: 449,
      payout_status: 'pending',
      period_month: '2024-01',
      event_type: 'install',
      created_at: new Date(1700000000000),
    };
    const result = rowToRevenueEvent(row);
    expect(result.grossCents).toBe(499);
    expect(result.netCents).toBe(449);
    expect(result.payoutStatus).toBe('pending');
  });
});

describe('rowToTemplate', () => {
  it('maps with optional deckJson and preview', () => {
    const row = {
      id: 't-001',
      kind: 'full_deck',
      name: 'Pitch Deck',
      description: 'A pitch template',
      deck_json: '{"slides":[]}',
      placeholders: '[{"id":"p1","key":"title","label":"Title","kind":"text","required":true}]',
      author_id: 'user-1',
      preview: '{"thumb":"url"}',
      created_at: new Date(1700000000000),
      updated_at: new Date(1700000001000),
    };
    const result = rowToTemplate(row);
    expect(result.deckJson).toEqual({ slides: [] });
    expect(result.placeholders).toHaveLength(1);
    expect(result.preview).toEqual({ thumb: 'url' });
  });

  it('maps without optional deckJson/preview', () => {
    const row = {
      id: 't-002',
      kind: 'section',
      name: 'Section',
      description: '',
      deck_json: null,
      placeholders: '[]',
      author_id: 'user-1',
      preview: null,
      created_at: new Date(1700000000000),
      updated_at: new Date(1700000000000),
    };
    const result = rowToTemplate(row);
    expect(result.deckJson).toBeUndefined();
    expect(result.preview).toBeUndefined();
  });
});

describe('rowToSectionTemplate', () => {
  it('maps all fields', () => {
    const row = {
      id: 'st-001',
      template_id: 't-001',
      name: 'Hero Section',
      slides: '[{"title":"Hero"}]',
      spreadable: true,
      created_at: new Date(1700000000000),
    };
    const result = rowToSectionTemplate(row);
    expect(result.spreadable).toBe(true);
    expect(result.slides).toEqual([{ title: 'Hero' }]);
  });
});

describe('rowToStickerPack', () => {
  it('maps all fields', () => {
    const row = {
      id: 'sp-001',
      name: 'Emoji Pack',
      theme: 'playful',
      informal_only: true,
      sticker_component_ids: '["s1","s2"]',
      created_at: new Date(1700000000000),
    };
    const result = rowToStickerPack(row);
    expect(result.informalOnly).toBe(true);
    expect(result.stickerComponentIds).toEqual(['s1', 's2']);
  });
});

describe('rowToBrandLock', () => {
  it('maps all fields', () => {
    const row = {
      id: 'bl-001',
      deck_id: 'deck-1',
      scope: 'element',
      strictness: 'color-only',
      allowed_overrides: '["color","opacity"]',
      owner_user_id: 'user-1',
      scene_graph_selector: '#hero-element',
      created_at: new Date(1700000000000),
      updated_at: new Date(1700000001000),
    };
    const result = rowToBrandLock(row);
    expect(result.scope).toBe('element');
    expect(result.strictness).toBe('color-only');
    expect(result.allowedOverrides).toEqual(['color', 'opacity']);
  });
});

describe('rowToIcon', () => {
  it('maps with array columns from pg', () => {
    const row = {
      id: 'ic-001',
      name: 'star',
      synonyms: ['favorite', 'bookmark'],
      styles: ['filled', 'outlined'],
      path_data: 'M12 2l...',
      view_box: '0 0 24 24',
      vendor: 'lucide',
      license_id: 'MIT',
      perceptual_hash: 'abc123',
      created_at: new Date(1700000000000),
    };
    const result = rowToIcon(row);
    expect(result.synonyms).toEqual(['favorite', 'bookmark']);
    expect(result.styles).toEqual(['filled', 'outlined']);
    expect(result.perceptualHash).toBe('abc123');
  });

  it('maps without perceptual hash', () => {
    const row = {
      id: 'ic-002',
      name: 'heart',
      synonyms: [],
      styles: [],
      path_data: 'M12 21...',
      view_box: '0 0 24 24',
      vendor: 'lucide',
      license_id: 'MIT',
      perceptual_hash: null,
      created_at: new Date(1700000000000),
    };
    const result = rowToIcon(row);
    expect(result.perceptualHash).toBeUndefined();
  });
});

describe('rowToAuditRow', () => {
  it('maps all fields', () => {
    const row = {
      id: 'audit-001',
      actor_id: 'user-1',
      actor_kind: 'human',
      action: 'package.published',
      resource_type: 'component_package',
      resource_id: 'pkg-001',
      detail: '{"version":"1.0.0"}',
      created_at: new Date(1700000000000),
    };
    const result = rowToAuditRow(row);
    expect(result.action).toBe('package.published');
    expect(result.detail).toEqual({ version: '1.0.0' });
  });
});

// ---------------------------------------------------------------------------
// Docker-gated integration tests — only run when DATABASE_URL is set.
// ---------------------------------------------------------------------------

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('SqlStore integration (requires Postgres)', () => {
  let pool: unknown;
  let SqlStoreClass: typeof SqlStore;

  beforeAll(async () => {
    const { Pool } = await import('pg');
    const mod = await import('./sql.js');
    SqlStoreClass = mod.SqlStore;
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // Set RLS bypass for tests
    await pool.query("SET app.bypass_rls = 'on'");
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('full CRUD lifecycle for packages', async () => {
    const store = new SqlStoreClass(pool);
    const pkg: ComponentPackage = {
      id: 'test-pkg-001',
      catalogId: 'test-catalog',
      version: '1.0.0',
      kind: 'component',
      name: 'Test Component',
      description: 'A test',
      propsSchema: { type: 'object' },
      variants: [{ id: 'v1', label: 'Default', tokens: {} }],
      files: { main: 'hash1' },
      packageHash: 'sha256-test',
      sizeBudgetBytes: 1024,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await store.putPackage(pkg);
    const got = await store.getPackage('test-catalog', '1.0.0');
    expect(got).toBeDefined();
    expect(got!.name).toBe('Test Component');

    const byId = await store.getPackageById('test-pkg-001');
    expect(byId).toBeDefined();

    const versions = await store.listVersions('test-catalog');
    expect(versions.length).toBe(1);

    const searched = await store.searchPackages('Test');
    expect(searched.length).toBeGreaterThanOrEqual(1);

    await store.deletePackage('test-catalog', '1.0.0');
    const deleted = await store.getPackage('test-catalog', '1.0.0');
    expect(deleted).toBeUndefined();
  });

  it('CRUD for smart props', async () => {
    const store = new SqlStoreClass(pool);
    const props: SmartProp[] = [
      { propKey: 'label', propSchema: { type: 'string' }, required: true, controlHint: 'text' },
      { propKey: 'count', propSchema: { type: 'number' }, required: false, default: 0 },
    ];
    await store.putSmartProps('test-pkg-001', props);
    const got = await store.getSmartProps('test-pkg-001');
    expect(got.length).toBe(2);
    expect(got[0]!.propKey).toBe('label');

    // Replacing works
    await store.putSmartProps('test-pkg-001', [props[0]!]);
    const replaced = await store.getSmartProps('test-pkg-001');
    expect(replaced.length).toBe(1);
  });

  it('CRUD for user library items', async () => {
    const store = new SqlStoreClass(pool);
    const item: UserLibraryItem = {
      id: 'uli-001',
      userId: 'user-test',
      workspaceId: 'ws-test',
      catalogId: 'test-catalog',
      installedVersion: '1.0.0',
      pinMode: 'pin-version',
      pinValue: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.putLibraryItem(item);
    const got = await store.getLibraryItem('user-test', 'ws-test', 'test-catalog');
    expect(got).toBeDefined();
    expect(got!.pinValue).toBe('1.0.0');

    const items = await store.listLibraryItems('user-test', 'ws-test');
    expect(items.length).toBe(1);

    await store.deleteLibraryItem('user-test', 'ws-test', 'test-catalog');
    const deleted = await store.getLibraryItem('user-test', 'ws-test', 'test-catalog');
    expect(deleted).toBeUndefined();
  });

  it('CRUD for team library + events', async () => {
    const store = new SqlStoreClass(pool);
    const lib: TeamLibrary = {
      id: 'tl-test',
      workspaceId: 'ws-test',
      name: 'Test Library',
      policyMode: 'latest',
      ownerId: 'user-test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.putTeamLibrary(lib);
    const got = await store.getTeamLibrary('tl-test');
    expect(got).toBeDefined();
    expect(got!.policyMode).toBe('latest');

    const libs = await store.listTeamLibraries('ws-test');
    expect(libs.length).toBeGreaterThanOrEqual(1);

    // Append events
    const event: TeamLibraryEvent = {
      id: 'evt-test-1',
      libraryId: 'tl-test',
      seq: 1,
      kind: 'component_published',
      componentId: 'test-catalog',
      actorId: 'user-test',
      actorKind: 'human',
      createdAt: Date.now(),
    };
    await store.appendLibraryEvent(event);
    const events = await store.listLibraryEvents('tl-test');
    expect(events.length).toBe(1);
    expect(events[0]!.seq).toBe(1);

    const latestSeq = await store.latestLibrarySeq('tl-test');
    expect(latestSeq).toBe(1);
  });

  it('CRUD for listings, reviews, license grants', async () => {
    const store = new SqlStoreClass(pool);
    const listing: MarketplaceListing = {
      id: 'ls-test',
      catalogId: 'test-catalog',
      sellerId: 'seller-test',
      title: 'Test Listing',
      description: 'Desc',
      status: 'published',
      isFree: false,
      priceCents: 999,
      currency: 'usd',
      tags: ['test'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.putListing(listing);
    const got = await store.getListing('ls-test');
    expect(got).toBeDefined();
    expect(got!.priceCents).toBe(999);

    const byCatalog = await store.getListingByCatalogId('test-catalog');
    expect(byCatalog).toBeDefined();

    const review: Review = {
      id: 'rv-test',
      listingId: 'ls-test',
      reviewerId: 'user-test',
      rating: 5,
      body: 'Great!',
      status: 'accepted',
      verifiedBuyer: true,
      createdAt: Date.now(),
    };
    await store.putReview(review);
    const reviews = await store.listReviews('ls-test');
    expect(reviews.length).toBe(1);

    const grant: LicenseGrant = {
      id: 'lg-test',
      workspaceId: 'ws-test',
      catalogId: 'test-catalog',
      version: '1.0.0',
      licenseId: 'lic-test',
      seats: 3,
      signedToken: 'tok-test',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now(),
    };
    await store.putLicenseGrant(grant);
    const grants = await store.listLicenseGrants('ws-test');
    expect(grants.length).toBe(1);

    await store.revokeLicenseGrant('lg-test', Date.now());
    const revoked = await store.getLicenseGrant('lg-test');
    expect(revoked!.revokedAt).toBeDefined();
  });

  it('CRUD for templates, sticker packs, brand locks', async () => {
    const store = new SqlStoreClass(pool);
    const tmpl: Template = {
      id: 'tmpl-test',
      kind: 'full_deck',
      name: 'Test Template',
      description: 'A template',
      placeholders: [],
      authorId: 'user-test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.putTemplate(tmpl);
    const got = await store.getTemplate('tmpl-test');
    expect(got).toBeDefined();

    const section: SectionTemplate = {
      id: 'sec-test',
      templateId: 'tmpl-test',
      name: 'Hero',
      slides: [],
      spreadable: true,
      createdAt: Date.now(),
    };
    await store.putSectionTemplate(section);
    const sections = await store.listSectionTemplates('tmpl-test');
    expect(sections.length).toBe(1);

    const pack: StickerPack = {
      id: 'sp-test',
      name: 'Test Pack',
      theme: 'fun',
      informalOnly: false,
      stickerComponentIds: [],
      createdAt: Date.now(),
    };
    await store.putStickerPack(pack);
    const packs = await store.listStickerPacks();
    expect(packs.length).toBeGreaterThanOrEqual(1);

    const lock: BrandLockRegion = {
      id: 'bl-test',
      deckId: 'deck-test',
      scope: 'slide',
      strictness: 'strict',
      allowedOverrides: [],
      ownerUserId: 'user-test',
      sceneGraphSelector: '#slide-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.putBrandLock(lock);
    const locks = await store.listBrandLocks('deck-test');
    expect(locks.length).toBe(1);
    await store.deleteBrandLock('bl-test');
    const deleted = await store.getBrandLock('bl-test');
    expect(deleted).toBeUndefined();
  });

  it('CRUD for icons', async () => {
    const store = new SqlStoreClass(pool);
    const icon: IconRecord = {
      id: 'icon-test',
      name: 'test-icon',
      synonyms: ['test'],
      styles: ['filled'],
      pathData: 'M0 0',
      viewBox: '0 0 24 24',
      vendor: 'test-vendor',
      licenseId: 'MIT',
      perceptualHash: 'hash123',
      createdAt: Date.now(),
    };
    await store.putIcon(icon);
    const got = await store.getIcon('icon-test');
    expect(got).toBeDefined();
    expect(got!.perceptualHash).toBe('hash123');

    const found = await store.findIconsByHash('hash123');
    expect(found.length).toBe(1);

    const count = await store.countIcons();
    expect(count).toBeGreaterThanOrEqual(1);

    const searched = await store.searchIcons('test-icon');
    expect(searched.length).toBeGreaterThanOrEqual(1);
  });

  it('CRUD for audit log', async () => {
    const store = new SqlStoreClass(pool);
    const row: AuditRow = {
      id: 'audit-test',
      actorId: 'user-test',
      actorKind: 'human',
      action: 'test.action',
      resourceType: 'test',
      resourceId: 'test-001',
      detail: { key: 'value' },
      createdAt: Date.now(),
    };
    await store.appendAudit(row);
    const rows = await store.listAudit();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.action).toBe('test.action');
  });
});
