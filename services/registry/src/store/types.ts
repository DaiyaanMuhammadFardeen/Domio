/**
 * Registry store entity types.
 *
 * These mirror the Phase 06 migrations (0011–0015). The store interface keeps
 * the service logic testable against an in-memory store while the SQL store
 * maps 1:1 to these shapes.
 */

export type ComponentKind = 'component' | 'icon' | 'sticker' | 'animation';

export interface ComponentPackage {
  id: string;
  catalogId: string;
  version: string;
  kind: ComponentKind;
  name: string;
  description: string;
  category?: string;
  author?: string;
  licenseId?: string;
  propsSchema: Record<string, unknown>;
  variants: ComponentVariant[];
  files: Record<string, string>; // logical name -> sha256 (content-addressed)
  packageHash: string;
  signingKeyId?: string;
  signature?: string;
  deprecation?: { reason: string; replaceWith?: string; deprecatedAt: number } | null;
  sizeBudgetBytes: number;
  createdAt: number;
  updatedAt: number;
}

export interface ComponentVariant {
  id: string;
  label: string;
  tokens: Record<string, string>;
}

export interface SmartProp {
  propKey: string;
  propSchema: Record<string, unknown>;
  controlHint?: string;
  required: boolean;
  default?: unknown;
}

export interface UserLibraryItem {
  id: string;
  userId: string;
  workspaceId: string;
  catalogId: string;
  installedVersion: string;
  pinMode: 'track-latest' | 'pin-version' | 'pin-range' | 'workspace-managed';
  pinValue?: string;
  licenseGrantId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TeamLibrary {
  id: string;
  workspaceId: string;
  name: string;
  policyMode: 'latest' | 'patch' | 'minor' | 'pinned';
  ownerId: string;
  createdAt: number;
  updatedAt: number;
}

export type LibraryEventKind =
  | 'component_published'
  | 'component_updated'
  | 'component_removed'
  | 'policy_changed';

export interface TeamLibraryEvent {
  id: string;
  libraryId: string;
  seq: number;
  kind: LibraryEventKind;
  componentId: string;
  version?: string;
  payloadRef?: string;
  actorId: string;
  actorKind: 'human' | 'agent';
  createdAt: number;
}

export type ListingStatus = 'draft' | 'in_review' | 'published' | 'deprecated' | 'removed';

export interface MarketplaceListing {
  id: string;
  catalogId: string;
  sellerId: string;
  title: string;
  description: string;
  status: ListingStatus;
  isFree: boolean;
  priceCents?: number;
  currency?: string;
  tags: string[];
  preview?: Record<string, unknown>;
  publishedAt?: number;
  deprecatedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Review {
  id: string;
  listingId: string;
  reviewerId: string;
  rating: number; // 1..5
  body: string;
  status: 'queued' | 'accepted' | 'auto_flagged' | 'removed';
  verifiedBuyer: boolean;
  createdAt: number;
}

export interface LicenseGrant {
  id: string;
  workspaceId: string;
  userId?: string;
  catalogId: string;
  version: string;
  listingId?: string;
  licenseId: string;
  seats: number;
  signedToken: string;
  issuedAt: number;
  expiresAt: number;
  revokedAt?: number;
  offlineGraceUntil?: number;
  createdAt: number;
}

export type PayoutStatus = 'pending' | 'eligible' | 'refunded';

export interface RevenueEvent {
  id: string;
  listingId: string;
  sellerId: string;
  workspaceId: string;
  currency: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  payoutStatus: PayoutStatus;
  periodMonth: string;
  eventType: string;
  createdAt: number;
}

export type TemplateKind = 'full_deck' | 'section';

export interface Template {
  id: string;
  kind: TemplateKind;
  name: string;
  description: string;
  deckJson?: Record<string, unknown>;
  placeholders: TemplatePlaceholder[];
  authorId: string;
  preview?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface TemplatePlaceholder {
  id: string;
  key: string;
  label: string;
  kind: 'text' | 'number' | 'asset' | 'component' | 'table' | 'boolean';
  required: boolean;
  default?: unknown;
  /** Source prop binding, e.g. "slide[0].elements[1].props.label". */
  binding?: string;
}

export interface SectionTemplate {
  id: string;
  templateId: string;
  name: string;
  slides: Record<string, unknown>[];
  spreadable: boolean;
  createdAt: number;
}

export interface StickerPack {
  id: string;
  name: string;
  theme: string;
  informalOnly: boolean;
  stickerComponentIds: string[];
  createdAt: number;
}

export type LockScope = 'slide' | 'element' | 'region';
export type LockStrictness = 'strict' | 'color-only' | 'text-only';

export interface BrandLockRegion {
  id: string;
  deckId: string;
  scope: LockScope;
  strictness: LockStrictness;
  allowedOverrides: string[];
  ownerUserId: string;
  sceneGraphSelector: string;
  createdAt: number;
  updatedAt: number;
}

export interface IconRecord {
  id: string;
  name: string;
  synonyms: string[];
  styles: string[];
  pathData: string;
  viewBox: string;
  vendor: string;
  licenseId: string;
  perceptualHash?: string;
  createdAt: number;
}

export interface StoredBlob {
  sha256: string;
  bytes: Uint8Array;
  storedAt: number;
}
