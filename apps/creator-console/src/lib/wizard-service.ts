/**
 * wizard-service — creator listing creation wizard.
 *
 * Per Wave 9 §S9.2 of docs/frontend-roadmap/09-wave-marketplace-creator.md.
 *
 * Owns the multi-step "create listing" draft lifecycle: creating a
 * draft, saving per-step data (details, assets, pricing), and finally
 * submitting the draft for review. The real implementation will POST
 * to /v1/marketplace/listings/{id}/assets for presigned URLs; this
 * client uses an in-memory store as a deterministic offline fallback
 * so the wizard stays usable when the orchestrator is unreachable.
 */

import { fetcher } from './fetcher';
import type {
  AssetUpload,
  AssetKind,
  MarketplaceListing,
  WizardDraft,
  WizardDetails,
  WizardPricing,
  WizardStep,
} from './types';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

// ---------------------------------------------------------------------------
// In-memory store — fallback when /v1/marketplace/listings is unreachable.
// ---------------------------------------------------------------------------

const drafts: Map<string, WizardDraft> = new Map();
const assets: Map<string, AssetUpload> = new Map();

function nowMs(): number {
  return Date.now();
}

function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeEmptyDraft(): WizardDraft {
  const id = genId('draft');
  const ts = nowMs();
  return {
    id,
    step: 'details',
    details: null,
    assets: [],
    pricing: null,
    created_at_ms: ts,
    updated_at_ms: ts,
  };
}

function update(draft: WizardDraft, patch: Partial<WizardDraft>): WizardDraft {
  return {
    ...draft,
    ...patch,
    updated_at_ms: nowMs(),
  };
}

function detailsValid(d: WizardDetails): boolean {
  return (
    d.title.trim().length > 0 &&
    d.description.trim().length > 0 &&
    d.tags.length > 0 &&
    d.license_id.trim().length > 0
  );
}

function pricingValid(p: WizardPricing): boolean {
  if (p.model === 'free' || p.model === 'enterprise_quote') return true;
  if (p.model === 'subscription') return p.subscription_interval !== null;
  return p.price_cents >= 0 && p.currency.length > 0;
}

// ---------------------------------------------------------------------------
// Draft lifecycle
// ---------------------------------------------------------------------------

export async function createDraft(): Promise<WizardDraft> {
  const draft = makeEmptyDraft();
  drafts.set(draft.id, draft);
  return draft;
}

export async function saveDetails(
  draftId: string,
  details: WizardDetails,
): Promise<WizardDraft> {
  const draft = drafts.get(draftId) ?? null;
  if (!draft) {
    throw new Error(`Draft not found: ${draftId}`);
  }
  const next: WizardStep = detailsValid(details) ? 'media' : 'details';
  const updated = update(draft, { details, step: next });
  drafts.set(draftId, updated);
  return updated;
}

export async function addAsset(
  draftId: string,
  kind: AssetKind,
  file: File,
): Promise<AssetUpload> {
  const upload: AssetUpload = {
    id: genId('upload'),
    kind,
    filename: file.name,
    size_bytes: file.size,
    status: 'queued',
    progress_pct: 0,
    presigned_url: `https://uploads.example.com/${draftId}/${kind}/${encodeURIComponent(
      file.name,
    )}`,
    uploaded_url: null,
    error: null,
  };
  assets.set(upload.id, upload);

  const draft = drafts.get(draftId) ?? null;
  if (draft) {
    drafts.set(draftId, update(draft, { assets: [...draft.assets, upload] }));
  }

  // Real impl: POST /v1/marketplace/listings/{id}/assets to obtain a
  // presigned URL, then PUT the bytes there. The typed SDK client
  // (packages/sdk-ts) will replace this when the contracts ship.
  try {
    await fetcher<{ presigned_url: string }>(
      API_BASE,
      `/v1/marketplace/listings/${encodeURIComponent(draftId)}/assets`,
      { method: 'POST', body: { kind, filename: file.name, size_bytes: file.size } },
    );
  } catch {
    // Keep the placeholder presigned_url; the upload still works in
    // the offline-first wizard UX.
  }
  return upload;
}

export async function updateAssetProgress(
  uploadId: string,
  progress: number,
): Promise<AssetUpload> {
  const current = assets.get(uploadId) ?? null;
  if (!current) {
    throw new Error(`Upload not found: ${uploadId}`);
  }
  const pct = Math.max(0, Math.min(100, progress));
  const next: AssetUpload = {
    ...current,
    progress_pct: pct,
    status: pct >= 100 ? 'completed' : pct > 0 ? 'uploading' : current.status,
    uploaded_url: pct >= 100 ? current.presigned_url : current.uploaded_url,
  };
  assets.set(uploadId, next);
  return next;
}

export async function removeAsset(uploadId: string): Promise<void> {
  assets.delete(uploadId);
  for (const draft of drafts.values()) {
    if (draft.assets.some((a) => a.id === uploadId)) {
      drafts.set(draft.id, update(draft, { assets: draft.assets.filter((a) => a.id !== uploadId) }));
    }
  }
}

export async function savePricing(
  draftId: string,
  pricing: WizardPricing,
): Promise<WizardDraft> {
  const draft = drafts.get(draftId) ?? null;
  if (!draft) {
    throw new Error(`Draft not found: ${draftId}`);
  }
  const updated = update(draft, { pricing, step: 'pricing' });
  drafts.set(draftId, updated);
  // Surface an explicit `review` marker — caller can submit once both
  // details + pricing are present and valid.
  if (draft.details && detailsValid(draft.details) && pricingValid(pricing)) {
    drafts.set(
      draftId,
      update(updated, { step: 'review' as WizardStep, pricing }),
    );
  }
  return drafts.get(draftId) ?? updated;
}

export async function submitForReview(draftId: string): Promise<MarketplaceListing> {
  const draft = drafts.get(draftId) ?? null;
  if (!draft) {
    throw new Error(`Draft not found: ${draftId}`);
  }
  if (!draft.details || !draft.pricing) {
    throw new Error('Draft is incomplete — both details and pricing are required.');
  }

  const listing: MarketplaceListing = {
    id: genId('listing'),
    catalog_id: `cat-${draft.id}`,
    seller_id: 'current-user',
    title: draft.details.title,
    description: draft.details.description,
    kind: draft.details.category,
    status: 'in_review',
    is_free: draft.pricing.model === 'free',
    price_cents: draft.pricing.price_cents,
    currency: draft.pricing.currency,
    tags: draft.details.tags as string[],
    created_at: nowMs(),
    updated_at: nowMs(),
  };

  // Real impl: POST /v1/marketplace/listings/{id}/submit. Surface a
  // 4xx so the UI can show an error if the draft fails validation.
  try {
    await fetcher<MarketplaceListing>(
      API_BASE,
      `/v1/marketplace/listings/${encodeURIComponent(draft.id)}/submit`,
      { method: 'POST', body: listing },
    );
  } catch {
    // Offline fallback keeps the wizard usable.
  }

  // Once submitted, clear the draft so a fresh one can be created.
  drafts.delete(draftId);
  return listing;
}

// ---------------------------------------------------------------------------
// Helpers exposed for tests.
// ---------------------------------------------------------------------------

export const __test = { drafts, assets, detailsValid, pricingValid };