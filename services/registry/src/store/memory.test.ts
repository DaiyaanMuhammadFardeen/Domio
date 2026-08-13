import { describe, it, expect } from 'vitest';
import { InMemoryStore } from './memory.js';
import type {
  ComponentPackage,
  SmartProp,
  UserLibraryItem,
  TeamLibrary,
  TeamLibraryEvent,
  MarketplaceListing,
  Review,
  LicenseGrant,
  RevenueEvent,
  Template,
  SectionTemplate,
  StickerPack,
  BrandLockRegion,
  IconRecord,
  StoredBlob,
} from './types.js';
import type { AuditRow } from './interface.js';

describe('InMemoryStore', () => {
  const now = Date.now();
  const basePkg: ComponentPackage = {
    id: 'pkg-1',
    catalogId: 'c.btn',
    version: '1.0.0',
    kind: 'component',
    name: 'Btn',
    description: 'A button',
    propsSchema: {},
    variants: [],
    files: { 'btn.js': 'abc' },
    packageHash: 'hash1',
    sizeBudgetBytes: 1024,
    createdAt: now,
    updatedAt: now,
  };

  describe('blobs', () => {
    it('put/get/has blob', async () => {
      const store = new InMemoryStore();
      const blob: StoredBlob = { sha256: 'aaa', bytes: new Uint8Array([1, 2, 3]), storedAt: now };
      await store.putBlob(blob);
      expect(await store.getBlob('aaa')).toBe(blob);
      expect(await store.hasBlob('aaa')).toBe(true);
      expect(await store.hasBlob('bbb')).toBe(false);
      expect(await store.getBlob('bbb')).toBeUndefined();
    });
  });

  describe('packages', () => {
    it('put/get/list/search/delete', async () => {
      const store = new InMemoryStore();
      await store.putPackage(basePkg);
      expect(await store.getPackage('c.btn', '1.0.0')).toBe(basePkg);
      expect(await store.getPackageById('pkg-1')).toBe(basePkg);
      expect(await store.listVersions('c.btn')).toHaveLength(1);
      expect(await store.listPackages({ kind: 'component' })).toHaveLength(1);
      expect(await store.listPackages({ category: 'nonexistent' })).toHaveLength(0);
      expect(await store.searchPackages('Btn')).toHaveLength(1);
      expect(await store.searchPackages('Btn', { kind: 'component' })).toHaveLength(1);
      expect(await store.searchPackages('Btn', { limit: 1 })).toHaveLength(1);
      await store.deletePackage('c.btn', '1.0.0');
      expect(await store.getPackage('c.btn', '1.0.0')).toBeUndefined();
    });
  });

  describe('smart props', () => {
    it('put/get', async () => {
      const store = new InMemoryStore();
      const props: SmartProp[] = [
        { propKey: 'label', propSchema: { type: 'string' }, required: true },
      ];
      await store.putSmartProps('comp-1', props);
      expect(await store.getSmartProps('comp-1')).toEqual(props);
      expect(await store.getSmartProps('missing')).toEqual([]);
    });
  });

  describe('library items', () => {
    it('put/get/list/delete', async () => {
      const store = new InMemoryStore();
      const item: UserLibraryItem = {
        id: 'li-1',
        userId: 'u1',
        workspaceId: 'w1',
        catalogId: 'c.btn',
        installedVersion: '1.0.0',
        pinMode: 'track-latest',
        createdAt: now,
        updatedAt: now,
      };
      await store.putLibraryItem(item);
      expect(await store.getLibraryItem('u1', 'w1', 'c.btn')).toBe(item);
      expect(await store.listLibraryItems('u1', 'w1')).toHaveLength(1);
      await store.deleteLibraryItem('u1', 'w1', 'c.btn');
      expect(await store.getLibraryItem('u1', 'w1', 'c.btn')).toBeUndefined();
    });
  });

  describe('team libraries', () => {
    it('put/get/list + events', async () => {
      const store = new InMemoryStore();
      const lib: TeamLibrary = {
        id: 'tl-1',
        workspaceId: 'w1',
        name: 'My Lib',
        policyMode: 'latest',
        ownerId: 'u1',
        createdAt: now,
        updatedAt: now,
      };
      await store.putTeamLibrary(lib);
      expect(await store.getTeamLibrary('tl-1')).toBe(lib);
      expect(await store.listTeamLibraries('w1')).toHaveLength(1);
      expect(await store.listTeamLibraries('w2')).toHaveLength(0);

      const event: TeamLibraryEvent = {
        id: 'ev-1',
        libraryId: 'tl-1',
        seq: 1,
        kind: 'component_published',
        componentId: 'c.btn',
        actorId: 'u1',
        actorKind: 'human',
        createdAt: now,
      };
      await store.appendLibraryEvent(event);
      expect(await store.listLibraryEvents('tl-1')).toHaveLength(1);
      expect(await store.listLibraryEvents('tl-1', 0)).toHaveLength(1);
      expect(await store.listLibraryEvents('tl-1', 1)).toHaveLength(0);
      expect(await store.latestLibrarySeq('tl-1')).toBe(1);
    });
  });

  describe('listings', () => {
    it('put/get/search/list', async () => {
      const store = new InMemoryStore();
      const listing: MarketplaceListing = {
        id: 'l1',
        catalogId: 'c.btn',
        sellerId: 's1',
        title: 'Button',
        description: 'A button',
        status: 'published',
        isFree: false,
        priceCents: 500,
        tags: ['ui', 'button'],
        createdAt: now,
        updatedAt: now,
      };
      await store.putListing(listing);
      expect(await store.getListing('l1')).toBe(listing);
      expect(await store.getListingByCatalogId('c.btn')).toBe(listing);
      expect(await store.listListings({ status: 'published' })).toHaveLength(1);
      expect(await store.listListings({ sellerId: 's1' })).toHaveLength(1);
      expect(await store.listListings({ limit: 1 })).toHaveLength(1);
      expect(await store.searchListings('Button')).toHaveLength(1);
      expect(await store.searchListings('btn', { tags: ['ui'] })).toHaveLength(1);
      expect(await store.searchListings('nonexistent')).toHaveLength(0);
    });
  });

  describe('reviews', () => {
    it('put/get/list/listByStatus', async () => {
      const store = new InMemoryStore();
      const review: Review = {
        id: 'r1',
        listingId: 'l1',
        reviewerId: 'u1',
        rating: 5,
        body: 'Great',
        status: 'accepted',
        verifiedBuyer: true,
        createdAt: now,
      };
      await store.putReview(review);
      expect(await store.getReview('r1')).toBe(review);
      expect(await store.listReviews('l1')).toHaveLength(1);
      expect(await store.listReviews('l1', 'accepted')).toHaveLength(1);
      expect(await store.listReviewsByStatus('accepted')).toHaveLength(1);
      expect(await store.listReviewsByStatus('removed')).toHaveLength(0);
    });
  });

  describe('license grants', () => {
    it('put/get/list/revoke', async () => {
      const store = new InMemoryStore();
      const grant: LicenseGrant = {
        id: 'lg-1',
        workspaceId: 'w1',
        catalogId: 'c.btn',
        version: '1.0.0',
        licenseId: 'lic-1',
        seats: 5,
        signedToken: 'tok',
        issuedAt: now,
        expiresAt: now + 1e7,
        createdAt: now,
      };
      await store.putLicenseGrant(grant);
      expect(await store.getLicenseGrant('lic-1')).toBe(grant);
      expect(await store.listLicenseGrants('w1')).toHaveLength(1);
      expect(await store.listLicenseGrants('w1', 'c.btn')).toHaveLength(1);
      expect(await store.listLicenseGrants('w1', 'other')).toHaveLength(0);
      await store.revokeLicenseGrant('lic-1', now + 1000);
      expect((await store.getLicenseGrant('lic-1'))!.revokedAt).toBe(now + 1000);
    });
  });

  describe('revenue events', () => {
    it('append/list', async () => {
      const store = new InMemoryStore();
      const ev: RevenueEvent = {
        id: 're-1',
        listingId: 'l1',
        sellerId: 's1',
        workspaceId: 'w1',
        currency: 'USD',
        grossCents: 1000,
        feeCents: 30,
        netCents: 970,
        payoutStatus: 'pending',
        periodMonth: '2025-01',
        eventType: 'sale',
        createdAt: now,
      };
      await store.appendRevenueEvent(ev);
      expect(await store.listRevenueEvents('s1')).toHaveLength(1);
      expect(await store.listRevenueEvents('s1', '2025-01')).toHaveLength(1);
      expect(await store.listRevenueEvents('s1', '2025-02')).toHaveLength(0);
    });
  });

  describe('templates + sections', () => {
    it('put/get/list templates + sections', async () => {
      const store = new InMemoryStore();
      const t: Template = {
        id: 't1',
        kind: 'full_deck',
        name: 'Deck',
        description: '',
        placeholders: [],
        authorId: 'u1',
        createdAt: now,
        updatedAt: now,
      };
      await store.putTemplate(t);
      expect(await store.getTemplate('t1')).toBe(t);
      expect(await store.listTemplates()).toHaveLength(1);
      expect(await store.listTemplates('full_deck')).toHaveLength(1);
      expect(await store.listTemplates('section')).toHaveLength(0);

      const s: SectionTemplate = {
        id: 's1',
        templateId: 't1',
        name: 'Intro',
        slides: [],
        spreadable: true,
        createdAt: now,
      };
      await store.putSectionTemplate(s);
      expect(await store.listSectionTemplates('t1')).toHaveLength(1);
      expect(await store.listSectionTemplates('t2')).toHaveLength(0);
    });
  });

  describe('sticker packs', () => {
    it('put/list', async () => {
      const store = new InMemoryStore();
      const pack: StickerPack = {
        id: 'sp-1',
        name: 'Fun',
        theme: 'emoji',
        informalOnly: false,
        stickerComponentIds: [],
        createdAt: now,
      };
      await store.putStickerPack(pack);
      expect(await store.listStickerPacks()).toHaveLength(1);
      expect(await store.listStickerPacks('emoji')).toHaveLength(1);
      expect(await store.listStickerPacks('other')).toHaveLength(0);
    });
  });

  describe('brand locks', () => {
    it('put/get/list/delete', async () => {
      const store = new InMemoryStore();
      const lock: BrandLockRegion = {
        id: 'bl-1',
        deckId: 'd1',
        scope: 'slide',
        strictness: 'strict',
        allowedOverrides: [],
        ownerUserId: 'u1',
        sceneGraphSelector: 's1',
        createdAt: now,
        updatedAt: now,
      };
      await store.putBrandLock(lock);
      expect(await store.getBrandLock('bl-1')).toBe(lock);
      expect(await store.listBrandLocks('d1')).toHaveLength(1);
      expect(await store.listBrandLocks('d2')).toHaveLength(0);
      await store.deleteBrandLock('bl-1');
      expect(await store.getBrandLock('bl-1')).toBeUndefined();
    });
  });

  describe('icons', () => {
    it('put/get/search/find/count', async () => {
      const store = new InMemoryStore();
      const icon: IconRecord = {
        id: 'i1',
        name: 'Star',
        synonyms: ['star', 'favorite'],
        styles: ['solid'],
        pathData: 'M0,0',
        viewBox: '0 0 24 24',
        vendor: 'domio',
        licenseId: 'MIT',
        perceptualHash: 'hash-abc',
        createdAt: now,
      };
      await store.putIcon(icon);
      expect(await store.getIcon('i1')).toBe(icon);
      expect(await store.searchIcons('Star')).toHaveLength(1);
      expect(await store.searchIcons('star')).toHaveLength(1);
      expect(await store.searchIcons('nonexistent')).toHaveLength(0);
      expect(await store.findIconsByHash('hash-abc')).toHaveLength(1);
      expect(await store.findIconsByHash('other')).toHaveLength(0);
      expect(await store.countIcons()).toBe(1);
    });
  });

  describe('audit', () => {
    it('append/list', async () => {
      const store = new InMemoryStore();
      const row: AuditRow = {
        id: 'a1',
        actorId: 'u1',
        actorKind: 'human',
        action: 'test',
        resourceType: 'test',
        resourceId: '1',
        detail: {},
        createdAt: now,
      };
      await store.appendAudit(row);
      expect(await store.listAudit()).toHaveLength(1);
      expect(await store.listAudit('human')).toHaveLength(1);
      expect(await store.listAudit('agent')).toHaveLength(0);
      expect(await store.listAudit(undefined, 0)).toHaveLength(0);
    });
  });
});
