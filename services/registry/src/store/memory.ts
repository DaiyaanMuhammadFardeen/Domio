import type { RegistryStore, AuditRow } from './interface.js';
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

function sortByCreatedDesc<T extends { createdAt: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.createdAt - a.createdAt);
}

function matchesQuery(haystack: string, query: string): boolean {
  const q = query.toLowerCase();
  return haystack.toLowerCase().includes(q);
}

/**
 * Deterministic in-memory RegistryStore. Used by unit tests and local dev.
 * Maps of arrays keep the implementation simple; all operations are O(n) which
 * is fine at test scale.
 */
export class InMemoryStore implements RegistryStore {
  blobs = new Map<string, StoredBlob>();
  packages = new Map<string, ComponentPackage>(); // key: `${catalogId}@${version}`
  packagesById = new Map<string, ComponentPackage>();
  smartProps = new Map<string, SmartProp[]>();
  libraryItems = new Map<string, UserLibraryItem>();
  teamLibraries = new Map<string, TeamLibrary>();
  libraryEvents = new Map<string, TeamLibraryEvent[]>();
  listings = new Map<string, MarketplaceListing>();
  reviews = new Map<string, Review>();
  licenseGrants = new Map<string, LicenseGrant>();
  revenueEvents = new Map<string, RevenueEvent>();
  templates = new Map<string, Template>();
  sectionTemplates = new Map<string, SectionTemplate[]>();
  stickerPacks = new Map<string, StickerPack>();
  brandLocks = new Map<string, BrandLockRegion>();
  icons = new Map<string, IconRecord>();
  audit = new Map<string, AuditRow>();

  private pkgKey(catalogId: string, version: string): string {
    return `${catalogId}@${version}`;
  }

  async putBlob(blob: StoredBlob): Promise<void> {
    this.blobs.set(blob.sha256, blob);
  }
  async getBlob(sha256: string): Promise<StoredBlob | undefined> {
    return this.blobs.get(sha256);
  }
  async hasBlob(sha256: string): Promise<boolean> {
    return this.blobs.has(sha256);
  }

  async putPackage(pkg: ComponentPackage): Promise<void> {
    this.packages.set(this.pkgKey(pkg.catalogId, pkg.version), pkg);
    this.packagesById.set(pkg.id, pkg);
  }
  async getPackage(catalogId: string, version: string): Promise<ComponentPackage | undefined> {
    return this.packages.get(this.pkgKey(catalogId, version));
  }
  async getPackageById(id: string): Promise<ComponentPackage | undefined> {
    return this.packagesById.get(id);
  }
  async listPackages(opts?: { kind?: string; category?: string; limit?: number }): Promise<ComponentPackage[]> {
    let rows = [...this.packages.values()];
    if (opts?.kind) rows = rows.filter((p) => p.kind === opts.kind);
    if (opts?.category) rows = rows.filter((p) => p.category === opts.category);
    rows = sortByCreatedDesc(rows);
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }
  async listVersions(catalogId: string): Promise<ComponentPackage[]> {
    return sortByCreatedDesc([...this.packages.values()].filter((p) => p.catalogId === catalogId));
  }
  async searchPackages(query: string, opts?: { kind?: string; limit?: number }): Promise<ComponentPackage[]> {
    let rows = [...this.packages.values()].filter(
      (p) => matchesQuery(p.name, query) || matchesQuery(p.catalogId, query) || matchesQuery(p.description, query),
    );
    if (opts?.kind) rows = rows.filter((p) => p.kind === opts.kind);
    rows = sortByCreatedDesc(rows);
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }
  async deletePackage(catalogId: string, version: string): Promise<void> {
    this.packages.delete(this.pkgKey(catalogId, version));
  }
  async putSmartProps(componentId: string, props: SmartProp[]): Promise<void> {
    this.smartProps.set(componentId, props);
  }
  async getSmartProps(componentId: string): Promise<SmartProp[]> {
    return this.smartProps.get(componentId) ?? [];
  }

  async putLibraryItem(item: UserLibraryItem): Promise<void> {
    this.libraryItems.set(`${item.userId}|${item.workspaceId}|${item.catalogId}`, item);
  }
  async getLibraryItem(userId: string, workspaceId: string, catalogId: string): Promise<UserLibraryItem | undefined> {
    return this.libraryItems.get(`${userId}|${workspaceId}|${catalogId}`);
  }
  async listLibraryItems(userId: string, workspaceId: string): Promise<UserLibraryItem[]> {
    return sortByCreatedDesc(
      [...this.libraryItems.values()].filter((i) => i.userId === userId && i.workspaceId === workspaceId),
    );
  }
  async deleteLibraryItem(userId: string, workspaceId: string, catalogId: string): Promise<void> {
    this.libraryItems.delete(`${userId}|${workspaceId}|${catalogId}`);
  }

  async putTeamLibrary(lib: TeamLibrary): Promise<void> {
    this.teamLibraries.set(lib.id, lib);
  }
  async getTeamLibrary(id: string): Promise<TeamLibrary | undefined> {
    return this.teamLibraries.get(id);
  }
  async listTeamLibraries(workspaceId: string): Promise<TeamLibrary[]> {
    return [...this.teamLibraries.values()].filter((l) => l.workspaceId === workspaceId);
  }

  async appendLibraryEvent(event: TeamLibraryEvent): Promise<void> {
    const rows = this.libraryEvents.get(event.libraryId) ?? [];
    rows.push(event);
    this.libraryEvents.set(event.libraryId, rows);
  }
  async listLibraryEvents(libraryId: string, afterSeq = 0, limit = 100): Promise<TeamLibraryEvent[]> {
    const rows = (this.libraryEvents.get(libraryId) ?? [])
      .filter((e) => e.seq > afterSeq)
      .sort((a, b) => a.seq - b.seq);
    return rows.slice(0, limit);
  }
  async latestLibrarySeq(libraryId: string): Promise<number> {
    const rows = this.libraryEvents.get(libraryId) ?? [];
    return rows.reduce((max, e) => Math.max(max, e.seq), 0);
  }

  async putListing(listing: MarketplaceListing): Promise<void> {
    this.listings.set(listing.id, listing);
  }
  async getListing(id: string): Promise<MarketplaceListing | undefined> {
    return this.listings.get(id);
  }
  async getListingByCatalogId(catalogId: string): Promise<MarketplaceListing | undefined> {
    return [...this.listings.values()].find((l) => l.catalogId === catalogId);
  }
  async listListings(opts?: { status?: string; sellerId?: string; limit?: number }): Promise<MarketplaceListing[]> {
    let rows = [...this.listings.values()];
    if (opts?.status) rows = rows.filter((l) => l.status === opts.status);
    if (opts?.sellerId) rows = rows.filter((l) => l.sellerId === opts.sellerId);
    rows = sortByCreatedDesc(rows);
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }
  async searchListings(
    query: string,
    opts?: { status?: string; tags?: string[]; limit?: number },
  ): Promise<MarketplaceListing[]> {
    let rows = [...this.listings.values()].filter(
      (l) =>
        matchesQuery(l.title, query) ||
        matchesQuery(l.description, query) ||
        matchesQuery(l.catalogId, query) ||
        l.tags.some((t) => matchesQuery(t, query)),
    );
    if (opts?.status) rows = rows.filter((l) => l.status === opts.status);
    if (opts?.tags?.length) rows = rows.filter((l) => opts.tags!.every((t) => l.tags.includes(t)));
    rows = sortByCreatedDesc(rows);
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }

  async putReview(review: Review): Promise<void> {
    this.reviews.set(review.id, review);
  }
  async getReview(id: string): Promise<Review | undefined> {
    return this.reviews.get(id);
  }
  async listReviews(listingId: string, status?: string): Promise<Review[]> {
    let rows = [...this.reviews.values()].filter((r) => r.listingId === listingId);
    if (status) rows = rows.filter((r) => r.status === status);
    return sortByCreatedDesc(rows);
  }
  async listReviewsByStatus(status: string, limit = 100): Promise<Review[]> {
    return [...this.reviews.values()]
      .filter((r) => r.status === status)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async putLicenseGrant(grant: LicenseGrant): Promise<void> {
    this.licenseGrants.set(grant.licenseId, grant);
  }
  async getLicenseGrant(licenseId: string): Promise<LicenseGrant | undefined> {
    return this.licenseGrants.get(licenseId);
  }
  async listLicenseGrants(workspaceId: string, catalogId?: string): Promise<LicenseGrant[]> {
    let rows = [...this.licenseGrants.values()].filter((g) => g.workspaceId === workspaceId);
    if (catalogId) rows = rows.filter((g) => g.catalogId === catalogId);
    return sortByCreatedDesc(rows);
  }
  async revokeLicenseGrant(licenseId: string, revokedAt: number): Promise<void> {
    const g = this.licenseGrants.get(licenseId);
    if (g) g.revokedAt = revokedAt;
  }

  async appendRevenueEvent(event: RevenueEvent): Promise<void> {
    this.revenueEvents.set(event.id, event);
  }
  async listRevenueEvents(sellerId: string, periodMonth?: string): Promise<RevenueEvent[]> {
    let rows = [...this.revenueEvents.values()].filter((e) => e.sellerId === sellerId);
    if (periodMonth) rows = rows.filter((e) => e.periodMonth === periodMonth);
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }

  async putTemplate(t: Template): Promise<void> {
    this.templates.set(t.id, t);
  }
  async getTemplate(id: string): Promise<Template | undefined> {
    return this.templates.get(id);
  }
  async listTemplates(kind?: string): Promise<Template[]> {
    let rows = [...this.templates.values()];
    if (kind) rows = rows.filter((t) => t.kind === kind);
    return sortByCreatedDesc(rows);
  }
  async putSectionTemplate(s: SectionTemplate): Promise<void> {
    const rows = this.sectionTemplates.get(s.templateId) ?? [];
    rows.push(s);
    this.sectionTemplates.set(s.templateId, rows);
  }
  async listSectionTemplates(templateId: string): Promise<SectionTemplate[]> {
    return this.sectionTemplates.get(templateId) ?? [];
  }

  async putStickerPack(pack: StickerPack): Promise<void> {
    this.stickerPacks.set(pack.id, pack);
  }
  async listStickerPacks(theme?: string): Promise<StickerPack[]> {
    let rows = [...this.stickerPacks.values()];
    if (theme) rows = rows.filter((p) => p.theme === theme);
    return sortByCreatedDesc(rows);
  }

  async putBrandLock(lock: BrandLockRegion): Promise<void> {
    this.brandLocks.set(lock.id, lock);
  }
  async getBrandLock(id: string): Promise<BrandLockRegion | undefined> {
    return this.brandLocks.get(id);
  }
  async listBrandLocks(deckId: string): Promise<BrandLockRegion[]> {
    return [...this.brandLocks.values()].filter((l) => l.deckId === deckId);
  }
  async deleteBrandLock(id: string): Promise<void> {
    this.brandLocks.delete(id);
  }

  async putIcon(icon: IconRecord): Promise<void> {
    this.icons.set(icon.id, icon);
  }
  async getIcon(id: string): Promise<IconRecord | undefined> {
    return this.icons.get(id);
  }
  async searchIcons(query: string, opts?: { limit?: number }): Promise<IconRecord[]> {
    let rows = [...this.icons.values()].filter(
      (i) => matchesQuery(i.name, query) || i.synonyms.some((s) => matchesQuery(s, query)),
    );
    rows = sortByCreatedDesc(rows);
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }
  async findIconsByHash(hash: string, limit = 10): Promise<IconRecord[]> {
    return [...this.icons.values()].filter((i) => i.perceptualHash === hash).slice(0, limit);
  }
  async countIcons(): Promise<number> {
    return this.icons.size;
  }

  async appendAudit(row: AuditRow): Promise<void> {
    this.audit.set(row.id, row);
  }
  async listAudit(actorKind?: string, limit = 50): Promise<AuditRow[]> {
    let rows = [...this.audit.values()];
    if (actorKind) rows = rows.filter((a) => a.actorKind === actorKind);
    return sortByCreatedDesc(rows).slice(0, limit);
  }
}
