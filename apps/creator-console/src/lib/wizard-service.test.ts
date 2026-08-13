/**
 * wizard-service — tests.
 *
 * Per Wave 9 §S9.2 acceptance: services ship with at least one test
 * that asserts the public shape. We cover the five key lifecycle
 * transitions the listing-creation wizard relies on.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  addAsset,
  createDraft,
  removeAsset,
  saveDetails,
  savePricing,
  submitForReview,
  updateAssetProgress,
  __test,
} from './wizard-service.js';

afterEach(() => {
  __test.drafts.clear();
  __test.assets.clear();
});

const FULL_DETAILS = {
  title: 'Hero Card',
  description: 'A bold hero card component.',
  tags: ['hero', 'card'],
  category: 'component' as const,
  license_id: 'lic-1',
};

describe('wizard-service', () => {
  it('createDraft returns a draft with step="details"', async () => {
    const draft = await createDraft();
    expect(draft.step).toBe('details');
    expect(draft.details).toBeNull();
    expect(draft.assets).toHaveLength(0);
    expect(draft.pricing).toBeNull();
    expect(typeof draft.id).toBe('string');
  });

  it('saveDetails advances step to "media" when all required fields are present', async () => {
    const draft = await createDraft();
    const updated = await saveDetails(draft.id, FULL_DETAILS);
    expect(updated.step).toBe('media');
    expect(updated.details?.title).toBe('Hero Card');
  });

  it('saveDetails keeps step="details" when required fields are missing', async () => {
    const draft = await createDraft();
    const updated = await saveDetails(draft.id, {
      ...FULL_DETAILS,
      title: '',
    });
    expect(updated.step).toBe('details');
  });

  it('addAsset returns an upload with a presigned_url', async () => {
    const draft = await createDraft();
    const file = new File(['hello'], 'cover.png', { type: 'image/png' });
    const upload = await addAsset(draft.id, 'cover', file);
    expect(upload.kind).toBe('cover');
    expect(upload.filename).toBe('cover.png');
    expect(upload.size_bytes).toBe(5);
    expect(upload.presigned_url).toMatch(/^https:\/\/uploads\.example\.com\//);
    expect(upload.status).toBe('queued');
    expect(upload.progress_pct).toBe(0);
  });

  it('updateAssetProgress marks the upload completed at 100%', async () => {
    const draft = await createDraft();
    const file = new File(['x'], 'gallery.png', { type: 'image/png' });
    const upload = await addAsset(draft.id, 'gallery', file);
    const done = await updateAssetProgress(upload.id, 100);
    expect(done.progress_pct).toBe(100);
    expect(done.status).toBe('completed');
    expect(done.uploaded_url).not.toBeNull();
  });

  it('removeAsset removes the upload from the draft', async () => {
    const draft = await createDraft();
    const file = new File(['x'], 'video.mp4', { type: 'video/mp4' });
    const upload = await addAsset(draft.id, 'video', file);
    await removeAsset(upload.id);
    const after = __test.drafts.get(draft.id);
    expect(after?.assets ?? []).toHaveLength(0);
  });

  it('savePricing advances to pricing step when details + pricing are valid', async () => {
    const draft = await createDraft();
    await saveDetails(draft.id, FULL_DETAILS);
    const updated = await savePricing(draft.id, {
      model: 'one_time',
      price_cents: 1900,
      currency: 'USD',
      subscription_interval: null,
      royalty_bps: null,
    });
    expect(updated.step).toBe('pricing');
    expect(updated.pricing?.price_cents).toBe(1900);
  });

  it('submitForReview returns a MarketplaceListing with status="in_review"', async () => {
    const draft = await createDraft();
    await saveDetails(draft.id, FULL_DETAILS);
    await savePricing(draft.id, {
      model: 'one_time',
      price_cents: 1900,
      currency: 'USD',
      subscription_interval: null,
      royalty_bps: null,
    });
    const listing = await submitForReview(draft.id);
    expect(listing.status).toBe('in_review');
    expect(listing.title).toBe('Hero Card');
    expect(listing.kind).toBe('component');
    expect(listing.is_free).toBe(false);
    expect(listing.price_cents).toBe(1900);
    expect(listing.currency).toBe('USD');
  });

  it('submitForReview throws when details are missing', async () => {
    const draft = await createDraft();
    await savePricing(draft.id, {
      model: 'free',
      price_cents: 0,
      currency: 'USD',
      subscription_interval: null,
      royalty_bps: null,
    });
    await expect(submitForReview(draft.id)).rejects.toThrow(/incomplete/);
  });
});
