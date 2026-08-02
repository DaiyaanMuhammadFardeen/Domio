import type {
  BrandLockRegion,
  ComponentPackage,
  IconRecord,
  LicenseGrant,
  MarketplaceListing,
  RevenueEvent,
  Review,
  SectionTemplate,
  SmartProp,
  StickerPack,
  StoredBlob,
  TeamLibrary,
  TeamLibraryEvent,
  Template,
  UserLibraryItem,
} from './types.js';

/**
 * RegistryStore — the single data-access surface for registry-service logic.
 *
 * Two implementations exist:
 *  - InMemoryStore (tests, local dev)
 *  - SqlStore (Postgres, mirrors migrations 0011–0015)
 *
 * All methods are async so both backends share the same call shape.
 */
export interface RegistryStore {
  // ---- blobs (content-addressed bundle store) ----
  putBlob(blob: StoredBlob): Promise<void>;
  getBlob(sha256: string): Promise<StoredBlob | undefined>;
  hasBlob(sha256: string): Promise<boolean>;

  // ---- component catalog ----
  putPackage(pkg: ComponentPackage): Promise<void>;
  getPackage(catalogId: string, version: string): Promise<ComponentPackage | undefined>;
  getPackageById(id: string): Promise<ComponentPackage | undefined>;
  listPackages(opts?: { kind?: string; category?: string; limit?: number }): Promise<ComponentPackage[]>;
  listVersions(catalogId: string): Promise<ComponentPackage[]>;
  searchPackages(query: string, opts?: { kind?: string; limit?: number }): Promise<ComponentPackage[]>;
  deletePackage(catalogId: string, version: string): Promise<void>;
  putSmartProps(componentId: string, props: SmartProp[]): Promise<void>;
  getSmartProps(componentId: string): Promise<SmartProp[]>;

  // ---- user + team libraries ----
  putLibraryItem(item: UserLibraryItem): Promise<void>;
  getLibraryItem(userId: string, workspaceId: string, catalogId: string): Promise<UserLibraryItem | undefined>;
  listLibraryItems(userId: string, workspaceId: string): Promise<UserLibraryItem[]>;
  deleteLibraryItem(userId: string, workspaceId: string, catalogId: string): Promise<void>;

  putTeamLibrary(lib: TeamLibrary): Promise<void>;
  getTeamLibrary(id: string): Promise<TeamLibrary | undefined>;
  listTeamLibraries(workspaceId: string): Promise<TeamLibrary[]>;

  appendLibraryEvent(event: TeamLibraryEvent): Promise<void>;
  listLibraryEvents(libraryId: string, afterSeq?: number, limit?: number): Promise<TeamLibraryEvent[]>;
  latestLibrarySeq(libraryId: string): Promise<number>;

  // ---- marketplace ----
  putListing(listing: MarketplaceListing): Promise<void>;
  getListing(id: string): Promise<MarketplaceListing | undefined>;
  getListingByCatalogId(catalogId: string): Promise<MarketplaceListing | undefined>;
  listListings(opts?: { status?: string; sellerId?: string; limit?: number }): Promise<MarketplaceListing[]>;
  searchListings(query: string, opts?: { status?: string; tags?: string[]; limit?: number }): Promise<MarketplaceListing[]>;

  putReview(review: Review): Promise<void>;
  getReview(id: string): Promise<Review | undefined>;
  listReviews(listingId: string, status?: string): Promise<Review[]>;
  listReviewsByStatus(status: string, limit?: number): Promise<Review[]>;

  putLicenseGrant(grant: LicenseGrant): Promise<void>;
  getLicenseGrant(licenseId: string): Promise<LicenseGrant | undefined>;
  listLicenseGrants(workspaceId: string, catalogId?: string): Promise<LicenseGrant[]>;
  revokeLicenseGrant(licenseId: string, revokedAt: number): Promise<void>;

  appendRevenueEvent(event: RevenueEvent): Promise<void>;
  listRevenueEvents(sellerId: string, periodMonth?: string): Promise<RevenueEvent[]>;

  // ---- templates + sections + stickers + brand locks ----
  putTemplate(t: Template): Promise<void>;
  getTemplate(id: string): Promise<Template | undefined>;
  listTemplates(kind?: string): Promise<Template[]>;
  putSectionTemplate(s: SectionTemplate): Promise<void>;
  listSectionTemplates(templateId: string): Promise<SectionTemplate[]>;

  putStickerPack(pack: StickerPack): Promise<void>;
  listStickerPacks(theme?: string): Promise<StickerPack[]>;

  putBrandLock(lock: BrandLockRegion): Promise<void>;
  getBrandLock(id: string): Promise<BrandLockRegion | undefined>;
  listBrandLocks(deckId: string): Promise<BrandLockRegion[]>;
  deleteBrandLock(id: string): Promise<void>;

  // ---- icons ----
  putIcon(icon: IconRecord): Promise<void>;
  getIcon(id: string): Promise<IconRecord | undefined>;
  searchIcons(query: string, opts?: { limit?: number }): Promise<IconRecord[]>;
  findIconsByHash(hash: string, limit?: number): Promise<IconRecord[]>;
  countIcons(): Promise<number>;

  // ---- audit ----
  appendAudit(row: AuditRow): Promise<void>;
  listAudit(actorKind?: string, limit?: number): Promise<AuditRow[]>;
}

export interface AuditRow {
  id: string;
  actorId: string;
  actorKind: 'human' | 'agent';
  action: string;
  resourceType: string;
  resourceId: string;
  detail: Record<string, unknown>;
  createdAt: number;
}
