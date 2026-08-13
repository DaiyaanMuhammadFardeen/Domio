import type { Pool } from 'pg';
import type { RegistryStore, AuditRow } from '../store/interface.js';
import type {
  BrandLockRegion,
  ComponentKind,
  ComponentPackage,
  ComponentVariant,
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
} from '../store/types.js';

// ---------------------------------------------------------------------------
// Timestamp / bigint helpers
// ---------------------------------------------------------------------------

/** Convert a pg timestamptz (Date, string, or number) to epoch ms. */
export function tsToMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.length > 0) return new Date(value).getTime();
  return 0;
}

/** Convert a pg bigint (string or number) to a JS number. */
export function bigintToNum(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

/** Parse a jsonb column that may come as string or already-parsed object. */
function parseJson<T>(value: unknown): T {
  if (value == null) return value as T;
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value as T;
}

/** A loose row object — pg returns key/value pairs with arbitrary value types. */
type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Entity ↔ Row mappers (exported pure functions for testing)
// ---------------------------------------------------------------------------

export function rowToPackage(row: Record<string, unknown>): ComponentPackage {
  const r = row as Row;
  const pkg: ComponentPackage = {
    id: String(r.id),
    catalogId: String(r.catalog_id),
    version: String(r.version),
    kind: r.kind as ComponentKind,
    name: String(r.name),
    description: String(r.description ?? ''),
    propsSchema: parseJson<Record<string, unknown>>(r.props_schema) ?? {},
    variants: parseJson<ComponentVariant[]>(r.variants) ?? [],
    files: parseJson<Record<string, string>>(r.files) ?? {},
    packageHash: String(r.package_hash),
    sizeBudgetBytes: bigintToNum(r.size_budget_bytes),
    createdAt: tsToMs(r.created_at),
    updatedAt: tsToMs(r.updated_at),
  };
  if (r.category != null) pkg.category = String(r.category);
  if (r.author != null) pkg.author = String(r.author);
  if (r.license_id != null) pkg.licenseId = String(r.license_id);
  if (r.signing_key_id != null) pkg.signingKeyId = String(r.signing_key_id);
  if (r.signature != null) pkg.signature = String(r.signature);
  if (r.deprecation != null) {
    pkg.deprecation = parseJson<{ reason: string; replaceWith?: string; deprecatedAt: number }>(
      r.deprecation,
    );
  }
  // NOTE: DB null for deprecation is treated as "not deprecated" (omitted).
  // SQL cannot distinguish "property never set" from "property set to null".
  return pkg;
}

export function pkgToRow(pkg: ComponentPackage): Record<string, unknown> {
  return {
    id: pkg.id,
    catalog_id: pkg.catalogId,
    version: pkg.version,
    kind: pkg.kind,
    name: pkg.name,
    description: pkg.description,
    category: pkg.category ?? null,
    author: pkg.author ?? null,
    license_id: pkg.licenseId ?? null,
    props_schema: pkg.propsSchema,
    variants: pkg.variants,
    files: pkg.files,
    package_hash: pkg.packageHash,
    signing_key_id: pkg.signingKeyId ?? null,
    signature: pkg.signature ?? null,
    deprecation: pkg.deprecation ?? null,
    size_budget_bytes: pkg.sizeBudgetBytes,
    created_at: new Date(pkg.createdAt),
    updated_at: new Date(pkg.updatedAt),
  };
}

export function rowToSmartProp(row: Record<string, unknown>): SmartProp {
  const r = row as Row;
  const prop: SmartProp = {
    propKey: String(r.prop_key),
    propSchema: parseJson<Record<string, unknown>>(r.prop_schema),
    required: Boolean(r.required),
  };
  if (r.control_hint != null) prop.controlHint = String(r.control_hint);
  if (r.default_value != null) prop.default = r.default_value;
  return prop;
}

export function rowToLibraryItem(row: Record<string, unknown>): UserLibraryItem {
  const r = row as Row;
  const item: UserLibraryItem = {
    id: String(r.id),
    userId: String(r.user_id),
    workspaceId: String(r.workspace_id),
    catalogId: String(r.catalog_id),
    installedVersion: String(r.installed_version),
    pinMode: r.pin_mode as UserLibraryItem['pinMode'],
    createdAt: tsToMs(r.created_at),
    updatedAt: tsToMs(r.updated_at),
  };
  if (r.pin_value != null) item.pinValue = String(r.pin_value);
  if (r.license_grant_id != null) item.licenseGrantId = String(r.license_grant_id);
  return item;
}

export function rowToTeamLibrary(row: Record<string, unknown>): TeamLibrary {
  const r = row as Row;
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    name: String(r.name),
    policyMode: r.policy_mode as TeamLibrary['policyMode'],
    ownerId: String(r.owner_id),
    createdAt: tsToMs(r.created_at),
    updatedAt: tsToMs(r.updated_at),
  };
}

export function rowToLibraryEvent(row: Record<string, unknown>): TeamLibraryEvent {
  const r = row as Row;
  const evt: TeamLibraryEvent = {
    id: String(r.id),
    libraryId: String(r.library_id),
    seq: bigintToNum(r.seq),
    kind: r.kind as TeamLibraryEvent['kind'],
    componentId: String(r.component_id),
    actorId: String(r.actor_id),
    actorKind: r.actor_kind as 'human' | 'agent',
    createdAt: tsToMs(r.created_at),
  };
  if (r.version != null) evt.version = String(r.version);
  if (r.payload_ref != null) evt.payloadRef = String(r.payload_ref);
  return evt;
}

export function rowToListing(row: Record<string, unknown>): MarketplaceListing {
  const r = row as Row;
  const listing: MarketplaceListing = {
    id: String(r.id),
    catalogId: String(r.catalog_id),
    sellerId: String(r.seller_id),
    title: String(r.title),
    description: String(r.description ?? ''),
    status: r.status as MarketplaceListing['status'],
    isFree: Boolean(r.is_free),
    tags: parseJson<string[]>(r.tags) ?? [],
    createdAt: tsToMs(r.created_at),
    updatedAt: tsToMs(r.updated_at),
  };
  if (r.price_cents != null) listing.priceCents = Number(r.price_cents);
  if (r.currency != null) listing.currency = String(r.currency);
  if (r.preview != null) listing.preview = parseJson<Record<string, unknown>>(r.preview);
  if (r.published_at_ms != null) listing.publishedAt = bigintToNum(r.published_at_ms);
  if (r.deprecated_at_ms != null) listing.deprecatedAt = bigintToNum(r.deprecated_at_ms);
  return listing;
}

export function rowToReview(row: Record<string, unknown>): Review {
  const r = row as Row;
  return {
    id: String(r.id),
    listingId: String(r.listing_id),
    reviewerId: String(r.reviewer_id),
    rating: Number(r.rating),
    body: String(r.body ?? ''),
    status: r.status as Review['status'],
    verifiedBuyer: Boolean(r.verified_buyer),
    createdAt: tsToMs(r.created_at),
  };
}

export function rowToLicenseGrant(row: Record<string, unknown>): LicenseGrant {
  const r = row as Row;
  const grant: LicenseGrant = {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    catalogId: String(r.catalog_id),
    version: String(r.version),
    licenseId: String(r.license_id),
    seats: Number(r.seats),
    signedToken: String(r.signed_token),
    issuedAt: bigintToNum(r.issued_at_ms),
    expiresAt: bigintToNum(r.expires_at_ms),
    createdAt: tsToMs(r.created_at),
  };
  if (r.user_id != null) grant.userId = String(r.user_id);
  if (r.listing_id != null) grant.listingId = String(r.listing_id);
  if (r.revoked_at_ms != null) grant.revokedAt = bigintToNum(r.revoked_at_ms);
  if (r.offline_grace_until_ms != null)
    grant.offlineGraceUntil = bigintToNum(r.offline_grace_until_ms);
  return grant;
}

export function rowToRevenueEvent(row: Record<string, unknown>): RevenueEvent {
  const r = row as Row;
  return {
    id: String(r.id),
    listingId: String(r.listing_id),
    sellerId: String(r.seller_id),
    workspaceId: String(r.workspace_id),
    currency: String(r.currency),
    grossCents: Number(r.gross_cents),
    feeCents: Number(r.fee_cents),
    netCents: Number(r.net_cents),
    payoutStatus: r.payout_status as RevenueEvent['payoutStatus'],
    periodMonth: String(r.period_month),
    eventType: String(r.event_type),
    createdAt: tsToMs(r.created_at),
  };
}

export function rowToTemplate(row: Record<string, unknown>): Template {
  const r = row as Row;
  const tmpl: Template = {
    id: String(r.id),
    kind: r.kind as Template['kind'],
    name: String(r.name),
    description: String(r.description ?? ''),
    placeholders: parseJson<Template['placeholders']>(r.placeholders) ?? [],
    authorId: String(r.author_id),
    createdAt: tsToMs(r.created_at),
    updatedAt: tsToMs(r.updated_at),
  };
  if (r.deck_json != null) tmpl.deckJson = parseJson<Record<string, unknown>>(r.deck_json);
  if (r.preview != null) tmpl.preview = parseJson<Record<string, unknown>>(r.preview);
  return tmpl;
}

export function rowToSectionTemplate(row: Record<string, unknown>): SectionTemplate {
  const r = row as Row;
  return {
    id: String(r.id),
    templateId: String(r.template_id),
    name: String(r.name),
    slides: parseJson<Record<string, unknown>[]>(r.slides) ?? [],
    spreadable: Boolean(r.spreadable),
    createdAt: tsToMs(r.created_at),
  };
}

export function rowToStickerPack(row: Record<string, unknown>): StickerPack {
  const r = row as Row;
  return {
    id: String(r.id),
    name: String(r.name),
    theme: String(r.theme),
    informalOnly: Boolean(r.informal_only),
    stickerComponentIds: parseJson<string[]>(r.sticker_component_ids) ?? [],
    createdAt: tsToMs(r.created_at),
  };
}

export function rowToBrandLock(row: Record<string, unknown>): BrandLockRegion {
  const r = row as Row;
  return {
    id: String(r.id),
    deckId: String(r.deck_id),
    scope: r.scope as BrandLockRegion['scope'],
    strictness: r.strictness as BrandLockRegion['strictness'],
    allowedOverrides: parseJson<string[]>(r.allowed_overrides) ?? [],
    ownerUserId: String(r.owner_user_id),
    sceneGraphSelector: String(r.scene_graph_selector),
    createdAt: tsToMs(r.created_at),
    updatedAt: tsToMs(r.updated_at),
  };
}

export function rowToIcon(row: Record<string, unknown>): IconRecord {
  const r = row as Row;
  const icon: IconRecord = {
    id: String(r.id),
    name: String(r.name),
    synonyms: Array.isArray(r.synonyms) ? r.synonyms : (parseJson<string[]>(r.synonyms) ?? []),
    styles: Array.isArray(r.styles) ? r.styles : (parseJson<string[]>(r.styles) ?? []),
    pathData: String(r.path_data),
    viewBox: String(r.view_box ?? '0 0 24 24'),
    vendor: String(r.vendor),
    licenseId: String(r.license_id),
    createdAt: tsToMs(r.created_at),
  };
  if (r.perceptual_hash != null) icon.perceptualHash = String(r.perceptual_hash);
  return icon;
}

export function rowToAuditRow(row: Record<string, unknown>): AuditRow {
  const r = row as Row;
  return {
    id: String(r.id),
    actorId: String(r.actor_id),
    actorKind: r.actor_kind as 'human' | 'agent',
    action: String(r.action),
    resourceType: String(r.resource_type),
    resourceId: String(r.resource_id),
    detail: parseJson<Record<string, unknown>>(r.detail) ?? {},
    createdAt: tsToMs(r.created_at),
  };
}

// ---------------------------------------------------------------------------
// SqlStore — implements every RegistryStore method with parameterized SQL.
//
// Tables defined by migrations 0011–0015:
//   component_packages, component_variants, smart_component_prop,
//   user_library, team_library, team_library_event,
//   marketplace_listing, marketplace_review, license_grant, revenue_share_event,
//   template, section_template, sticker_pack, brand_lock_region, icons
//
// Tables NOT in migrations 0011–0015 (blob + audit storage):
//   stored_blobs, audit_log
// These are assumed to exist; see comments above each method.
// ---------------------------------------------------------------------------

export class SqlStore implements RegistryStore {
  constructor(private pool: Pool) {}

  // ---- blobs ----
  // NOTE: stored_blobs table is NOT in migrations 0011–0015.
  // Assumed schema:
  //   CREATE TABLE stored_blobs (
  //     sha256    text PRIMARY KEY,
  //     bytes     bytea NOT NULL,
  //     stored_at timestamptz NOT NULL DEFAULT now()
  //   );

  async putBlob(blob: StoredBlob): Promise<void> {
    await this.pool.query(
      `INSERT INTO stored_blobs (sha256, bytes, stored_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (sha256) DO NOTHING`,
      [blob.sha256, blob.bytes, new Date(blob.storedAt)],
    );
  }

  async getBlob(sha256: string): Promise<StoredBlob | undefined> {
    const { rows } = await this.pool.query(
      'SELECT sha256, bytes, stored_at FROM stored_blobs WHERE sha256 = $1',
      [sha256],
    );
    if (rows.length === 0) return undefined;
    const r = rows[0] as Row;
    return {
      sha256: String(r.sha256),
      bytes: new Uint8Array(r.bytes as Buffer),
      storedAt: tsToMs(r.stored_at),
    };
  }

  async hasBlob(sha256: string): Promise<boolean> {
    const { rows } = await this.pool.query('SELECT 1 FROM stored_blobs WHERE sha256 = $1', [
      sha256,
    ]);
    return rows.length > 0;
  }

  // ---- component catalog ----

  async putPackage(pkg: ComponentPackage): Promise<void> {
    const row = pkgToRow(pkg);
    await this.pool.query(
      `INSERT INTO component_packages
         (id, catalog_id, version, kind, name, description, category, author, license_id,
          props_schema, variants, files, package_hash, signing_key_id, signature, deprecation,
          size_budget_bytes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (catalog_id, version) DO UPDATE SET
         id = EXCLUDED.id,
         kind = EXCLUDED.kind,
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         author = EXCLUDED.author,
         license_id = EXCLUDED.license_id,
         props_schema = EXCLUDED.props_schema,
         variants = EXCLUDED.variants,
         files = EXCLUDED.files,
         package_hash = EXCLUDED.package_hash,
         signing_key_id = EXCLUDED.signing_key_id,
         signature = EXCLUDED.signature,
         deprecation = EXCLUDED.deprecation,
         size_budget_bytes = EXCLUDED.size_budget_bytes,
         updated_at = EXCLUDED.updated_at`,
      [
        row.id,
        row.catalog_id,
        row.version,
        row.kind,
        row.name,
        row.description,
        row.category,
        row.author,
        row.license_id,
        row.props_schema,
        row.variants,
        row.files,
        row.package_hash,
        row.signing_key_id,
        row.signature,
        row.deprecation,
        row.size_budget_bytes,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  async getPackage(catalogId: string, version: string): Promise<ComponentPackage | undefined> {
    const { rows } = await this.pool.query(
      'SELECT * FROM component_packages WHERE catalog_id = $1 AND version = $2',
      [catalogId, version],
    );
    return rows.length > 0 ? rowToPackage(rows[0] as Record<string, unknown>) : undefined;
  }

  async getPackageById(id: string): Promise<ComponentPackage | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM component_packages WHERE id = $1', [id]);
    return rows.length > 0 ? rowToPackage(rows[0] as Record<string, unknown>) : undefined;
  }

  async listPackages(opts?: {
    kind?: string;
    category?: string;
    limit?: number;
  }): Promise<ComponentPackage[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.kind) {
      params.push(opts.kind);
      conditions.push(`kind = $${params.length}`);
    }
    if (opts?.category) {
      params.push(opts.category);
      conditions.push(`category = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts?.limit ? `LIMIT ${Number(opts.limit)}` : '';
    const { rows } = await this.pool.query(
      `SELECT * FROM component_packages ${where} ORDER BY created_at DESC ${limit}`,
      params,
    );
    return rows.map((r) => rowToPackage(r as Record<string, unknown>));
  }

  async listVersions(catalogId: string): Promise<ComponentPackage[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM component_packages WHERE catalog_id = $1 ORDER BY created_at DESC',
      [catalogId],
    );
    return rows.map((r) => rowToPackage(r as Record<string, unknown>));
  }

  async searchPackages(
    query: string,
    opts?: { kind?: string; limit?: number },
  ): Promise<ComponentPackage[]> {
    const conditions: string[] = ['(name ILIKE $1 OR catalog_id ILIKE $1 OR description ILIKE $1)'];
    const params: unknown[] = [`%${query}%`];
    if (opts?.kind) {
      params.push(opts.kind);
      conditions.push(`kind = $${params.length}`);
    }
    const limit = opts?.limit ? `LIMIT ${Number(opts.limit)}` : '';
    const { rows } = await this.pool.query(
      `SELECT * FROM component_packages WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC ${limit}`,
      params,
    );
    return rows.map((r) => rowToPackage(r as Record<string, unknown>));
  }

  async deletePackage(catalogId: string, version: string): Promise<void> {
    await this.pool.query('DELETE FROM component_packages WHERE catalog_id = $1 AND version = $2', [
      catalogId,
      version,
    ]);
  }

  async putSmartProps(componentId: string, props: SmartProp[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM smart_component_prop WHERE component_id = $1', [componentId]);
      for (const prop of props) {
        await client.query(
          `INSERT INTO smart_component_prop (component_id, prop_key, prop_schema, control_hint, required, default_value)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            componentId,
            prop.propKey,
            prop.propSchema,
            prop.controlHint ?? null,
            prop.required,
            prop.default ?? null,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getSmartProps(componentId: string): Promise<SmartProp[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM smart_component_prop WHERE component_id = $1',
      [componentId],
    );
    return rows.map((r) => rowToSmartProp(r as Record<string, unknown>));
  }

  // ---- user library ----

  async putLibraryItem(item: UserLibraryItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_library
         (id, user_id, workspace_id, catalog_id, installed_version, pin_mode, pin_value, license_grant_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, workspace_id, catalog_id) DO UPDATE SET
         id = EXCLUDED.id,
         installed_version = EXCLUDED.installed_version,
         pin_mode = EXCLUDED.pin_mode,
         pin_value = EXCLUDED.pin_value,
         license_grant_id = EXCLUDED.license_grant_id,
         updated_at = EXCLUDED.updated_at`,
      [
        item.id,
        item.userId,
        item.workspaceId,
        item.catalogId,
        item.installedVersion,
        item.pinMode,
        item.pinValue ?? null,
        item.licenseGrantId ?? null,
        new Date(item.createdAt),
        new Date(item.updatedAt),
      ],
    );
  }

  async getLibraryItem(
    userId: string,
    workspaceId: string,
    catalogId: string,
  ): Promise<UserLibraryItem | undefined> {
    const { rows } = await this.pool.query(
      'SELECT * FROM user_library WHERE user_id = $1 AND workspace_id = $2 AND catalog_id = $3',
      [userId, workspaceId, catalogId],
    );
    return rows.length > 0 ? rowToLibraryItem(rows[0] as Record<string, unknown>) : undefined;
  }

  async listLibraryItems(userId: string, workspaceId: string): Promise<UserLibraryItem[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM user_library WHERE user_id = $1 AND workspace_id = $2 ORDER BY created_at DESC',
      [userId, workspaceId],
    );
    return rows.map((r) => rowToLibraryItem(r as Record<string, unknown>));
  }

  async deleteLibraryItem(userId: string, workspaceId: string, catalogId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM user_library WHERE user_id = $1 AND workspace_id = $2 AND catalog_id = $3',
      [userId, workspaceId, catalogId],
    );
  }

  // ---- team library ----

  async putTeamLibrary(lib: TeamLibrary): Promise<void> {
    await this.pool.query(
      `INSERT INTO team_library
         (id, workspace_id, name, policy_mode, owner_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (workspace_id, name) DO UPDATE SET
         id = EXCLUDED.id,
         policy_mode = EXCLUDED.policy_mode,
         owner_id = EXCLUDED.owner_id,
         updated_at = EXCLUDED.updated_at`,
      [
        lib.id,
        lib.workspaceId,
        lib.name,
        lib.policyMode,
        lib.ownerId,
        new Date(lib.createdAt),
        new Date(lib.updatedAt),
      ],
    );
  }

  async getTeamLibrary(id: string): Promise<TeamLibrary | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM team_library WHERE id = $1', [id]);
    return rows.length > 0 ? rowToTeamLibrary(rows[0] as Record<string, unknown>) : undefined;
  }

  async listTeamLibraries(workspaceId: string): Promise<TeamLibrary[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM team_library WHERE workspace_id = $1 ORDER BY created_at DESC',
      [workspaceId],
    );
    return rows.map((r) => rowToTeamLibrary(r as Record<string, unknown>));
  }

  // ---- library events (append-only log) ----

  async appendLibraryEvent(event: TeamLibraryEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO team_library_event
         (id, library_id, seq, kind, component_id, version, payload_ref, actor_id, actor_kind, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (library_id, seq) DO NOTHING`,
      [
        event.id,
        event.libraryId,
        event.seq,
        event.kind,
        event.componentId,
        event.version ?? null,
        event.payloadRef ?? null,
        event.actorId,
        event.actorKind,
        new Date(event.createdAt),
      ],
    );
  }

  async listLibraryEvents(
    libraryId: string,
    afterSeq?: number,
    limit?: number,
  ): Promise<TeamLibraryEvent[]> {
    const seq = afterSeq ?? 0;
    const lim = limit ?? 100;
    const { rows } = await this.pool.query(
      'SELECT * FROM team_library_event WHERE library_id = $1 AND seq > $2 ORDER BY seq ASC LIMIT $3',
      [libraryId, seq, lim],
    );
    return rows.map((r) => rowToLibraryEvent(r as Record<string, unknown>));
  }

  async latestLibrarySeq(libraryId: string): Promise<number> {
    const { rows } = await this.pool.query(
      'SELECT COALESCE(MAX(seq), 0) AS max_seq FROM team_library_event WHERE library_id = $1',
      [libraryId],
    );
    return bigintToNum(rows[0]?.max_seq ?? 0);
  }

  // ---- marketplace ----

  async putListing(listing: MarketplaceListing): Promise<void> {
    await this.pool.query(
      `INSERT INTO marketplace_listing
         (id, catalog_id, seller_id, title, description, status, is_free,
          price_cents, currency, tags, preview, published_at_ms, deprecated_at_ms,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         catalog_id = EXCLUDED.catalog_id,
         seller_id = EXCLUDED.seller_id,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         status = EXCLUDED.status,
         is_free = EXCLUDED.is_free,
         price_cents = EXCLUDED.price_cents,
         currency = EXCLUDED.currency,
         tags = EXCLUDED.tags,
         preview = EXCLUDED.preview,
         published_at_ms = EXCLUDED.published_at_ms,
         deprecated_at_ms = EXCLUDED.deprecated_at_ms,
         updated_at = EXCLUDED.updated_at`,
      [
        listing.id,
        listing.catalogId,
        listing.sellerId,
        listing.title,
        listing.description,
        listing.status,
        listing.isFree,
        listing.priceCents ?? null,
        listing.currency ?? null,
        listing.tags,
        listing.preview ?? null,
        listing.publishedAt ?? null,
        listing.deprecatedAt ?? null,
        new Date(listing.createdAt),
        new Date(listing.updatedAt),
      ],
    );
  }

  async getListing(id: string): Promise<MarketplaceListing | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM marketplace_listing WHERE id = $1', [id]);
    return rows.length > 0 ? rowToListing(rows[0] as Record<string, unknown>) : undefined;
  }

  async getListingByCatalogId(catalogId: string): Promise<MarketplaceListing | undefined> {
    const { rows } = await this.pool.query(
      'SELECT * FROM marketplace_listing WHERE catalog_id = $1 LIMIT 1',
      [catalogId],
    );
    return rows.length > 0 ? rowToListing(rows[0] as Record<string, unknown>) : undefined;
  }

  async listListings(opts?: {
    status?: string;
    sellerId?: string;
    limit?: number;
  }): Promise<MarketplaceListing[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.status) {
      params.push(opts.status);
      conditions.push(`status = $${params.length}`);
    }
    if (opts?.sellerId) {
      params.push(opts.sellerId);
      conditions.push(`seller_id = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts?.limit ? `LIMIT ${Number(opts.limit)}` : '';
    const { rows } = await this.pool.query(
      `SELECT * FROM marketplace_listing ${where} ORDER BY created_at DESC ${limit}`,
      params,
    );
    return rows.map((r) => rowToListing(r as Record<string, unknown>));
  }

  async searchListings(
    query: string,
    opts?: { status?: string; tags?: string[]; limit?: number },
  ): Promise<MarketplaceListing[]> {
    const conditions: string[] = [
      '(title ILIKE $1 OR description ILIKE $1 OR catalog_id ILIKE $1)',
    ];
    const params: unknown[] = [`%${query}%`];
    if (opts?.status) {
      params.push(opts.status);
      conditions.push(`status = $${params.length}`);
    }
    if (opts?.tags?.length) {
      params.push(JSON.stringify(opts.tags));
      conditions.push(`tags @> $${params.length}::jsonb`);
    }
    const limit = opts?.limit ? `LIMIT ${Number(opts.limit)}` : '';
    const { rows } = await this.pool.query(
      `SELECT * FROM marketplace_listing WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC ${limit}`,
      params,
    );
    return rows.map((r) => rowToListing(r as Record<string, unknown>));
  }

  async putReview(review: Review): Promise<void> {
    await this.pool.query(
      `INSERT INTO marketplace_review
         (id, listing_id, reviewer_id, rating, body, status, verified_buyer, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         listing_id = EXCLUDED.listing_id,
         reviewer_id = EXCLUDED.reviewer_id,
         rating = EXCLUDED.rating,
         body = EXCLUDED.body,
         status = EXCLUDED.status,
         verified_buyer = EXCLUDED.verified_buyer`,
      [
        review.id,
        review.listingId,
        review.reviewerId,
        review.rating,
        review.body,
        review.status,
        review.verifiedBuyer,
        new Date(review.createdAt),
      ],
    );
  }

  async getReview(id: string): Promise<Review | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM marketplace_review WHERE id = $1', [id]);
    return rows.length > 0 ? rowToReview(rows[0] as Record<string, unknown>) : undefined;
  }

  async listReviews(listingId: string, status?: string): Promise<Review[]> {
    let sql = 'SELECT * FROM marketplace_review WHERE listing_id = $1';
    const params: unknown[] = [listingId];
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await this.pool.query(sql, params);
    return rows.map((r) => rowToReview(r as Record<string, unknown>));
  }

  async listReviewsByStatus(status: string, limit = 100): Promise<Review[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM marketplace_review WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
      [status, limit],
    );
    return rows.map((r) => rowToReview(r as Record<string, unknown>));
  }

  // ---- license grants ----

  async putLicenseGrant(grant: LicenseGrant): Promise<void> {
    await this.pool.query(
      `INSERT INTO license_grant
         (id, workspace_id, user_id, catalog_id, version, listing_id, license_id,
          seats, signed_token, issued_at_ms, expires_at_ms, revoked_at_ms,
          offline_grace_until_ms, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         workspace_id = EXCLUDED.workspace_id,
         user_id = EXCLUDED.user_id,
         catalog_id = EXCLUDED.catalog_id,
         version = EXCLUDED.version,
         listing_id = EXCLUDED.listing_id,
         license_id = EXCLUDED.license_id,
         seats = EXCLUDED.seats,
         signed_token = EXCLUDED.signed_token,
         issued_at_ms = EXCLUDED.issued_at_ms,
         expires_at_ms = EXCLUDED.expires_at_ms,
         revoked_at_ms = EXCLUDED.revoked_at_ms,
         offline_grace_until_ms = EXCLUDED.offline_grace_until_ms`,
      [
        grant.id,
        grant.workspaceId,
        grant.userId ?? null,
        grant.catalogId,
        grant.version,
        grant.listingId ?? null,
        grant.licenseId,
        grant.seats,
        grant.signedToken,
        grant.issuedAt,
        grant.expiresAt,
        grant.revokedAt ?? null,
        grant.offlineGraceUntil ?? null,
        new Date(grant.createdAt),
      ],
    );
  }

  async getLicenseGrant(licenseId: string): Promise<LicenseGrant | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM license_grant WHERE id = $1', [
      licenseId,
    ]);
    return rows.length > 0 ? rowToLicenseGrant(rows[0] as Record<string, unknown>) : undefined;
  }

  async listLicenseGrants(workspaceId: string, catalogId?: string): Promise<LicenseGrant[]> {
    let sql = 'SELECT * FROM license_grant WHERE workspace_id = $1';
    const params: unknown[] = [workspaceId];
    if (catalogId) {
      params.push(catalogId);
      sql += ` AND catalog_id = $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await this.pool.query(sql, params);
    return rows.map((r) => rowToLicenseGrant(r as Record<string, unknown>));
  }

  async revokeLicenseGrant(licenseId: string, revokedAt: number): Promise<void> {
    await this.pool.query('UPDATE license_grant SET revoked_at_ms = $1 WHERE id = $2', [
      revokedAt,
      licenseId,
    ]);
  }

  // ---- revenue events ----

  async appendRevenueEvent(event: RevenueEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO revenue_share_event
         (id, listing_id, seller_id, workspace_id, currency, gross_cents,
          fee_cents, net_cents, payout_status, period_month, event_type, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO NOTHING`,
      [
        event.id,
        event.listingId,
        event.sellerId,
        event.workspaceId,
        event.currency,
        event.grossCents,
        event.feeCents,
        event.netCents,
        event.payoutStatus,
        event.periodMonth,
        event.eventType,
        new Date(event.createdAt),
      ],
    );
  }

  async listRevenueEvents(sellerId: string, periodMonth?: string): Promise<RevenueEvent[]> {
    let sql = 'SELECT * FROM revenue_share_event WHERE seller_id = $1';
    const params: unknown[] = [sellerId];
    if (periodMonth) {
      params.push(periodMonth);
      sql += ` AND period_month = $${params.length}`;
    }
    sql += ' ORDER BY created_at ASC';
    const { rows } = await this.pool.query(sql, params);
    return rows.map((r) => rowToRevenueEvent(r as Record<string, unknown>));
  }

  // ---- templates ----

  async putTemplate(t: Template): Promise<void> {
    await this.pool.query(
      `INSERT INTO template
         (id, kind, name, description, deck_json, placeholders, author_id, preview,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         kind = EXCLUDED.kind,
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         deck_json = EXCLUDED.deck_json,
         placeholders = EXCLUDED.placeholders,
         author_id = EXCLUDED.author_id,
         preview = EXCLUDED.preview,
         updated_at = EXCLUDED.updated_at`,
      [
        t.id,
        t.kind,
        t.name,
        t.description,
        t.deckJson ?? null,
        t.placeholders,
        t.authorId,
        t.preview ?? null,
        new Date(t.createdAt),
        new Date(t.updatedAt),
      ],
    );
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM template WHERE id = $1', [id]);
    return rows.length > 0 ? rowToTemplate(rows[0] as Record<string, unknown>) : undefined;
  }

  async listTemplates(kind?: string): Promise<Template[]> {
    let sql = 'SELECT * FROM template';
    const params: unknown[] = [];
    if (kind) {
      params.push(kind);
      sql += ` WHERE kind = $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await this.pool.query(sql, params);
    return rows.map((r) => rowToTemplate(r as Record<string, unknown>));
  }

  async putSectionTemplate(s: SectionTemplate): Promise<void> {
    await this.pool.query(
      `INSERT INTO section_template
         (id, template_id, name, slides, spreadable, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET
         template_id = EXCLUDED.template_id,
         name = EXCLUDED.name,
         slides = EXCLUDED.slides,
         spreadable = EXCLUDED.spreadable`,
      [s.id, s.templateId, s.name, s.slides, s.spreadable, new Date(s.createdAt)],
    );
  }

  async listSectionTemplates(templateId: string): Promise<SectionTemplate[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM section_template WHERE template_id = $1 ORDER BY created_at ASC',
      [templateId],
    );
    return rows.map((r) => rowToSectionTemplate(r as Record<string, unknown>));
  }

  // ---- sticker packs ----

  async putStickerPack(pack: StickerPack): Promise<void> {
    await this.pool.query(
      `INSERT INTO sticker_pack
         (id, name, theme, informal_only, sticker_component_ids, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         theme = EXCLUDED.theme,
         informal_only = EXCLUDED.informal_only,
         sticker_component_ids = EXCLUDED.sticker_component_ids`,
      [
        pack.id,
        pack.name,
        pack.theme,
        pack.informalOnly,
        pack.stickerComponentIds,
        new Date(pack.createdAt),
      ],
    );
  }

  async listStickerPacks(theme?: string): Promise<StickerPack[]> {
    let sql = 'SELECT * FROM sticker_pack';
    const params: unknown[] = [];
    if (theme) {
      params.push(theme);
      sql += ` WHERE theme = $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await this.pool.query(sql, params);
    return rows.map((r) => rowToStickerPack(r as Record<string, unknown>));
  }

  // ---- brand locks ----

  async putBrandLock(lock: BrandLockRegion): Promise<void> {
    await this.pool.query(
      `INSERT INTO brand_lock_region
         (id, deck_id, scope, strictness, allowed_overrides, owner_user_id,
          scene_graph_selector, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         deck_id = EXCLUDED.deck_id,
         scope = EXCLUDED.scope,
         strictness = EXCLUDED.strictness,
         allowed_overrides = EXCLUDED.allowed_overrides,
         owner_user_id = EXCLUDED.owner_user_id,
         scene_graph_selector = EXCLUDED.scene_graph_selector,
         updated_at = EXCLUDED.updated_at`,
      [
        lock.id,
        lock.deckId,
        lock.scope,
        lock.strictness,
        lock.allowedOverrides,
        lock.ownerUserId,
        lock.sceneGraphSelector,
        new Date(lock.createdAt),
        new Date(lock.updatedAt),
      ],
    );
  }

  async getBrandLock(id: string): Promise<BrandLockRegion | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM brand_lock_region WHERE id = $1', [id]);
    return rows.length > 0 ? rowToBrandLock(rows[0] as Record<string, unknown>) : undefined;
  }

  async listBrandLocks(deckId: string): Promise<BrandLockRegion[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM brand_lock_region WHERE deck_id = $1 ORDER BY created_at DESC',
      [deckId],
    );
    return rows.map((r) => rowToBrandLock(r as Record<string, unknown>));
  }

  async deleteBrandLock(id: string): Promise<void> {
    await this.pool.query('DELETE FROM brand_lock_region WHERE id = $1', [id]);
  }

  // ---- icons ----

  async putIcon(icon: IconRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO icons
         (id, name, synonyms, styles, path_data, view_box, vendor, license_id,
          perceptual_hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (vendor, name) DO UPDATE SET
         id = EXCLUDED.id,
         synonyms = EXCLUDED.synonyms,
         styles = EXCLUDED.styles,
         path_data = EXCLUDED.path_data,
         view_box = EXCLUDED.view_box,
         license_id = EXCLUDED.license_id,
         perceptual_hash = EXCLUDED.perceptual_hash`,
      [
        icon.id,
        icon.name,
        icon.synonyms,
        icon.styles,
        icon.pathData,
        icon.viewBox,
        icon.vendor,
        icon.licenseId,
        icon.perceptualHash ?? null,
        new Date(icon.createdAt),
      ],
    );
  }

  async getIcon(id: string): Promise<IconRecord | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM icons WHERE id = $1', [id]);
    return rows.length > 0 ? rowToIcon(rows[0] as Record<string, unknown>) : undefined;
  }

  async searchIcons(query: string, opts?: { limit?: number }): Promise<IconRecord[]> {
    const lim = opts?.limit ?? 100;
    const { rows } = await this.pool.query(
      `SELECT * FROM icons
       WHERE name ILIKE $1 OR $1 = ANY(synonyms)
       ORDER BY created_at DESC
       LIMIT $2`,
      [`%${query}%`, lim],
    );
    return rows.map((r) => rowToIcon(r as Record<string, unknown>));
  }

  async findIconsByHash(hash: string, limit = 10): Promise<IconRecord[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM icons WHERE perceptual_hash = $1 ORDER BY created_at DESC LIMIT $2',
      [hash, limit],
    );
    return rows.map((r) => rowToIcon(r as Record<string, unknown>));
  }

  async countIcons(): Promise<number> {
    const { rows } = await this.pool.query('SELECT COUNT(*) AS cnt FROM icons');
    return Number(rows[0]?.cnt ?? 0);
  }

  // ---- audit ----
  // NOTE: audit_log table is NOT in migrations 0011–0015.
  // Assumed schema:
  //   CREATE TABLE audit_log (
  //     id            uuid PRIMARY KEY,
  //     actor_id      text NOT NULL,
  //     actor_kind    text NOT NULL,
  //     action        text NOT NULL,
  //     resource_type text NOT NULL,
  //     resource_id   text NOT NULL,
  //     detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  //     created_at    timestamptz NOT NULL DEFAULT now()
  //   );

  async appendAudit(row: AuditRow): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_log
         (id, actor_id, actor_kind, action, resource_type, resource_id, detail, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        row.id,
        row.actorId,
        row.actorKind,
        row.action,
        row.resourceType,
        row.resourceId,
        row.detail,
        new Date(row.createdAt),
      ],
    );
  }

  async listAudit(actorKind?: string, limit = 50): Promise<AuditRow[]> {
    let sql = 'SELECT * FROM audit_log';
    const params: unknown[] = [];
    if (actorKind) {
      params.push(actorKind);
      sql += ` WHERE actor_kind = $${params.length}`;
    }
    sql += ` ORDER BY created_at DESC LIMIT ${Number(limit)}`;
    const { rows } = await this.pool.query(sql, params);
    return rows.map((r) => rowToAuditRow(r as Record<string, unknown>));
  }
}
